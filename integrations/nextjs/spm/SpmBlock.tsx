import type { HTMLAttributes } from 'react';

type Attr = string | number | boolean | undefined;

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /**
   * The block: "site-search", "site-listing", "site-detail", "site-map",
   * "site-wishlist", "site-carousel" (they follow Website Design in the
   * dashboard), or any block name from Add to Website.
   */
  widget: string;
  /** Block options, as on Add to Website: { location: 'Marbella', limit: 6, 'own-search': true }. */
  options?: Record<string, Attr>;
}

/**
 * One SPM block. The widget fills it in the browser; React only renders the
 * empty box, so it never fights the widget over what's inside.
 */
export function SpmBlock({ widget, options, ...rest }: Props) {
  const data: Record<string, string> = {};
  for (const [name, value] of Object.entries(options || {})) {
    if (value === undefined || value === false) continue;
    data[`data-spm-${name}`] = value === true ? 'true' : String(value);
  }
  return <div {...rest} data-spm-widget={widget} {...data} suppressHydrationWarning />;
}
