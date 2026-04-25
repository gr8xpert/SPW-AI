import type { Property } from '@/types';

interface JsPDF {
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): void;
  addPage(): void;
  save(filename: string): void;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
}

interface Html2Canvas {
  (el: HTMLElement, opts?: Record<string, unknown>): Promise<HTMLCanvasElement>;
}

let libsLoading: Promise<{ jsPDF: new (opts: Record<string, unknown>) => JsPDF; html2canvas: Html2Canvas }> | null = null;

function loadLibs() {
  if (libsLoading) return libsLoading;

  libsLoading = new Promise((resolve, reject) => {
    let loaded = 0;
    const check = () => {
      loaded++;
      if (loaded < 2) return;
      const w = window as unknown as Record<string, unknown>;
      const jspdfMod = w.jspdf as { jsPDF: new (opts: Record<string, unknown>) => JsPDF } | undefined;
      const h2c = w.html2canvas as Html2Canvas | undefined;
      if (jspdfMod && h2c) resolve({ jsPDF: jspdfMod.jsPDF, html2canvas: h2c });
      else reject(new Error('Failed to load PDF libraries'));
    };

    if ((window as unknown as Record<string, unknown>).jspdf && (window as unknown as Record<string, unknown>).html2canvas) {
      loaded = 1;
      check();
      return;
    }

    const s1 = document.createElement('script');
    s1.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s1.onload = check;
    s1.onerror = reject;

    const s2 = document.createElement('script');
    s2.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    s2.onload = check;
    s2.onerror = reject;

    document.head.appendChild(s1);
    document.head.appendChild(s2);
  });

  return libsLoading;
}

export async function generateWishlistPDF(
  properties: Property[],
  formatPrice: (amount: number, currency?: string) => string,
  brandName?: string,
  primaryColor?: string,
): Promise<void> {
  const brand = brandName || document.title || 'Property Collection';
  const color = primaryColor || '#2563eb';
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const { jsPDF, html2canvas } = await loadLibs();

  const container = document.createElement('div');
  container.style.cssText = 'position:fixed;left:-9999px;top:0;width:794px;';
  document.body.appendChild(container);

  try {
    const pages: HTMLElement[] = [];

    // Cover page
    const cover = document.createElement('div');
    cover.innerHTML = buildCoverHTML(brand, color, date, properties.length);
    applyPageStyle(cover);
    container.appendChild(cover);
    pages.push(cover);

    // Property pages
    for (const p of properties) {
      const page = document.createElement('div');
      page.innerHTML = buildPropertyHTML(p, formatPrice, color);
      applyPageStyle(page);
      container.appendChild(page);
      pages.push(page);
    }

    // Wait for images to load
    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map((img) =>
      new Promise<void>((r) => {
        if (img.complete) { r(); return; }
        img.onload = () => r();
        img.onerror = () => r();
      }),
    ));

    await new Promise((r) => setTimeout(r, 100));

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: 'a4', hotfixes: ['px_scaling'] });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: 794,
        height: 1123,
      });
      const imgData = canvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
    }

    pdf.save('wishlist.pdf');
  } finally {
    document.body.removeChild(container);
  }
}

function applyPageStyle(el: HTMLElement): void {
  el.style.cssText = 'width:794px;height:1123px;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;font-family:Segoe UI,system-ui,-apple-system,sans-serif;color:#1e293b;';
}

