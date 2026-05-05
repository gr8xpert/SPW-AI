export interface ScanEntry {
  element: HTMLElement;
  componentType: string;
  variation: number;
  dataAttributes: Record<string, string>;
  isTemplate: boolean;
  templateId?: string;
}

const TEMPLATE_RE = /^([a-z]+-template-\d{2})$/;

const CONTAINER_CLASS_MAP: Record<string, string> = {
  'property-detail-container': 'detail-template-01',
};

export function scanDOM(root: Document | HTMLElement = document): ScanEntry[] {
  const entries: ScanEntry[] = [];
  const seen = new WeakSet<HTMLElement>();

  const elements = root.querySelectorAll<HTMLElement>('[data-spm-widget]');
  for (const el of elements) {
    if (seen.has(el)) continue;
    seen.add(el);

    const widgetName = el.getAttribute('data-spm-widget')!;
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

  // Scan [data-spm-template] elements
  const templateEls = root.querySelectorAll<HTMLElement>('[data-spm-template]');
  for (const el of templateEls) {
    if (seen.has(el)) continue;
    seen.add(el);

    const templateId = el.getAttribute('data-spm-template')!;
    entries.push({
      element: el,
      componentType: templateId,
      variation: parseVariation(el),
      dataAttributes: extractDataAttributes(el),
      isTemplate: true,
      templateId,
    });
  }

  // Scan class-based containers
  for (const [className, templateId] of Object.entries(CONTAINER_CLASS_MAP)) {
    const containerEls = root.querySelectorAll<HTMLElement>(`.${className}`);
    for (const el of containerEls) {
      if (seen.has(el)) continue;
      seen.add(el);

      entries.push({
        element: el,
        componentType: templateId,
        variation: parseVariation(el),
        dataAttributes: extractDataAttributes(el),
        isTemplate: true,
        templateId,
      });
    }
  }

  return entries;
}

function parseVariation(el: HTMLElement): number {
  const v = el.getAttribute('data-spm-variation');
  if (!v) return -1;
  const n = parseInt(v, 10);
  return isNaN(n) ? -1 : n;
}

function extractDataAttributes(el: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const attr of el.attributes) {
    if (attr.name.startsWith('data-spm-') && attr.name !== 'data-spm-widget' && attr.name !== 'data-spm-variation') {
      const key = attr.name.slice(9);
      attrs[key] = attr.value;
    }
  }
  return attrs;
}
