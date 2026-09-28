import { createPortal } from 'preact/compat';
import { useLayoutEffect, useState } from 'preact/hooks';
import type { RefObject } from 'preact';
import type { ComponentChildren } from 'preact';

interface Props {
  anchorRef: RefObject<HTMLElement>;
  children: ComponentChildren;
  // Panels that should be at least as wide as the field they belong to.
  matchWidth?: boolean;
  // Narrowest the panel may be, used when keeping it inside the viewport.
  minWidth?: number;
}

/**
 * Renders a dropdown panel at the end of <body>, anchored to its field.
 *
 * A panel that stays inside the page cannot be seen past the theme: a page
 * builder's row clips it, and a sticky header paints over it. Neither can be
 * beaten with z-index, because the widget sits inside the theme's own stacking
 * context — so the panel is moved out of it instead. Clicks inside still count
 * as "inside the field": see isOutsideField().
 */
export default function RsFloating({ anchorRef, children, matchWidth = true, minWidth = 320 }: Props) {
  const [box, setBox] = useState<{ left: number; top: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Keep the panel on screen: a field near the right edge would otherwise
      // push it past the viewport and add a horizontal scrollbar.
      const width = Math.max(r.width, minWidth);
      const margin = 8;
      const maxLeft = Math.max(margin, window.innerWidth - width - margin);
      setBox({ left: Math.min(Math.max(margin, r.left), maxLeft), top: r.bottom + 4, width: r.width });
    };
    place();
    // `true` catches scrolling inside any container, not just the window.
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, minWidth]);

  if (typeof document === 'undefined') return null;

  const style = box
    ? `left:${Math.round(box.left)}px;top:${Math.round(box.top)}px;${matchWidth ? `min-width:${Math.round(box.width)}px;` : ''}`
    : 'opacity:0;pointer-events:none;';

  return createPortal(
    <div class="rs-floating" data-rs-floating="" style={style}>
      {children}
    </div>,
    document.body,
  );
}

/**
 * True when a click landed outside the field AND outside its floating panel.
 * The panel is a child of <body>, so `field.contains(target)` alone would
 * treat every click on the panel as a click elsewhere and close it.
 */
export function isOutsideField(field: HTMLElement | null, target: EventTarget | null): boolean {
  if (!field) return false;
  const node = target as HTMLElement | null;
  if (node && typeof node.closest === 'function' && node.closest('[data-rs-floating]')) return false;
  return !field.contains(node as Node);
}
