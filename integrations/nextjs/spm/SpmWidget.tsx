'use client';

import Script from 'next/script';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { SPM } from './config';

declare global {
  interface Window {
    RealtySoftConfig?: Record<string, unknown>;
    RealtySoft?: { refresh?: () => Promise<void> };
  }
}

interface Props {
  /** Widget build hash from spmWidgetVersion(), so a new widget isn't stuck in a cache. */
  version?: string;
  /** Page language, e.g. "es". Defaults to English. */
  language?: string;
  /** Where the Search button sends visitors from pages without a listing, e.g. "/properties". */
  resultsPage?: string;
  /** Display currency, e.g. "EUR". Defaults to the dashboard's. */
  currency?: string;
}

/**
 * Loads the SPM widget once, in the root layout, and keeps it in step with
 * the Next.js router:
 *  - after every route change it draws the new page's blocks
 *    (RealtySoft.refresh), without reloading the widget;
 *  - a card, "Back to results" or a search sent to the results page goes
 *    through router.push instead of a full page load.
 */
export function SpmWidget({ version, language, resultsPage, currency }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (pathname === firstPath.current) return; // the widget's own start covers the first page
    firstPath.current = pathname;
    // After React has put the new page in the document.
    const frame = requestAnimationFrame(() => {
      void window.RealtySoft?.refresh?.();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  useEffect(() => {
    const onNavigate = (e: Event) => {
      const target = new URL((e as CustomEvent<{ url: string }>).detail.url, window.location.href);
      if (target.origin !== window.location.origin) return; // another site: let the browser go
      e.preventDefault();
      router.push(target.pathname + target.search + target.hash);
    };
    document.addEventListener('spm:navigate', onNavigate);
    return () => document.removeEventListener('spm:navigate', onNavigate);
  }, [router]);

  const config: Record<string, unknown> = {
    apiUrl: SPM.apiUrl,
    apiKey: SPM.apiKey,
    propertyPageSlug: SPM.propertySlug,
    // No WordPress plugin, so no local data files: lists come from the API.
    dataPath: false,
  };
  if (language) config.language = language;
  if (resultsPage) config.resultsPage = resultsPage;
  if (currency) config.currency = currency;
  // In the HTML before the widget script runs. "<" escaped so a value can
  // never close the script tag.
  const inline = `window.RealtySoftConfig = Object.assign(window.RealtySoftConfig || {}, ${JSON.stringify(config).replace(/</g, '\\u003c')});`;

  return (
    <>
      <script id="spm-config" dangerouslySetInnerHTML={{ __html: inline }} />
      <Script
        id="spm-widget"
        src={`${SPM.widgetUrl}/spm-widget.umd.js${version ? `?ver=${encodeURIComponent(version)}` : ''}`}
        strategy="afterInteractive"
      />
    </>
  );
}