function buildCoverHTML(brand: string, color: string, date: string, count: number): string {
  const darker = adjustColor(color, -40);
  return `
    <div style="position:absolute;inset:0;background:linear-gradient(160deg,${color} 0%,${darker} 100%);"></div>
    <div style="position:absolute;top:-160px;right:-160px;width:400px;height:400px;border-radius:50%;background:rgba(255,255,255,0.06);"></div>
    <div style="position:absolute;bottom:-120px;left:-120px;width:320px;height:320px;border-radius:50%;background:rgba(255,255,255,0.04);"></div>
    <div style="position:relative;z-index:1;text-align:center;color:#fff;padding:0 80px;">
      <div style="width:72px;height:72px;border-radius:20px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;margin:0 auto 40px;font-size:36px;font-weight:700;">${esc(brand.charAt(0).toUpperCase())}</div>
      <div style="font-size:36px;font-weight:700;letter-spacing:-0.5px;margin-bottom:16px;">${esc(brand)}</div>
      <div style="width:120px;height:2px;background:rgba(255,255,255,0.4);margin:24px auto;"></div>
      <div style="font-size:17px;font-weight:400;opacity:0.85;margin-bottom:12px;">Curated Property Selection</div>
      <div style="font-size:14px;opacity:0.6;">${count} ${count === 1 ? 'Property' : 'Properties'}</div>
    </div>
    <div style="position:absolute;bottom:60px;left:0;right:0;text-align:center;font-size:12px;color:rgba(255,255,255,0.5);">${esc(date)}</div>`;
}

function buildPropertyHTML(p: Property, formatPrice: (n: number, c?: string) => string, color: string): string {
  const priceText = p.priceOnRequest ? 'Price on Request' : esc(formatPrice(p.price, p.currency));
  const imgUrl = p.images?.[0]?.url || '';
  const desc = p.description ? esc(stripHtml(p.description).slice(0, 300)) + (p.description.length > 300 ? '...' : '') : '';

  const specs: string[] = [];
  if (p.bedrooms != null) specs.push(`${p.bedrooms} Bedrooms`);
  if (p.bathrooms != null) specs.push(`${p.bathrooms} Bathrooms`);
  if (p.buildSize != null) specs.push(`${p.buildSize} m² Built`);
  if (p.plotSize != null) specs.push(`${p.plotSize} m² Plot`);
  if (p.year != null) specs.push(`Built ${p.year}`);

  const features = (p.features || []).slice(0, 8).map((f) => esc(f.name));

  return `
    <div style="background:#fff;position:absolute;inset:0;"></div>
    <div style="position:relative;width:640px;">
      ${imgUrl ? `<div style="width:100%;border-radius:16px;overflow:hidden;margin-bottom:28px;box-shadow:0 4px 20px rgba(0,0,0,0.12);"><img src="${esc(imgUrl)}" crossorigin="anonymous" style="width:100%;height:380px;object-fit:cover;display:block;" /></div>` : ''}
      <div style="padding:0 8px;">
        <div style="font-size:24px;font-weight:700;color:#1e293b;margin-bottom:6px;line-height:1.2;">${esc(p.title)}</div>
        <div style="font-size:22px;font-weight:700;color:${color};margin-bottom:6px;">${priceText}</div>
        <div style="font-size:13px;color:#64748b;margin-bottom:16px;">${esc(p.location.name)}</div>
        ${specs.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:12px;color:#334155;margin-bottom:16px;padding:10px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;">${specs.map((s) => `<span>${s}</span>`).join('<span style="color:#cbd5e1;margin:0 4px;">•</span>')}</div>` : ''}
        ${desc ? `<div style="font-size:12px;line-height:1.6;color:#475569;margin-bottom:16px;">${desc}</div>` : ''}
        ${features.length ? `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">${features.map((f) => `<span style="display:inline-block;padding:4px 10px;background:#f1f5f9;border-radius:6px;font-size:10px;color:#475569;">${f}</span>`).join('')}</div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:10px;color:#94a3b8;padding-top:10px;border-top:1px solid #f1f5f9;">
          <span>Ref: ${esc(p.reference)}</span>
          <span>${esc(p.propertyType?.name ?? '')}</span>
        </div>
      </div>
    </div>`;
}

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function adjustColor(hex: string, amount: number): string {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + amount));
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + amount));
  const b = Math.max(0, Math.min(255, (num & 0xff) + amount));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}
