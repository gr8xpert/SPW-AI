import Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage, MultimodalMessage } from './ai.service';

// Direct Anthropic API calls (no OpenRouter in between). Used for the
// platform key (ANTHROPIC_API_KEY in .env, decided 2026-10-23: our monthly
// Anthropic credit pays for platform AI work before OpenRouter does).

export const DEFAULT_ANTHROPIC_MODEL = 'claude-haiku-5-5';

// Models a client can pick with their own Anthropic key (Settings → AI).
// Both can run with thinking off; Opus 5.5 can't, and its thinking blocks
// would have to be carried through the chatbot's tool loop, so it is left
// out. Prices are US dollars per million tokens (input / output).
export const CLIENT_ANTHROPIC_MODELS = [
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (Recommended)', note: 'Best quality for descriptions, SEO and the chatbot', inputPrice: 2, outputPrice: 10 },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'Fast and very cheap', inputPrice: 0.1, outputPrice: 0.5 },
];
export const DEFAULT_CLIENT_ANTHROPIC_MODEL = CLIENT_ANTHROPIC_MODELS[0].id;

// The client's model for one call. Callers pass OpenRouter IDs for some
// jobs (a cheap Haiku for classification, Gemini for voice); on the
// Anthropic key a Haiku request stays Haiku, anything else is the client's pick.
export function clientAnthropicModel(override: string | undefined, saved: string | undefined): string {
  if (override && CLIENT_ANTHROPIC_MODELS.some((m) => m.id === override)) return override;
  if (override && /claude-haiku/.test(override)) return 'claude-haiku-5-5';
  return saved && CLIENT_ANTHROPIC_MODELS.some((m) => m.id === saved) ? saved : DEFAULT_CLIENT_ANTHROPIC_MODEL;
}

// The model for platform work. Only Claude IDs as Anthropic names them
// (no "anthropic/" prefix — that is OpenRouter's spelling).
export function platformAnthropicModel(): string {
  return (process.env.ANTHROPIC_PLATFORM_MODEL || DEFAULT_ANTHROPIC_MODEL).replace(/^anthropic\//, '');
}

// US dollars per million tokens (input, output). Used only to estimate this
// month's spend against ANTHROPIC_MONTHLY_BUDGET_USD; the Anthropic console
// is the real bill. Haiku 5.5 costs more above 100K prompt tokens — our
// prompts never get near that.
const PRICES: Array<{ prefix: string; input: number; output: number }> = [
  { prefix: 'claude-haiku-5', input: 0.1, output: 0.5 },
  { prefix: 'claude-sonnet-5', input: 2, output: 10 },
  { prefix: 'claude-opus-5', input: 4, output: 20 },
  { prefix: 'claude-fable-5', input: 10, output: 50 },
];
// Unknown models are priced like Opus, so the estimate errs high.
const UNKNOWN_PRICE = { input: 5, output: 25 };

export interface AnthropicUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Estimated cost in millionths of a dollar. */
export function estimateCostMicros(model: string, usage: AnthropicUsage): number {
  const price = PRICES.find((p) => model.startsWith(p.prefix)) ?? UNKNOWN_PRICE;
  return Math.ceil(usage.inputTokens * price.input + usage.outputTokens * price.output);
}

// Thinking off where the model allows it: our prompts are short
// classification/translation jobs, and thinking tokens would cost more than
// the answer. Haiku 5.5 turns it off with "disabled", Sonnet 5.5 only with
// "between_tools"; Opus 5.5 can't turn it off, so it runs at low effort with
// room for its thinking on top of the answer.
export function thinkingFor(model: string): {
  thinking?: Anthropic.ThinkingConfigParam;
  effort?: 'low';
  extraTokens: number;
} {
  if (model.startsWith('claude-haiku-5')) return { thinking: { type: 'disabled' }, extraTokens: 0 };
  if (model.startsWith('claude-sonnet-5-5')) return { thinking: { type: 'between_tools' }, extraTokens: 0 };
  return { effort: 'low', extraTokens: 8000 };
}

// Our messages use OpenAI's shape (OpenRouter's). Anthropic takes system
// text separately and only user/assistant turns. Audio can't be sent: no
// Claude model reads it.
export function toAnthropicMessages(messages: Array<ChatMessage | MultimodalMessage>): {
  system?: string;
  messages: Anthropic.MessageParam[];
} {
  const system: string[] = [];
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    let text: string;
    if (typeof m.content === 'string' || m.content === null) {
      text = m.content ?? '';
    } else {
      if (m.content.some((p) => p.type !== 'text')) {
        throw new Error('Claude models cannot read audio; this request needs a model that does (OpenRouter).');
      }
      text = m.content.map((p) => (p.type === 'text' ? p.text : '')).join('\n');
    }
    if (m.role === 'system') {
      if (text) system.push(text);
    } else if (m.role === 'user' || m.role === 'assistant') {
      out.push({ role: m.role, content: text });
    } else {
      throw new Error(`Message role "${m.role}" is not supported on the Anthropic path`);
    }
  }
  return { system: system.length ? system.join('\n\n') : undefined, messages: out };
}

