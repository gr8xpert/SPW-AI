import type { Property, Feature } from '@/types';
import { resolveFeatures } from '@/core/feature-utils';

interface JsPDF {
  setFont(font: string, style?: 'normal' | 'bold' | 'italic' | 'bolditalic'): JsPDF;
  setFontSize(size: number): JsPDF;
  setTextColor(r: number, g: number, b: number): JsPDF;
  setFillColor(r: number, g: number, b: number): JsPDF;
  setDrawColor(r: number, g: number, b: number): JsPDF;
  setLineWidth(w: number): JsPDF;
  text(text: string | string[], x: number, y: number, opts?: { align?: 'left' | 'center' | 'right' }): JsPDF;
  rect(x: number, y: number, w: number, h: number, style?: 'F' | 'S' | 'DF'): JsPDF;
  line(x1: number, y1: number, x2: number, y2: number): JsPDF;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): JsPDF;
  addPage(): JsPDF;
  save(filename: string): JsPDF;
  splitTextToSize(text: string, maxWidth: number): string[];
  getTextWidth(text: string): number;
  internal: { pageSize: { getWidth(): number; getHeight(): number } };
}

// V1 wishlist PDFs use jsPDF's built-in text API + standard fonts. This
// produces selectable text, small file sizes, and — critically — no font
// rendering artefacts (unlike the html2canvas screenshot approach, which
// eats whitespace and substitutes fonts).
let libLoading: Promise<{ jsPDF: new (opts: Record<string, unknown>) => JsPDF }> | null = null;

function loadJsPdf() {
  if (libLoading) return libLoading;
  libLoading = new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    const existing = w.jspdf as { jsPDF: new (opts: Record<string, unknown>) => JsPDF } | undefined;
    if (existing?.jsPDF) { resolve({ jsPDF: existing.jsPDF }); return; }

    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.integrity = 'sha512-qZvrmS2ekKPF2mSznTQsxqPgnpkI4DNTlrdUmTzrDgektczlKNRRhy5X5AAOnx5S09ydFYWWNSfcEqDTTHgtNA==';
    s.crossOrigin = 'anonymous';
    s.onload = () => {
      const mod = (window as unknown as Record<string, unknown>).jspdf as { jsPDF: new (opts: Record<string, unknown>) => JsPDF } | undefined;
      if (mod?.jsPDF) resolve({ jsPDF: mod.jsPDF });
      else reject(new Error('jsPDF loaded but global not found'));
    };
    s.onerror = () => reject(new Error('jsPDF script failed to load'));
    document.head.appendChild(s);
  });
  return libLoading;
}

