// Strip quoted history + signatures from an inbound email body so only the
// reply text is stored as a ticket message. Handles the common quote
// markers Gmail / Outlook / Apple Mail / Thunderbird produce. This is
// intentionally conservative — better to keep an extra line than to eat the
// user's actual reply.
//
// Not exhaustive by design: localized quote headers (German, Spanish, etc.)
// fall through and the whole thread gets stored, which is ugly but not lossy.
// Extend the QUOTE_HEADERS list when a language shows up in support tickets.

const QUOTE_HEADERS: RegExp[] = [
  /^On\s.+\swrote:\s*$/im,
  /^On\s.+\s<[^>]+>\swrote:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^_{5,}\s*$/m,
  /^From:\s.+\s*$\r?\nSent:\s.+\s*$\r?\nTo:\s.+\s*$/im,
];

const SIGNATURE_SEPARATOR = /^-- \s*$/m;

export function stripQuotedReply(raw: string): string {
  if (!raw) return '';
  let text = raw.replace(/\r\n/g, '\n');

  // Cut at the first quote-header we find.
  let cutIndex = text.length;
  for (const re of QUOTE_HEADERS) {
    const m = re.exec(text);
    if (m && m.index < cutIndex) cutIndex = m.index;
  }

  // Also cut where a run of quoted lines (>) begins. Requires >=2
  // consecutive `>`-prefixed lines to avoid clipping a user who
  // happens to start a sentence with ">".
  const quoteBlock = text.match(/(^|\n)>[^\n]*\n>[^\n]*/);
  if (quoteBlock && quoteBlock.index !== undefined) {
    const idx = quoteBlock.index + (quoteBlock[1]?.length ?? 0);
    if (idx < cutIndex) cutIndex = idx;
  }

  text = text.slice(0, cutIndex);

  // Drop a trailing signature block ("-- \n<sig>").
  const sigMatch = SIGNATURE_SEPARATOR.exec(text);
  if (sigMatch) text = text.slice(0, sigMatch.index);

  return text.trim();
}
