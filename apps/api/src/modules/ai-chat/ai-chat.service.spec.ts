import { AiChatService } from './ai-chat.service';

// The parts of the website chat that don't need the AI: which earlier
// messages are replayed, and which chats expire.

function make(over: { messages?: unknown[]; conversations?: unknown[]; tenants?: Record<number, unknown> } = {}) {
  const updates: { where: Record<string, unknown>; set: Record<string, unknown> }[] = [];
  const conversationRepo = {
    createQueryBuilder: () => ({
      select: () => ({ where: () => ({ getRawMany: async () => over.conversations ?? [] }) }),
    }),
    update: async (where: Record<string, unknown>, set: Record<string, unknown>) => {
      updates.push({ where, set });
      return { affected: 1 };
    },
  };
  const messageRepo = { find: async () => over.messages ?? [], findOne: async () => null };
  const tenantRepo = { findOne: async ({ where }: { where: { id: number } }) => over.tenants?.[where.id] ?? null };
  const service = new AiChatService(
    conversationRepo as never,
    messageRepo as never,
    tenantRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  return { service, updates };
}

describe('AiChatService history', () => {
  it('replays only user and assistant messages, starting with a user one', async () => {
    const { service } = make({
      messages: [
        { role: 'assistant', content: 'stray' },
        { role: 'user', content: 'villa?' },
        { role: 'tool', content: '{"total":3}', toolCallId: 'c1' },
        { role: 'assistant', content: 'Found 3' },
        { role: 'system', content: 'x' },
        { role: 'user', content: 'cheaper' },
      ],
    });
    const history = await (service as unknown as { loadHistory: (id: number, s: object) => Promise<{ role: string; content: string }[]> }).loadHistory(1, {});
    expect(history).toEqual([
      { role: 'user', content: 'villa?' },
      { role: 'assistant', content: 'Found 3' },
      { role: 'user', content: 'cheaper' },
    ]);
  });
});

describe('AiChatService.closeExpired', () => {
  it("uses each tenant's expiry days (default 7)", async () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const { service, updates } = make({
      conversations: [{ tenantId: 2 }, { tenantId: '3' }],
      tenants: { 2: { id: 2, settings: { aiChatConversationTTLDays: 30 } }, 3: { id: 3, settings: {} } },
    });
    const closed = await service.closeExpired(now);
    expect(closed).toBe(4);
    const cutoffs = updates.map((u) => ({ tenantId: u.where.tenantId, value: (u.where.lastMessageAt ?? u.where.createdAt) as { value?: Date } }));
    expect(updates.every((u) => u.set.status === 'closed' && u.where.status === 'active')).toBe(true);
    expect(cutoffs[0].tenantId).toBe(2);
    expect((cutoffs[0].value as unknown as { _value: Date })._value.toISOString()).toBe('2026-09-23T12:00:00.000Z');
    expect(cutoffs[2].tenantId).toBe(3);
    expect((cutoffs[2].value as unknown as { _value: Date })._value.toISOString()).toBe('2026-10-16T12:00:00.000Z');
  });
});

describe('AiChatService.processMessage tool rounds', () => {
  // A model that asks for a tool every round: Anthropic rejects a request
  // whose history holds tool calls/results but carries no tools.
  function chatWith(replies: { content: string | null; toolCalls: unknown[] }[]) {
    const calls: { tools: unknown }[] = [];
    const saved: { role: string; content: string }[] = [];
    let round = 0;
    const conversation = { id: 9, sessionId: 'tok', status: 'active', messageCount: 0, language: null };
    const service = new AiChatService(
      { findOne: async () => null, create: (x: object) => x, save: async (x: object) => ({ ...conversation, ...x, id: 9 }) } as never,
      { find: async () => [], findOne: async () => null, count: async () => 0, create: (x: object) => x, save: async (x: { role: string; content: string }) => { saved.push(x); return x; } } as never,
      { findOne: async () => ({ id: 1, featureFlags: { aiChatbot: true }, settings: { aiChatEnabled: true, aiChatAutoEmailAdmin: false } }) } as never,
      {
        chatCompletionWithTools: async (_t: number, _m: unknown, tools: unknown) => {
          calls.push({ tools });
          const r = replies[Math.min(round++, replies.length - 1)];
          return { ...r, usage: { totalTokens: 1 } };
        },
      } as never,
      {} as never,
      {
        getTools: () => [{ type: 'function', function: { name: 'search_properties' } }],
        executeTool: async () => ({ name: 'search_properties', result: { properties: [{ reference: 'R1' }], total: 1 } }),
      } as never,
      { buildSystemPrompt: async () => 'sys' } as never,
      {} as never,
    );
    return { service, calls, saved };
  }
  const toolCall = { id: 'c1', type: 'function', function: { name: 'search_properties', arguments: '{}' } };

  async function run(service: AiChatService) {
    const events: { type: string; data: Record<string, unknown> }[] = [];
    for await (const e of service.processMessage(1, { message: 'villa?' } as never)) events.push(e as never);
    return events;
  }

  it('sends tools on every round and ends with the fallback when the model keeps calling tools', async () => {
    const { service, calls, saved } = chatWith([{ content: null, toolCalls: [toolCall] }]);
    const events = await run(service);
    expect(calls).toHaveLength(3);
    expect(calls.every((c) => Array.isArray(c.tools) && (c.tools as unknown[]).length === 1)).toBe(true);
    // Only the first two rounds' tool calls run; their property cards stay.
    expect(events.filter((e) => e.type === 'tool_result')).toHaveLength(2);
    expect(events.find((e) => e.type === 'tool_result')?.data.properties).toEqual([{ reference: 'R1' }]);
    expect(events.some((e) => e.type === 'error')).toBe(false);
    const deltas = events.filter((e) => e.type === 'delta');
    expect(deltas).toHaveLength(1);
    expect(String(deltas[0].data.content)).toMatch(/unable to complete/);
    expect(events[events.length - 1].type).toBe('done');
    expect(saved.filter((m) => m.role === 'assistant')).toHaveLength(1);
  });

  it("uses the model's text on the last round even if it also asks for tools", async () => {
    const { service, calls } = chatWith([
      { content: null, toolCalls: [toolCall] },
      { content: null, toolCalls: [toolCall] },
      { content: 'Here are the villas.', toolCalls: [toolCall] },
    ]);
    const events = await run(service);
    expect(calls[2].tools).toBeDefined();
    expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(2);
    expect(events.filter((e) => e.type === 'delta').map((e) => e.data.content)).toEqual(['Here are the villas.']);
    expect(events[events.length - 1].type).toBe('done');
  });
});
