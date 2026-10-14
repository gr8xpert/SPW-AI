import { useEffect, useRef } from 'preact/hooks';
import type { Property } from '@/types';

/**
 * The site's own form (e.g. Gravity Forms) in place of the inquiry form.
 *
 * The WordPress plugin renders it into a hidden holder at the foot of the
 * page (SPM_Custom_Form), so the form plugin's scripts and submission work
 * as usual; this moves that holder into the property page and back out
 * again when the page goes, so moving to another property keeps the form.
 */
export function customFormHolder(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>('[data-spm-custom-form]');
}

/**
 * Fields the client marked with a CSS class get the property: `spm-ref`,
 * `spm-title`, `spm-url`, and `spm-message` (only when the visitor has not
 * written their own). Gravity Forms puts the class on the field's wrapper.
 */
function fill(root: HTMLElement, cls: string, value: string, keepTyped = false) {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
    `.${cls} input:not([type=checkbox]):not([type=radio]):not([type=file]), .${cls} textarea, input.${cls}, textarea.${cls}`,
  );
  fields.forEach((field) => {
    const typed = field.value.trim() !== '' && field.value !== field.dataset.spmFilled;
    if (keepTyped && typed) return;
    field.value = value;
    field.dataset.spmFilled = value;
    // Conditional logic and calculations in the form listen for these.
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

interface Props {
  holder: HTMLElement;
  property: Property;
  heading: string;
  message: string;
}

export default function RsDetailCustomForm({ holder, property, heading, message }: Props) {
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    el.appendChild(holder);
    holder.hidden = false;
    return () => {
      holder.hidden = true;
      document.body.appendChild(holder);
    };
  }, [holder]);

  useEffect(() => {
    fill(holder, 'spm-ref', property.reference || '');
    fill(holder, 'spm-title', property.title || '');
    fill(holder, 'spm-url', window.location.href.slice(0, 1000));
    fill(holder, 'spm-message', message, true);
  }, [holder, property.id, message]);

  return (
    <div class="rs-detail-inquiry rs-detail-inquiry--custom">
      <h3 class="rs-detail-inquiry__heading">{heading}</h3>
      <div ref={slot} />
    </div>
  );
}
