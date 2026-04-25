export interface ScanEntry {
  element: HTMLElement;
  componentType: string;
  variation: number;
  dataAttributes: Record<string, string>;
  isTemplate: boolean;
  templateId?: string;
}

const TEMPLATE_RE = /^([a-z]+-template-\d{2})$/;

export function scanDOM(root: Document | HTMLElement = document): ScanEntry[] {
  const entries: ScanEntry[] = [];
  const seen = new WeakSet<HTMLElement>();

  const elements = root.querySelectorAll<HTMLElement>('[data-spw-widget]');
  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);

    const widgetName = el.getAttribute('data-spw-widget')!;
    const isTemplate = TEMPLATE_RE.test(widgetName);

    entries.push({
      element: el,
      componentType: isTemplate ? widgetName : widgetName,
      variation: parseVariation(el),
      dataAttributes: extractDataAttributes(el),
      isTemplate,
      templateId: isTemplate ? widgetName : undefined,
    });
  }

  return entries;
}

function parseVariation(el: HTMLElement): number {
  const v = el.getAttribute('data-spw-variation');
  return v ? parseInt(v, 10) || 1 : 1;
}

function extractDataAttributes(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-spw-') && attr.name !== 'data-spw-widget' && attr.name !== 'data-spw-variation') {
      const key = attr.name.slice(9);
      attrs[key] = attr.value;
    }
  }
  return attrs;
}