// Clients are cheap but keep a connection pool; one per key is plenty.
const clients = new Map<string, Anthropic>();
function clientFor(apiKey: string): Anthropic {
  let client = clients.get(apiKey);
  if (!client) {
    client = new Anthropic({ apiKey, maxRetries: 1, timeout: 60_000 });
    clients.set(apiKey, client);
  }
  return client;
}

export class AnthropicCallError extends Error {
  constructor(
    message: string,
    // 'credits': account has no credit left; 'auth': key rejected;
    // 'other': anything else (rate limit, overload, refusal, bad output).
    readonly kind: 'credits' | 'auth' | 'other',
    readonly status?: number,
  ) {
    super(message);
  }
}

// One Messages API call with our thinking settings; API failures come back
// as AnthropicCallError so callers can tell "no credit" from "bad key".
export async function callAnthropic(
  apiKey: string,
  model: string,
  maxTokens: number,
  body: Pick<Anthropic.MessageCreateParamsNonStreaming, 'system' | 'messages' | 'tools'>,
  timeoutMs = 60_000,
): Promise<Anthropic.Message> {
  const { thinking, effort, extraTokens } = thinkingFor(model);
  try {
    return await clientFor(apiKey).messages.create(
      {
        model,
        max_tokens: maxTokens + extraTokens,
        ...(body.system ? { system: body.system } : {}),
        messages: body.messages,
        ...(body.tools?.length ? { tools: body.tools } : {}),
        ...(thinking ? { thinking } : {}),
        ...(effort ? { output_config: { effort } } : {}),
      },
      { timeout: timeoutMs },
    );
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      throw new AnthropicCallError(`Anthropic rejected the key (${err.message})`, 'auth', err.status);
    }
    if (err instanceof Anthropic.APIError) {
      // An empty account answers 400 "Your credit balance is too low ...".
      const kind = /credit balance/i.test(err.message) ? 'credits' : 'other';
      throw new AnthropicCallError(`Anthropic API error ${err.status ?? ''}: ${err.message}`.trim(), kind, err.status);
    }
    throw new AnthropicCallError(`Anthropic request failed: ${(err as Error).message}`, 'other');
  }
}

export async function anthropicComplete(
  apiKey: string,
  model: string,
  messages: Array<ChatMessage | MultimodalMessage>,
  maxTokens: number,
): Promise<{ text: string; usage: AnthropicUsage }> {
  const { system, messages: turns } = toAnthropicMessages(messages);
  const response = await callAnthropic(apiKey, model, maxTokens, { system, messages: turns });

  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stop_reason === 'refusal') {
    throw Object.assign(new AnthropicCallError('Claude declined this request', 'other'), { usage });
  }
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  if (!text) {
    throw Object.assign(
      new AnthropicCallError(
        response.stop_reason === 'max_tokens'
          ? 'Empty response from Anthropic (the model used its whole token limit before answering)'
          : 'Empty response from Anthropic',
        'other',
      ),
      { usage },
    );
  }
  return { text, usage };
}
