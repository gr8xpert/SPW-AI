import { clip, extractJson } from './ai-json';

describe('extractJson', () => {
  it('reads a plain object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips code fences and prose around the object', () => {
    expect(extractJson('Here you go:\n```json\n{"a": {"b": [1, 2]}}\n```\nHope it helps')).toEqual({ a: { b: [1, 2] } });
  });

  it('takes the first balanced object even with braces in strings after it', () => {
    expect(extractJson('{"note":"a } b"} trailing {"x":1}')).toEqual({ note: 'a } b' });
  });

  it('returns null for no object, broken JSON, arrays and empty input', () => {
    expect(extractJson('no json here')).toBeNull();
    expect(extractJson('{"a": 1')).toBeNull();
    expect(extractJson('[1,2]')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson(null as unknown as string)).toBeNull();
  });
});

describe('clip', () => {
  it('trims, folds blank lines and keeps short text as is', () => {
    expect(clip('  hello\r\n\r\n\r\n\r\nworld  ', 100)).toBe('hello\n\nworld');
  });

  it('cuts at the limit with an ellipsis', () => {
    const out = clip('x'.repeat(50), 10);
    expect(out).toHaveLength(10);
    expect(out.endsWith('…')).toBe(true);
  });

  it('empty for null / undefined', () => {
    expect(clip(null, 10)).toBe('');
    expect(clip(undefined, 10)).toBe('');
  });
});
