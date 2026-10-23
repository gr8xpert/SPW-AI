import { apiErrorKind, estimateCostMicros, platformAnthropicModel, thinkingFor, toAnthropicMessages } from './anthropic-client';

describe('Anthropic client helpers', () => {
  it('moves system text out of the turns', () => {
    expect(
      toAnthropicMessages([
        { role: 'system', content: 'Be brief.' },
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'system', content: 'JSON only.' },
        { role: 'user', content: 'Again' },
      ]),
    ).toEqual({
      system: 'Be brief.\n\nJSON only.',
      messages: [
        { role: 'user', content: 'Hi' },
        { role: 'assistant', content: 'Hello' },
        { role: 'user', content: 'Again' },
      ],
    });
  });

  it('refuses audio, which no Claude model reads', () => {
    expect(() =>
      toAnthropicMessages([
        { role: 'user', content: [{ type: 'input_audio', input_audio: { data: 'x', format: 'wav' } }] },
      ]),
    ).toThrow(/audio/);
  });

  it('turns thinking off the way each model allows', () => {
    expect(thinkingFor('claude-haiku-5-5')).toEqual({ thinking: { type: 'disabled' }, extraTokens: 0 });
    expect(thinkingFor('claude-sonnet-5-5')).toEqual({ thinking: { type: 'between_tools' }, extraTokens: 0 });
    expect(thinkingFor('claude-opus-5-5')).toMatchObject({ effort: 'low' });
    expect(thinkingFor('claude-opus-5-5').thinking).toBeUndefined();
  });

  it('estimates spend in millionths of a dollar', () => {
    // Haiku 5.5: $0.10 in / $0.50 out per million tokens.
    expect(estimateCostMicros('claude-haiku-5-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toBe(600_000);
    expect(estimateCostMicros('claude-sonnet-5-5', { inputTokens: 1000, outputTokens: 1000 })).toBe(12_000);
    // Unknown models err high.
    expect(estimateCostMicros('claude-something', { inputTokens: 1000, outputTokens: 0 })).toBe(5000);
  });

  it('strips an OpenRouter-style prefix from the configured model', () => {
    const before = process.env.ANTHROPIC_PLATFORM_MODEL;
    process.env.ANTHROPIC_PLATFORM_MODEL = 'anthropic/claude-sonnet-5-5';
    expect(platformAnthropicModel()).toBe('claude-sonnet-5-5');
    delete process.env.ANTHROPIC_PLATFORM_MODEL;
    expect(platformAnthropicModel()).toBe('claude-haiku-5-5');
    if (before !== undefined) process.env.ANTHROPIC_PLATFORM_MODEL = before;
  });

  it('tells an empty account and a key outside a workspace apart from other errors', () => {
    expect(apiErrorKind('400 {"error":{"message":"Your credit balance is too low to access the Anthropic API."}}')).toBe('credits');
    expect(
      apiErrorKind(
        '400 {"error":{"message":"This API key is not scoped to a workspace, so this request must include the anthropic-workspace-id header"}}',
      ),
    ).toBe('workspace');
    expect(apiErrorKind('429 rate_limit_error')).toBe('other');
  });

  it('passes a per-call timeout and retry count to the SDK', async () => {
    const Anthropic = require('@anthropic-ai/sdk').default;
    const { callAnthropic } = require('./anthropic-client');
    const spy = jest.spyOn(Anthropic.Messages.prototype, 'create').mockResolvedValue({ content: [], usage: { input_tokens: 0, output_tokens: 0 } } as any);
    try {
      await callAnthropic('sk-ant-x', 'claude-sonnet-5-5', 100, { messages: [{ role: 'user', content: 'hi' }] }, 30_000, 0);
      expect(spy.mock.calls[0][1]).toEqual({ timeout: 30_000, maxRetries: 0 });
      await callAnthropic('sk-ant-x', 'claude-sonnet-5-5', 100, { messages: [{ role: 'user', content: 'hi' }] });
      expect(spy.mock.calls[1][1]).toEqual({ timeout: 60_000 });
    } finally {
      spy.mockRestore();
    }
  });
});
