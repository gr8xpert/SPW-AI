import { BrochureContext, BrochureTenantContext } from './template-context';
import { escapeHtml, LAYOUT_V1_CSS, renderLayoutV1Sections } from './layout-v1';

// Several properties in one PDF (Buyer Match "Suggested" selection): an
// agency cover with the buyer's name, then each property's layout-v1 pages.

export interface SelectionCover {
  title: string; // "Selected properties for Emma Stone"
  preparedBy: string | null; // "Prepared by Alex Agent"
  count: string; // "3 properties"
  date: string;
}

export function renderSelectionV1(tenant: BrochureTenantContext, lang: string, cover: SelectionCover, items: BrochureContext[]): string {
  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(cover.title)}</title>
<style>${LAYOUT_V1_CSS}${SELECTION_CSS}</style>
</head>
<body style="--accent:${escapeHtml(tenant.primaryColor)};">

  <section class="selection-cover">
    ${tenant.logoUrl ? `<img class="selection-logo" src="${escapeHtml(tenant.logoUrl)}" alt="" />` : `<p class="selection-agency">${escapeHtml(tenant.name)}</p>`}
    <h1 class="selection-title">${escapeHtml(cover.title)}</h1>
    <p class="selection-meta">${escapeHtml(cover.count)} · ${escapeHtml(cover.date)}</p>
    ${cover.preparedBy ? `<p class="selection-meta">${escapeHtml(cover.preparedBy)}</p>` : ''}
    <div class="selection-contact">
      <p><strong>${escapeHtml(tenant.name)}</strong></p>
      ${tenant.contactEmail ? `<p>${escapeHtml(tenant.contactEmail)}</p>` : ''}
      ${tenant.contactPhone ? `<p>${escapeHtml(tenant.contactPhone)}</p>` : ''}
      ${tenant.websiteUrl ? `<p>${escapeHtml(tenant.websiteUrl.replace(/^https?:\/\//i, '').replace(/\/$/, ''))}</p>` : ''}
    </div>
  </section>

  ${items.map((ctx) => `<div class="property-block">${renderLayoutV1Sections(ctx, { skipEmptyFeatures: true })}</div>`).join('\n')}

</body>
</html>`;
}

const SELECTION_CSS = `
  .selection-cover { padding-top: 40mm; text-align: center; }
  .selection-logo { max-height: 70px; max-width: 240px; object-fit: contain; margin-bottom: 18mm; }
  .selection-agency { font-size: 18px; font-weight: 700; margin-bottom: 18mm; }
  .selection-title { font-size: 26px; font-weight: 700; color: #111; line-height: 1.25; margin-bottom: 8px; }
  .selection-meta { font-size: 12px; color: #555; margin-top: 4px; }
  .selection-contact { margin-top: 30mm; font-size: 11px; color: #444; line-height: 1.6; border-top: 2px solid var(--accent); display: inline-block; padding-top: 8px; min-width: 60mm; }
  .property-block { page-break-before: always; }
`;
