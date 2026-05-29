import { BrochureContext } from './template-context';

/** Canonical Puppeteer page margins for the v1 layout. Top is generous to
 *  clear the branded header (logo 50px + padding + border). Service should
 *  pass these into `page.pdf({ margin: PDF_MARGIN_V1 })`. */
export const PDF_MARGIN_V1 = {
  top: '32mm',
  bottom: '18mm',
  left: '15mm',
  right: '15mm',
} as const;

const FEATURE_CATEGORY_LABEL_KEYS: Record<string, string> = {
  interior: 'feature_category_interior',
  exterior: 'feature_category_exterior',
  community: 'feature_category_community',
  climate: 'feature_category_climate',
  views: 'feature_category_views',
  security: 'feature_category_security',
  parking: 'feature_category_parking',
  other: 'feature_category_other',
};

const FEATURE_CATEGORY_DEFAULTS: Record<string, string> = {
  interior: 'Interior',
  exterior: 'Exterior',
  community: 'Community',
  climate: 'Climate Control',
  views: 'Views',
  security: 'Security',
  parking: 'Parking',
  other: 'Other',
};

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeEntities(s: string): string {
  // Resales feeds sometimes ship `&apos;` already-encoded; decode the common
  // ones so the brochure doesn't render literal entities.
  return String(s)
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&#39;', "'");
}

function formatPrice(value: number | null, currency: string, priceOnRequest: boolean, labels: Record<string, string>): string {
  if (priceOnRequest) return labels.brochure_price_on_request || 'Price on request';
  if (value == null) return '—';
  const symbol = currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency === 'USD' ? '$' : currency;
  return `${Math.round(value).toLocaleString('en-US')} ${symbol}`;
}

function groupFeatures(features: Array<{ category: string; name: string }>) {
  const grouped: Record<string, string[]> = {};
  for (const f of features) {
    const cat = f.category || 'other';
    grouped[cat] ??= [];
    grouped[cat].push(f.name);
  }
  // Stable category order matches the Resales-style layout
  const order = ['interior', 'exterior', 'views', 'community', 'climate', 'security', 'parking', 'other'];
  return order
    .filter((cat) => grouped[cat]?.length)
    .map((cat) => ({ category: cat, items: grouped[cat] }));
}

