import { useState, useRef, useEffect, useMemo } from 'preact/hooks';
import { useLabels } from '@/hooks/useLabels';
import { useSelector } from '@/hooks/useStore';
import { selectors } from '@/core/selectors';

const ALLOWED_TAGS = ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'span', 'div', 'table', 'tr', 'td', 'th', 'thead', 'tbody'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'class'];

function sanitizeHTML(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const clean = (node: Node): void => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as Element;
        if (!ALLOWED_TAGS.includes(el.tagName.toLowerCase())) {
          el.replaceWith(...Array.from(el.childNodes));
          continue;
        }
        for (const attr of Array.from(el.attributes)) {
          if (!ALLOWED_ATTR.includes(attr.name.toLowerCase())) {
            el.removeAttribute(attr.name);
          }
        }
        if (el.tagName === 'A') {
          el.setAttribute('rel', 'noopener noreferrer');
        }
        clean(el);
      }
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

const WORD_LIMIT = 80;
const LINE_CLAMP = 10;

interface Props {
  description?: string;
}

export default function RsDetailDescription({ description: descProp }: Props) {
  const { t } = useLabels();
  const property = useSelector(selectors.getSelectedProperty);
  const rawDescription = descProp ?? property?.description;
  const description = useMemo(
    () => (rawDescription ? sanitizeHTML(rawDescription) : ''),
    [rawDescription],
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);

  useEffect(() => {
    if (!contentRef.current || !description) return;
    const el = contentRef.current;
    const text = el.textContent || '';
    const wordCount = text.trim().split(/\s+/).length;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const maxHeight = lineHeight * LINE_CLAMP;
    const exceedsLines = el.scrollHeight > maxHeight + 4;
    setNeedsClamp(wordCount > WORD_LIMIT || exceedsLines);
  }, [description]);

  if (!description) {
    return null;
  }

  return (
    <div class="rs-detail-section">
      <h2 class="rs-detail-section__heading">
        {t('detail_description', 'Description')}
      </h2>
      <div class={`rs-detail-description${needsClamp && !expanded ? ' rs-detail-description--clamped' : ''}`}>
        <div
          ref={contentRef}
          class="rs-detail-description__content"
          dangerouslySetInnerHTML={{ __html: description }}
        />
        {needsClamp && !expanded && <div class="rs-detail-description__fade" />}
      </div>
      {needsClamp && (
        <button
          type="button"
          class="rs-detail-description__toggle"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? t('read_less', 'Read Less')
            : t('read_more', 'Read More')}
          <svg
            class={`rs-detail-description__chevron${expanded ? ' rs-detail-description__chevron--up' : ''}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      )}
    </div>
  );
}
