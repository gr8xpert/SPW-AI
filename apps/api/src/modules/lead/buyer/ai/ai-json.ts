// Reading a model's reply, and keeping what we send it short. Pure.

// The first JSON object in a reply: models wrap it in code fences or a
// sentence. Braces inside strings are skipped. Anything else → null.
export function extractJson(reply: string): Record<string, unknown> | null {
  if (typeof reply !== 'string') return null;
  const text = reply.replace(/```(?:json)?/gi, '');
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try {
        const parsed = JSON.parse(text.slice(start, i + 1));
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    }
  }
  return null;
}

// Text for a prompt: trimmed, Windows line ends and runs of blank lines
// folded, at most `max` characters.
export function clip(text: string | null | undefined, max: number): string {
  const s = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