async function fetchAsDataUrl(url: string): Promise<{ data: string; format: 'JPEG' | 'PNG' } | null> {
  try {
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const blob = await r.blob();
    const format: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { data, format };
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function stripHtml(html: string): string {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

function drawCover(pdf: JsPDF, brand: string, primary: { r: number; g: number; b: number }, count: number, date: string): void {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();

  pdf.setFillColor(primary.r, primary.g, primary.b);
  pdf.rect(0, 0, W, H, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(32);
  pdf.text(brand, W / 2, H / 2 - 30, { align: 'center' });

  pdf.setDrawColor(255, 255, 255);
  pdf.setLineWidth(0.5);
  pdf.line(W / 2 - 30, H / 2 - 15, W / 2 + 30, H / 2 - 15);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(18);
  pdf.text('Property Wishlist', W / 2, H / 2, { align: 'center' });

  pdf.setFontSize(12);
  pdf.text(`${count} ${count === 1 ? 'Property' : 'Properties'} Saved`, W / 2, H / 2 + 12, { align: 'center' });

  pdf.setFontSize(10);
  pdf.text(date, W / 2, H - 20, { align: 'center' });
}

async function drawPropertyPage(
  pdf: JsPDF,
  p: Property,
  index: number,
  total: number,
  formatPrice: (n: number, c?: string) => string,
  primary: { r: number; g: number; b: number },
  resolvedFeatures: Feature[],
): Promise<void> {
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const M = 18; // page margin

  // Header strip
  pdf.setFillColor(primary.r, primary.g, primary.b);
  pdf.rect(0, 0, W, 12, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Property ${index} of ${total}`, M, 8);
  pdf.text(`Ref: ${p.reference}`, W - M, 8, { align: 'right' });

  let y = 22;

  // Property image
  const imgUrl = p.images?.[0]?.url;
  if (imgUrl) {
    const img = await fetchAsDataUrl(imgUrl);
    if (img) {
      const imgW = W - M * 2;
      const imgH = 90;
      try {
        pdf.addImage(img.data, img.format, M, y, imgW, imgH);
      } catch { /* image decode failed — skip */ }
      y += imgH + 8;
    }
  }

  // Title
  pdf.setTextColor(30, 41, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  const titleLines = pdf.splitTextToSize(p.title, W - M * 2);
  pdf.text(titleLines, M, y);
  y += titleLines.length * 6 + 2;

  // Price
  pdf.setTextColor(primary.r, primary.g, primary.b);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(20);
  const priceText = p.priceOnRequest ? 'Price on Request' : formatPrice(p.price, p.currency);
  pdf.text(priceText, M, y);
  y += 10;

  // Location + type
  pdf.setTextColor(100, 116, 139);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(11);
  const subline = [p.location?.name, p.propertyType?.name].filter(Boolean).join('  •  ');
  if (subline) {
    pdf.text(subline, M, y);
    y += 8;
  }

  // Separator
  pdf.setDrawColor(226, 232, 240);
  pdf.setLineWidth(0.3);
  pdf.line(M, y, W - M, y);
  y += 6;

  // Info grid (label / value pairs) — two columns
  const rows: Array<[string, string]> = [];
  if (p.bedrooms != null) rows.push(['Bedrooms', String(p.bedrooms)]);
  if (p.bathrooms != null) rows.push(['Bathrooms', String(p.bathrooms)]);
  if (p.buildSize != null) rows.push(['Build Size', `${p.buildSize} m²`]);
  if (p.plotSize != null) rows.push(['Plot Size', `${p.plotSize} m²`]);
  if (p.terraceSize != null) rows.push(['Terrace', `${p.terraceSize} m²`]);
  if (p.status) rows.push(['Status', String(p.status).replace(/_/g, ' ')]);

  pdf.setFontSize(10);
  const colW = (W - M * 2) / 2;
  for (let i = 0; i < rows.length; i += 2) {
    const [l1, v1] = rows[i];
    const [l2, v2] = rows[i + 1] || ['', ''];

    pdf.setTextColor(100, 116, 139);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`${l1}:`, M, y);
    if (l2) pdf.text(`${l2}:`, M + colW, y);

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'bold');
    pdf.text(v1, M + 28, y);
    if (v2) pdf.text(v2, M + colW + 28, y);

    y += 6;
  }
  y += 3;

  // Description
  const raw = (typeof p.description === 'string' ? p.description : '').trim();
  if (raw) {
    pdf.setDrawColor(226, 232, 240);
    pdf.line(M, y, W - M, y);
    y += 5;

    pdf.setTextColor(30, 41, 59);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    const text = stripHtml(raw).slice(0, 700);
    const lines = pdf.splitTextToSize(text, W - M * 2);
    // Only include as many lines as fit before the features/footer area
    const maxLines = Math.max(0, Math.floor((H - 45 - y) / 5));
    pdf.text(lines.slice(0, maxLines), M, y);
    y += Math.min(lines.length, maxLines) * 5 + 4;
  }

  // Features chips
  if (resolvedFeatures.length) {
    pdf.setTextColor(71, 85, 105);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    let cx = M;
    const chipH = 6;
    for (const f of resolvedFeatures.slice(0, 12)) {
      const label = f.name;
      const w = pdf.getTextWidth(label) + 6;
      if (cx + w > W - M) {
        cx = M;
        y += chipH + 2;
        if (y > H - 25) break;
      }
      pdf.setFillColor(241, 245, 249);
      pdf.rect(cx, y - 4, w, chipH, 'F');
      pdf.text(label, cx + 3, y);
      cx += w + 3;
    }
  }

  // Footer
  pdf.setDrawColor(226, 232, 240);
  pdf.line(M, H - 15, W - M, H - 15);
  pdf.setTextColor(148, 163, 184);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.text(`Page ${index + 1} of ${total + 1}`, W / 2, H - 8, { align: 'center' });
}

export async function generateWishlistPDF(
  properties: Property[],
  formatPrice: (amount: number, currency?: string) => string,
  brandName?: string,
  primaryColor?: string,
  featureCatalog: Feature[] = [],
): Promise<void> {
  const brand = brandName || document.title || 'Property Collection';
  const primary = hexToRgb(primaryColor || '#2563eb');
  const date = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

  const { jsPDF } = await loadJsPdf();
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  drawCover(pdf, brand, primary, properties.length, date);

  for (let i = 0; i < properties.length; i++) {
    pdf.addPage();
    const resolved = resolveFeatures(properties[i].features, featureCatalog);
    await drawPropertyPage(pdf, properties[i], i + 1, properties.length, formatPrice, primary, resolved);
  }

  pdf.save('wishlist.pdf');
}
