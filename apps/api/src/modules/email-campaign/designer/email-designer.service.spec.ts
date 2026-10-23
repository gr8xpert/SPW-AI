import { BadRequestException } from '@nestjs/common';
import { EmailDesignerService, isDesignModel } from './email-designer.service';
import { fakeManager, fakeRepo } from './test-fake-repo';
import { EmailTemplate, EmailTemplateAiMessage, EmailTemplateVersion } from '../../../database/entities';

// incr + expire in one MULTI, as the service sends them.
function fakeRedis(count: number | Error) {
  const ops: string[][] = [];
  const multi = () => {
    const chain: any = {
      incr: (k: string) => { ops.push(['incr', k]); return chain; },
      expire: (k: string, s: number) => { ops.push(['expire', k, String(s)]); return chain; },
      exec: async () => {
        if (count instanceof Error) throw count;
        return [[null, count], [null, 1]];
      },
    };
    return chain;
  };
  return { ops, multi };
}

// The AI is a script of canned responses: no real provider is ever called.
function setup(script: any[], opts: { hasKey?: boolean; acquired?: boolean; lockError?: boolean; redisCount?: number | Error; images?: string[] } = {}) {
  const template: any = { id: 7, tenantId: 2, name: 'T', subject: '', bodyHtml: '' };
  const templates = fakeRepo<any>([template]);
  const messageRepo = fakeRepo<any>([]);
  const messages = messageRepo.rows;
  const versionRepo = fakeRepo<any>([]);
  const versions = versionRepo.rows;
  const recordManagers: unknown[] = [];
  const manager = fakeManager(new Map<unknown, any>([[EmailTemplate, templates], [EmailTemplateAiMessage, messageRepo], [EmailTemplateVersion, versionRepo]]));
  (templates as any).manager = manager;
  const calls: any[] = [];
  const touched: string[] = [];
  const added: string[][] = [];
  const ai = {
    hasClientKey: async () => opts.hasKey ?? true,
    clientModel: async () => ({ provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5' }),
    chatCompletionWithTools: async (_t: number, msgs: any[], tools: any, options?: any) => {
      calls.push({ msgs: [...msgs], tools, options });
      const next = script.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next();
      return next;
    },
  };
  const deps = {
    ai,
    versions: {
      record: async (_t: number, _id: number, v: any, em?: any) => {
        recordManagers.push(em);
        return (em ?? manager).getRepository(EmailTemplateVersion).save({ ...v });
      },
    },
    memory: { get: async () => ['No emojis'], add: async (_t: number, n: string[]) => { added.push(n); } },
    images: {
      touch: async (_t: number, html: string) => { touched.push(html); },
      list: async () => ({ images: (opts.images ?? []).map((url, i) => ({ id: i + 1, url })) }),
    },
    content: { context: async () => ({ agency: 'Sun', color: '#0055aa', agencyInfo: { logo: null, phone: '+34', email: 'i@s', website: '' }, defaultLang: 'en' }) },
    lock: {
      keys: [] as Array<{ key: string; ttl: number }>,
      async withLock(key: string, ttl: number, fn: () => Promise<unknown>) {
        this.keys.push({ key, ttl });
        if (opts.lockError) return { acquired: false, error: true };
        if (opts.acquired === false) return { acquired: false };
        return { acquired: true, result: await fn() };
      },
    },
    redis: opts.redisCount === undefined ? null : fakeRedis(opts.redisCount),
  };
  const svc = new EmailDesignerService(templates as any, messageRepo as any, deps.ai as any, deps.versions as any, deps.memory as any, deps.images as any, deps.content as any, deps.lock as any, deps.redis as any);
  return { svc, template, templates, messages, messageRepo, versionRepo, versions, recordManagers, manager, calls, touched, added, lock: deps.lock, redis: deps.redis };
}

const tool = (name: string, args: unknown) => ({ id: `c-${name}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
const answer = (content: string | null, toolCalls: any[] = []) => ({ content, toolCalls, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } });

describe('EmailDesignerService.send', () => {
  it('creates a design, saves it as a version and the chat', async () => {
    const { svc, template, messages, versions, calls, touched } = setup([
      answer(null, [tool('replace_html', { html: '<p>Hi {{contact.first_name}}</p>{{unsubscribe_link}}' }), tool('set_subject', { subject: 'Hello' })]),
      answer('Done: a simple welcome email.'),
    ]);
    const out = await svc.send(2, 7, { message: 'Make a welcome email' });
    expect(out.changed).toBe(true);
    expect(out.reply).toBe('Done: a simple welcome email.');
    expect(template.bodyHtml).toContain('Hi {{contact.first_name}}');
    expect(template.subject).toBe('Hello');
    expect(versions[0].source).toBe('ai');
    expect(messages.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(messages[1].versionId).toBe(1);
    expect(calls[0].msgs[0].content).toContain('No emojis');
    expect(touched).toHaveLength(1);
  });

  it('falls back from a failed edit to a full rewrite in the same turn', async () => {
    const { svc, template } = setup([
      answer(null, [tool('edit_html', { edits: [{ find: 'missing', replace: 'x' }] })]),
      answer(null, [tool('replace_html', { html: '<p>Fixed</p>{{unsubscribe_link}}' })]),
      answer('Changed the text.'),
    ]);
    template.bodyHtml = '<p>Old</p>{{unsubscribe_link}}';
    const out = await svc.send(2, 7, { message: 'Change the text' });
    expect(out.bodyHtml).toContain('Fixed');
  });

  it('keeps the previous design when the model never produces a valid one', async () => {
    const { svc, template, versions, messages } = setup([
      answer(null, [tool('replace_html', { html: '{{#properties}}<p>x</p>' })]),
      answer(null, [tool('replace_html', { html: '{{#properties}}<p>y</p>' })]),
      answer(null, [tool('replace_html', { html: '{{#properties}}' })]),
      answer('Sorry.'),
    ]);
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    const out = await svc.send(2, 7, { message: 'Break it' });
    expect(out.changed).toBe(false);
    expect(out.versionId).toBeNull();
    expect(template.bodyHtml).toContain('Keep');
    expect(versions).toHaveLength(0);
    // F6: tools ran but nothing changed → our message, not the model's text.
    expect(out.reply).toBe("The AI couldn't apply that change — try rephrasing");
    expect(messages[1].content).toBe("The AI couldn't apply that change — try rephrasing");
  });

  it('refuses without a client key', async () => {
    const { svc } = setup([], { hasKey: false });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'NO_AI_KEY' } });
  });

  it('sends the tools on every round (Anthropic refuses tool history without tools)', async () => {
    const { svc, calls } = setup([
      answer(null, [tool('set_subject', { subject: 'a' })]),
      answer(null, [tool('set_subject', { subject: 'b' })]),
      answer(null, [tool('set_subject', { subject: 'c' })]),
      answer('ok'),
    ]);
    await svc.send(2, 7, { message: 'x' });
    expect(calls).toHaveLength(4);
    expect(calls.every((c: any) => Array.isArray(c.tools) && c.tools.length)).toBe(true);
  });

  it('ends after 4 rounds of tool calls without running the last ones, keeping earlier valid work', async () => {
    const { svc, calls, template, versions } = setup([
      answer(null, [tool('replace_html', { html: '<p>One</p>{{unsubscribe_link}}' })]),
      answer(null, [tool('set_subject', { subject: 'Two' })]),
      answer(null, [tool('edit_html', { edits: [{ find: 'One', replace: 'Three' }] })]),
      answer(null, [tool('replace_html', { html: '<p>Never applied</p>{{unsubscribe_link}}' })]),
    ]);
    const out = await svc.send(2, 7, { message: 'x' });
    expect(calls).toHaveLength(4);
    expect(out.changed).toBe(true);
    expect(template.bodyHtml).toContain('Three');
    expect(template.bodyHtml).not.toContain('Never applied');
    expect(template.subject).toBe('Two');
    expect(versions).toHaveLength(1);
    expect(out.reply).toBe("Here's the updated design.");
  });

  it('uses the model text when the last round has tool calls and text', async () => {
    const { svc } = setup([
      answer(null, [tool('set_subject', { subject: 'a' })]),
      answer(null, [tool('set_subject', { subject: 'b' })]),
      answer(null, [tool('set_subject', { subject: 'c' })]),
      answer('Subject updated.', [tool('set_subject', { subject: 'd' })]),
    ]);
    const out = await svc.send(2, 7, { message: 'x' });
    expect(out.subject).toBe('c');
    expect(out.reply).toBe('Subject updated.');
  });

  it('a change that ends up identical to the original is not reported as done', async () => {
    const { svc, template, versions } = setup([
      answer(null, [tool('replace_html', { html: '<p>Same</p>{{unsubscribe_link}}' }), tool('set_subject', { subject: 'S' })]),
      answer('Done, updated it.'),
    ]);
    template.bodyHtml = '<p>Same</p>{{unsubscribe_link}}';
    template.subject = 'S';
    const out = await svc.send(2, 7, { message: 'x' });
    expect(out.changed).toBe(false);
    expect(versions).toHaveLength(0);
    expect(out.reply).toBe("The AI couldn't apply that change — try rephrasing");
  });

  it('saves only body and subject, so other fields changed during the turn survive', async () => {
    const { svc, template, templates } = setup([
      () => { template.name = 'Renamed meanwhile'; return answer(null, [tool('replace_html', { html: '<p>AI</p>{{unsubscribe_link}}' }), tool('set_subject', { subject: 'Hi' })]); },
      answer('Done.'),
    ]);
    const saveSpy = jest.spyOn(templates, 'save');
    const updateSpy = jest.spyOn(templates, 'update');
    await svc.send(2, 7, { message: 'x' });
    expect(saveSpy).not.toHaveBeenCalled();
    expect(updateSpy).toHaveBeenCalledWith({ id: 7, tenantId: 2 }, { bodyHtml: expect.stringContaining('AI'), subject: 'Hi' });
    expect(template.name).toBe('Renamed meanwhile');
  });

  it('records a version from a starter layout as source "layout"', async () => {
    const { svc, versions } = setup([answer(null, [tool('use_layout', { name: 'minimal' })]), answer('Started from Minimal.')]);
    const out = await svc.send(2, 7, { message: 'Use a minimal layout' });
    expect(out.changed).toBe(true);
    expect(versions[0].source).toBe('layout');
  });

  it('a layout edited later in the turn is an AI version', async () => {
    const { svc, versions } = setup([
      answer(null, [tool('use_layout', { name: 'minimal' }), tool('replace_html', { html: '<p>Mine</p>{{unsubscribe_link}}' })]),
      answer('Done.'),
    ]);
    await svc.send(2, 7, { message: 'x' });
    expect(versions[0].source).toBe('ai');
  });

  it('saves nothing when the provider fails (F5)', async () => {
    const { svc, messages, versions, template } = setup([new BadRequestException('OpenRouter account has insufficient credits.')]);
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'DESIGNER_FAILED', message: 'OpenRouter account has insufficient credits.' } });
    expect(messages).toHaveLength(0);
    expect(versions).toHaveLength(0);
    expect(template.bodyHtml).toContain('Keep');
  });

  it('a provider failure after a valid change in an earlier round still saves nothing', async () => {
    const { svc, messages, versions, template } = setup([
      answer(null, [tool('replace_html', { html: '<p>New</p>{{unsubscribe_link}}' })]),
      new Error('socket hang up'),
    ]);
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'DESIGNER_FAILED' } });
    expect(messages).toHaveLength(0);
    expect(versions).toHaveLength(0);
    expect(template.bodyHtml).toContain('Keep');
  });

  it('times out the whole turn and saves nothing (F4)', async () => {
    const { svc, messages, versions, template } = setup([
      answer(null, [tool('replace_html', { html: '<p>New</p>{{unsubscribe_link}}' })]),
      () => new Promise(() => undefined),
    ]);
    svc.turnTimeoutMs = 40;
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({
      response: { code: 'DESIGNER_TIMEOUT', message: 'The AI took too long — try a shorter request' },
    });
    expect(messages).toHaveLength(0);
    expect(versions).toHaveLength(0);
    expect(template.bodyHtml).toContain('Keep');
  });

  it('holds the per-template lock longer than the turn deadline', async () => {
    const { svc, lock } = setup([answer('Hi')]);
    await svc.send(2, 7, { message: 'x' });
    expect(lock.keys[0].key).toBe('email-designer:7');
    expect(svc.turnTimeoutMs).toBe(90_000);
    expect(lock.keys[0].ttl).toBeGreaterThanOrEqual(svc.turnTimeoutMs + 30_000);
  });

  it('says busy when another turn holds the lock', async () => {
    const { svc } = setup([], { acquired: false });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'DESIGNER_BUSY' }, status: 409 });
  });

  it('says unavailable (503), not busy, when Redis is down for the lock', async () => {
    const { svc, calls } = setup([answer('x')], { lockError: true });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({
      response: { code: 'DESIGNER_UNAVAILABLE', message: 'The AI designer is temporarily unavailable — try again in a minute' },
      status: 503,
    });
    expect(calls).toHaveLength(0);
  });

  it('says unavailable (503) when the hourly counter cannot reach Redis', async () => {
    const { svc, calls, messages } = setup([answer('x')], { redisCount: new Error('Connection is closed.') });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'DESIGNER_UNAVAILABLE' }, status: 503 });
    expect(calls).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it('saves the design, its version and the chat in one transaction: a failed chat row saves nothing', async () => {
    const { svc, template, messageRepo, messages, versions, recordManagers, manager, touched } = setup([
      answer(null, [tool('replace_html', { html: '<p>New</p>{{unsubscribe_link}}' }), tool('set_subject', { subject: 'Fresh' })]),
      answer('Done.'),
    ]);
    template.bodyHtml = '<p>Keep</p>{{unsubscribe_link}}';
    template.subject = 'Old';
    const realSave = messageRepo.save;
    (messageRepo as any).save = async (r: any) => {
      if (r.role === 'assistant') throw new Error('db down');
      return realSave(r);
    };
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toThrow('db down');
    expect(template.bodyHtml).toBe('<p>Keep</p>{{unsubscribe_link}}');
    expect(template.subject).toBe('Old');
    expect(versions).toHaveLength(0);
    expect(messages).toHaveLength(0);
    expect(recordManagers[0]).toBe(manager.ems[0]);
    expect(touched).toHaveLength(0);
  });

  it('writes the template, version and chat only through the transaction', async () => {
    const { svc, templates, messageRepo, versionRepo, manager } = setup([
      answer(null, [tool('replace_html', { html: '<p>New</p>{{unsubscribe_link}}' })]),
      answer('Done.'),
    ]);
    await svc.send(2, 7, { message: 'x' });
    expect(manager.transactions).toBe(1);
    expect(manager.ems[0].writes).toEqual(['EmailTemplate.update', 'EmailTemplateVersion.save', 'EmailTemplateAiMessage.save', 'EmailTemplateAiMessage.save']);
    expect([...templates.outsideWrites, ...messageRepo.outsideWrites, ...versionRepo.outsideWrites]).toEqual([]);
  });

  it('enforces the hourly limit', async () => {
    const { svc, calls } = setup([answer('x')], { redisCount: 31 });
    await expect(svc.send(2, 7, { message: 'x' })).rejects.toMatchObject({ response: { code: 'DESIGNER_RATE_LIMIT' }, status: 429 });
    expect(calls).toHaveLength(0);
  });

  it('counts turns with incr and expire in one atomic MULTI', async () => {
    const { svc, redis } = setup([answer('x')], { redisCount: 1 });
    await svc.send(2, 7, { message: 'x' });
    expect((redis as any).ops.map((o: string[]) => o[0])).toEqual(['incr', 'expire']);
    expect((redis as any).ops[1][2]).toBe('3600');
  });

  it('only accepts image URLs from this client\'s library (F7)', async () => {
    const { svc } = setup([], { images: ['http://localhost:3001/uploads/a.webp'] });
    await expect(svc.send(2, 7, { message: 'x', imageUrls: ['https://evil.example/x.png'] })).rejects.toMatchObject({ response: { code: 'IMAGE_UNKNOWN' }, status: 400 });
  });

  it('passes library images to the model', async () => {
    const url = 'http://localhost:3001/uploads/a.webp';
    const { svc, calls, messages } = setup([answer('ok')], { images: [url] });
    await svc.send(2, 7, { message: 'Use this photo', imageUrls: [url] });
    expect(calls[0].msgs.at(-1).content).toContain(url);
    expect(messages[0].content).toContain(url);
  });

  it('does not find another client\'s template', async () => {
    const { svc } = setup([answer('x')]);
    await expect(svc.send(3, 7, { message: 'x' })).rejects.toMatchObject({ status: 404 });
    await expect(svc.history(3, 7)).rejects.toMatchObject({ status: 404 });
  });

  it('stores brand notes the model saved, and replies to plain questions with the model text', async () => {
    const { svc, added } = setup([answer(null, [tool('save_brand_note', { note: 'Prefers gold' })]), answer('Noted.')]);
    const out = await svc.send(2, 7, { message: 'I always like gold' });
    expect(added).toEqual([['Prefers gold']]);
    expect(out.reply).toBe('Noted.');
    expect(out.changed).toBe(false);
  });

  it('sends earlier turns as history and returns them oldest first', async () => {
    const { svc, calls } = setup([answer('first'), answer('second')]);
    await svc.send(2, 7, { message: 'one' });
    await svc.send(2, 7, { message: 'two' });
    expect(calls[1].msgs.map((m: any) => m.content).slice(1)).toEqual(['one', 'first', 'two']);
    const h = await svc.history(2, 7);
    expect(h.map((m) => m.content)).toEqual(['one', 'first', 'two', 'second']);
  });
});

describe('EmailDesignerService.status', () => {
  it('reports the client model and whether it is good for design', async () => {
    const { svc } = setup([]);
    await expect(svc.status(2)).resolves.toEqual({ addon: true, hasKey: true, provider: 'openrouter', model: 'anthropic/claude-sonnet-5.5', modelOk: true });
  });
});

describe('isDesignModel', () => {
  it('accepts strong models and rejects small ones', () => {
    expect(isDesignModel('claude-sonnet-5-5')).toBe(true);
    expect(isDesignModel('anthropic/claude-opus-5.5')).toBe(true);
    expect(isDesignModel('openai/gpt-4.1')).toBe(true);
    expect(isDesignModel('google/gemini-2.5-pro')).toBe(true);
    expect(isDesignModel('claude-haiku-5-5')).toBe(false);
    expect(isDesignModel('openai/gpt-4o-mini')).toBe(false);
  });
  it('does not mistake "gemini" for "mini" (F1)', () => {
    expect(isDesignModel('google/gemini-3-pro')).toBe(true);
    expect(isDesignModel('openai/gpt-5-mini')).toBe(false);
    expect(isDesignModel('openai/gpt-4.1-nano')).toBe(false);
    expect(isDesignModel('google/gemini-2.5-flash-lite')).toBe(false);
    expect(isDesignModel('meta-llama/llama-3.1-8b-instruct')).toBe(false);
  });
});

describe('EmailDesignerService provider limits', () => {
  it('gives each provider call what is left of the turn, with no retries', async () => {
    const { svc, calls } = setup([answer(null, [tool('set_subject', { subject: 'a' })]), answer('ok')]);
    await svc.send(2, 7, { message: 'x' });
    for (const c of calls) {
      expect(c.options.maxRetries).toBe(0);
      expect(c.options.timeoutMs).toBeGreaterThanOrEqual(5_000);
      expect(c.options.timeoutMs).toBeLessThan(90_000);
    }
  });

  it('never asks for less than 5 s', async () => {
    const { svc, calls } = setup([answer('ok')]);
    (svc as any).turnTimeoutMs = 3_000;
    await svc.send(2, 7, { message: 'x' });
    expect(calls[0].options.timeoutMs).toBe(5_000);
  });

  it('stores at most 4000 characters of the assistant reply', async () => {
    const { svc, messages } = setup([answer('a'.repeat(5000))]);
    const out = await svc.send(2, 7, { message: 'x' });
    expect(messages[1].content).toHaveLength(4000);
    expect(messages[1].content.endsWith('…')).toBe(true);
    expect(out.reply).toBe(messages[1].content);
  });
});
