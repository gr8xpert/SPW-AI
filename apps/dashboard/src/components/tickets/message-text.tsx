import { Fragment } from 'react';

// Staff replies always show as "Admin", whoever on the team wrote them.
export const STAFF_AUTHOR_NAME = 'Admin';

const URL_RE = /(https?:\/\/[^\s<>"']+|www\.[^\s<>"']+)/gi;
// Sentence punctuation right after a URL ("see https://x.com.") isn't part of it.
const TRAILING_RE = /[.,;:!?)\]}'"]+$/;

/** Ticket message text with URLs turned into clickable links. Keeps line breaks. */
export function MessageText({ text, className }: { text: string; className?: string }) {
  const parts = (text || '').split(URL_RE);
  return (
    <div className={`whitespace-pre-wrap break-words ${className ?? ''}`}>
      {parts.map((part, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
        const trailing = part.match(TRAILING_RE)?.[0] ?? '';
        const url = trailing ? part.slice(0, -trailing.length) : part;
        const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
        return (
          <Fragment key={i}>
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:opacity-80 break-all"
            >
              {url}
            </a>
            {trailing}
          </Fragment>
        );
      })}
    </div>
  );
}
