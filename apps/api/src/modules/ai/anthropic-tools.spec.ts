import { toAnthropicConversation, toAnthropicTools } from './anthropic-tools';

describe('Chatbot on Anthropic: tool format', () => {
  it('turns OpenAI tools into Anthropic tools', () => {
    expect(
      toAnthropicTools([
        { type: 'function', function: { name: 'search_properties', description: 'Search', parameters: { type: 'object', properties: { beds: { type: 'number' } } } } },
      ]),
    ).toEqual([{ name: 'search_properties', description: 'Search', input_schema: { type: 'object', properties: { beds: { type: 'number' } } } }]);
  });

  it('carries a tool round trip: tool_use on the assistant turn, results in one user turn', () => {
    const { system, messages } = toAnthropicConversation([
      { role: 'system', content: 'You help buyers.' },
      { role: 'user', content: 'Villas with a pool?' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call_1', type: 'function', function: { name: 'search_properties', arguments: '{"pool":true}' } },
          { id: 'call_2', type: 'function', function: { name: 'get_locations', arguments: '' } },
        ],
      },
      { role: 'tool', content: '{"total":3}', tool_call_id: 'call_1' },
      { role: 'tool', content: '["Marbella"]', tool_call_id: 'call_2' },
    ]);
    expect(system).toBe('You help buyers.');
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Villas with a pool?' }] },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'call_1', name: 'search_properties', input: { pool: true } },
          { type: 'tool_use', id: 'call_2', name: 'get_locations', input: {} },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'call_1', content: '{"total":3}' },
          { type: 'tool_result', tool_use_id: 'call_2', content: '["Marbella"]' },
        ],
      },
    ]);
  });

  it('saved history: tool results without their call become text, and the talk starts and ends with the visitor', () => {
    const { messages } = toAnthropicConversation([
      { role: 'assistant', content: 'Welcome!' },
      { role: 'user', content: 'Villas?' },
      { role: 'tool', content: '{"total":3}', tool_call_id: 'call_old' },
      { role: 'assistant', content: 'I found 3.' },
      { role: 'user', content: 'Cheaper ones?' },
    ]);
    expect(messages).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Villas?' }, { type: 'text', text: 'Earlier search result: {"total":3}' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'I found 3.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Cheaper ones?' }] },
    ]);
  });
});
