import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, ToolCall, ToolDefinition } from './ai.service';
import { callAnthropic } from './anthropic-client';

// The website chatbot on a client's Anthropic key. The chatbot speaks
// OpenAI's tool format (OpenRouter's); this translates both ways.

export function toAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters as Anthropic.Tool.InputSchema,
  }));
}

export function toAnthropicConversation(messages: ChatMessage[]): {
  system?: string;
  messages: Anthropic.MessageParam[];
} {
  const system: string[] = [];
  const out: Anthropic.MessageParam[] = [];
  // tool_use ids this request carries; saved history keeps tool results but
  // not the assistant turn that asked for them, and a tool_result without its
  // tool_use is a 400 — those become plain text.
  const toolUseIds = new Set<string>();
  const push = (role: 'user' | 'assistant', blocks: Anthropic.ContentBlockParam[]) => {
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) {
      (last.content as Anthropic.ContentBlockParam[]).push(...blocks);
    } else {
      out.push({ role, content: blocks });
    }
  };

  for (const m of messages) {
    if (m.role === 'system') {
      if (m.content) system.push(m.content);
    } else if (m.role === 'user') {
      if (m.content) push('user', [{ type: 'text', text: m.content }]);
    } else if (m.role === 'assistant') {
      const blocks: Anthropic.ContentBlockParam[] = [];
      if (m.content) blocks.push({ type: 'text', text: m.content });
      for (const call of m.tool_calls ?? []) {
        toolUseIds.add(call.id);
        blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseArgs(call.function.arguments) });
      }
      if (blocks.length) push('assistant', blocks);
    } else if (m.role === 'tool') {
      const content = m.content ?? '';
      if (m.tool_call_id && toolUseIds.has(m.tool_call_id)) {
        push('user', [{ type: 'tool_result', tool_use_id: m.tool_call_id, content }]);
      } else {
        push('user', [{ type: 'text', text: `Earlier search result: ${content}` }]);
      }
    }
  }
  // The conversation must open with the visitor and end with them (these
  // models take no assistant prefill).
  while (out.length && out[0].role !== 'user') out.shift();
  while (out.length && out[out.length - 1].role !== 'user') out.pop();
  return { system: system.length ? system.join('\n\n') : undefined, messages: out };
}

function parseArgs(args: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(args || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export async function anthropicCompleteWithTools(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  tools: ToolDefinition[] | undefined,
  maxTokens: number,
  call?: { timeoutMs?: number; maxRetries?: number },
): Promise<{ content: string | null; toolCalls: ToolCall[]; usage: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
  const conversation = toAnthropicConversation(messages);
  const response = await callAnthropic(
    apiKey,
    model,
    maxTokens,
    { ...conversation, tools: tools?.length ? toAnthropicTools(tools) : undefined },
    call?.timeoutMs ?? 120_000,
    call?.maxRetries,
  );
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  const toolCalls: ToolCall[] = response.content
    .filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
    .map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
  const promptTokens = response.usage.input_tokens;
  const completionTokens = response.usage.output_tokens;
  return {
    content: response.stop_reason === 'refusal' ? null : text || null,
    toolCalls,
    usage: { promptTokens, completionTokens, totalTokens: promptTokens + completionTokens },
  };
}