export function renderLayoutV1(ctx: BrochureContext): string {
  const { property, tenant, labels, lang } = ctx;
  const t = (key: string, fallback: string) => labels[key] || fallback;

  const hero = property.images[0]?.url || '';
  const thumbs = property.images.slice(1, 5);
  const featureGroups = groupFeatures(property.features);

  // Spec strip: only include populated values
  const specs: Array<{ label: string; value: string }> = [
    { label: t('detail_reference', 'Reference'), value: property.reference },
  ];
  if (property.bedrooms != null) specs.push({ label: t('detail_bedrooms', 'Bedrooms'), value: String(property.bedrooms) });
  if (property.bathrooms != null) specs.push({ label: t('detail_bathrooms', 'Bathrooms'), value: String(property.bathrooms) });
  if (property.plotSize != null) specs.push({ label: t('detail_plot_size', 'Plot Size'), value: `${property.plotSize}m²` });
  if (property.buildSize != null) specs.push({ label: t('detail_build_size', 'Build Size'), value: `${property.buildSize}m²` });
  if (property.terraceSize != null) specs.push({ label: t('detail_terrace', 'Terrace'), value: `${property.terraceSize}m²` });

  return `<!DOCTYPE html>
<html lang="${escapeHtml(lang)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(property.title)}</title>
<style>${CSS}</style>
</head>
<body style="--accent:${escapeHtml(tenant.primaryColor)};">

  <!-- ===== Page 1: Cover ===== -->
  <section class="page page-cover">
    <header class="cover-header">
      <h1 class="cover-title">${escapeHtml(property.title)}</h1>
    </header>

    ${hero ? `<div class="hero"><img src="${escapeHtml(hero)}" alt="" /></div>` : ''}

    ${thumbs.length ? `
    <div class="thumbs">
      ${thumbs.map((img) => `<div class="thumb"><img src="${escapeHtml(img.url)}" alt="" /></div>`).join('')}
    </div>` : ''}

    <div class="price-strip">
      <div class="price-value">${formatPrice(property.price, property.currency, property.priceOnRequest, labels)}</div>
    </div>

    <div class="spec-strip">
      ${specs.map((s) => `<div class="spec"><span class="spec-label">${escapeHtml(s.label)}</span><span class="spec-value">${escapeHtml(s.value)}</span></div>`).join('')}
    </div>
  </section>

  <!-- ===== Page 2: Description ===== -->
  <section class="page page-description">
    <h2 class="section-heading">${escapeHtml(property.locationFullPath || property.locationName || property.title)}</h2>
    ${property.propertyTypeName ? `<p class="lede">${escapeHtml(property.propertyTypeName)}</p>` : ''}
    <div class="description">
      ${decodeEntities(property.description || '')
        .split(/\n\n+/)
        .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
        .join('')}
    </div>
  </section>

  <!-- ===== Page 3: Features ===== -->
  <section class="page page-features">
    <h2 class="section-heading">${escapeHtml(t('brochure_features_heading', 'Features'))}</h2>
    <div class="features-grid">
      ${featureGroups.map((g) => `
        <div class="feature-group">
          <h3 class="feature-group-title">${escapeHtml(t(FEATURE_CATEGORY_LABEL_KEYS[g.category], FEATURE_CATEGORY_DEFAULTS[g.category]))}</h3>
          <ul class="feature-list">
            ${g.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </div>
  </section>

</body>
</html>`;
}

/**
 * Branded header (Puppeteer header template, rendered on every page).
 * Logo left · QR center · contact right. The Puppeteer header runs inside its
 * own root with limited CSS support so styles are inlined.
 */
export function renderBrandedHeader(ctx: BrochureContext): string {
  const { tenant, qrDataUrl } = ctx;
  return `
    <div style="width:100%;min-height:54px;font-family:Helvetica,Arial,sans-serif;font-size:10px;color:#333;padding:6px 15mm;display:flex;align-items:center;border-bottom:1px solid #e5e5e5;box-sizing:border-box;">
      <div style="flex:1 1 0;text-align:left;">
        ${tenant.logoUrl ? `<img src="${escapeHtml(tenant.logoUrl)}" style="height:50px;max-width:180px;object-fit:contain;vertical-align:middle;" />` : `<span style="font-weight:700;font-size:13px;">${escapeHtml(tenant.name)}</span>`}
      </div>
      <div style="flex:1 1 0;text-align:center;">
        ${qrDataUrl ? `<img src="${escapeHtml(qrDataUrl)}" style="width:54px;height:54px;vertical-align:middle;" />` : ''}
      </div>
      <div style="flex:1 1 0;text-align:right;line-height:1.45;">
        ${tenant.contactEmail ? `<div>${escapeHtml(tenant.contactEmail)}</div>` : ''}
        ${tenant.contactPhone ? `<div>${escapeHtml(tenant.contactPhone)}</div>` : ''}
      </div>
    </div>`;
}

export function renderBrandedFooter(ctx: BrochureContext): string {
  const { tenant } = ctx;
  const parts = [tenant.name, tenant.contactPhone, tenant.contactEmail].filter(Boolean).map((s) => escapeHtml(String(s)));
  const line = parts.join(' | ');
  return `
    <div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#666;padding:0 15mm;display:flex;justify-content:space-between;border-top:1px solid #e5e5e5;padding-top:4px;">
      <div>${line}</div>
      <div>Page <span class="pageNumber"></span> / <span class="totalPages"></span></div>
    </div>`;
}

/** Empty header for unbranded — just keeps page margins consistent. */
export function renderUnbrandedHeader(): string {
  return `<div style="width:100%;height:1px;"></div>`;
}

/** Minimal footer for unbranded — page numbers only. */
export function renderUnbrandedFooter(): string {
  return `
    <div style="width:100%;font-family:Helvetica,Arial,sans-serif;font-size:8px;color:#999;padding:0 15mm;text-align:center;">
      <span class="pageNumber"></span> / <span class="totalPages"></span>
    </div>`;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  @page { size: A4; margin: 24mm 15mm 18mm 15mm; }
  html, body {
    font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    color: #222;
    font-size: 11px;
    line-height: 1.5;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .page {
    page-break-after: always;
    min-height: 100%;
    padding-top: 6mm;
  }
  .page:last-child { page-break-after: auto; }

  /* ===== Cover ===== */
  .cover-header { margin-bottom: 12px; }
  .cover-title {
    font-size: 22px;
    font-weight: 700;
    color: #111;
    letter-spacing: -0.2px;
    line-height: 1.2;
  }
  .cover-meta {
    margin-top: 4px;
    font-size: 10px;
    color: #666;
  }
  .cover-meta strong { color: #222; }

  .hero {
    width: 100%;
    height: 340px;
    border-radius: 6px;
    overflow: hidden;
    margin: 10px 0;
    background: #f0f0f0;
  }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .thumbs {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-bottom: 12px;
  }
  .thumb {
    height: 180px;
    border-radius: 4px;
    overflow: hidden;
    background: #f0f0f0;
  }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .price-strip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: var(--accent, #111);
    color: #fff;
    border-radius: 6px;
    margin-bottom: 10px;
  }
  .price-value { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; }

  .spec-strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 4px;
    padding: 8px 0;
    border-top: 1px solid #e8e8e8;
    border-bottom: 1px solid #e8e8e8;
  }
  .spec { display: flex; flex-direction: column; align-items: flex-start; }
  .spec-label { font-size: 8px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
  .spec-value { font-size: 12px; font-weight: 600; color: #222; margin-top: 1px; }

  /* ===== Description page ===== */
  .section-heading {
    font-size: 18px;
    font-weight: 700;
    color: #111;
    margin-bottom: 6px;
    border-bottom: 2px solid var(--accent, #111);
    padding-bottom: 6px;
    display: inline-block;
  }
  .lede {
    color: #666;
    font-size: 11px;
    margin-bottom: 14px;
  }
  .description p {
    margin-bottom: 10px;
    text-align: justify;
    color: #333;
  }

  /* ===== Features page ===== */
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px 24px;
    margin-top: 14px;
  }
  .feature-group { break-inside: avoid; }
  .feature-group-title {
    font-size: 11px;
    font-weight: 800;
    color: #111;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  .feature-list { list-style: none; }
  .feature-list li {
    font-size: 10.5px;
    padding: 2px 0;
    color: #333;
  }
`;
