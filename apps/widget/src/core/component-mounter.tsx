import { render, type ComponentType } from 'preact';
import { resolveSiteAlias, type ScanEntry } from './dom-scanner';
import { getComponent, getTemplate } from '@/registry/component-registry';

interface MountedRoot {
  element: HTMLElement;
  unmount: () => void;
  // What was drawn, for blocks placed by scanDOM (see remountChangedSiteBlocks).
  entry?: ScanEntry;
}

const mountedRoots: MountedRoot[] = [];

export async function mountAll(entries: ScanEntry[]): Promise<void> {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const name = entry.isTemplate ? entry.templateId : entry.componentType;
    console.log(`[SPM] Mounting [${i + 1}/${entries.length}]: ${name}`);
    await mountEntry(entry);
    console.log(`[SPM] Mounted [${i + 1}/${entries.length}]: ${name} OK`);
  }
}

async function mountEntry(entry: ScanEntry): Promise<void> {
  const { element, componentType, variation, dataAttributes, isTemplate, templateId } = entry;

  const name = isTemplate ? templateId : componentType;
  let Component: ComponentType<Record<string, unknown>> | null = null;

  try {
    console.log(`[SPM]   Loading module for "${name}"...`);
    const loadPromise = isTemplate && templateId
      ? getTemplate(templateId)
      : getComponent(componentType);

    Component = await Promise.race([
      loadPromise,
      new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout loading "${name}" after 10s`)), 10_000)
      ),
    ]);
    console.log(`[SPM]   Module loaded for "${name}":`, Component ? 'OK' : 'null');
  } catch (err) {
    console.error(`[SPM] Failed to load component "${name}":`, err);
    return;
  }

  if (!Component) {
    console.warn(`[SPM] No component registered for "${name}"`);
    return;
  }

  // `ref` and `key` mean something to Preact itself: passing data-spm-ref
  // straight through made it try to write `.current` on the string and the
  // whole block failed to render. The filter engine reads these from the
  // element's attributes, so nothing is lost by keeping them out of props.
  const RESERVED_PROPS = new Set(['ref', 'key', 'children', 'dangerouslySetInnerHTML']);
  const props: Record<string, unknown> = { _element: element };
  for (const [name, value] of Object.entries(dataAttributes)) {
    if (!RESERVED_PROPS.has(name)) props[name] = value;
  }
  if (variation >= 0) {
    props.variation = variation;
  }

  try {
    console.log(`[SPM]   Rendering "${name}"...`);
    element.innerHTML = '';
    render(<Component {...props} />, element);
    console.log(`[SPM]   Rendered "${name}" OK`);
  } catch (err) {
    console.error(`[SPM] Failed to render component "${name}":`, err);
    return;
  }

  mountedRoots.push({
    element,
    unmount: () => render(null, element),
    entry,
  });
}

/**
 * A site-* block ("site-search") is drawn with the design the settings knew at
 * the time — often a saved copy (the WP plugin's file, this browser's cache).
 * When the live settings name another design, redraw that block with it, so a
 * new Website Design choice shows at once instead of after the copy refreshes.
 */
export async function remountChangedSiteBlocks(): Promise<void> {
  for (const root of [...mountedRoots]) {
    const entry = root.entry;
    const alias = root.element.getAttribute('data-spm-widget') || '';
    if (!entry || !alias.startsWith('site-')) continue;
    const next = resolveSiteAlias(alias);
    if (next === entry.templateId) continue;
    console.log(`[SPM] Design changed: ${entry.templateId} -> ${next}`);
    root.unmount();
    mountedRoots.splice(mountedRoots.indexOf(root), 1);
    await mountEntry({ ...entry, componentType: next, isTemplate: true, templateId: next });
  }
}

export function isMounted(element: HTMLElement): boolean {
  return mountedRoots.some((r) => r.element === element);
}

/**
 * Unmounts blocks whose element left the page (a single-page app changed
 * route), so their listeners and timers stop. Returns how many.
 */
export function releaseDetached(): number {
  let released = 0;
  for (const root of [...mountedRoots]) {
    if (root.element.isConnected) continue;
    try {
      root.unmount();
    } catch {
      // already gone
    }
    mountedRoots.splice(mountedRoots.indexOf(root), 1);
    released++;
  }
  return released;
}

export function unmountAll(): void {
  for (const root of mountedRoots) {
    try {
      root.unmount();
    } catch {
      // element may already be removed from DOM
    }
  }
  mountedRoots.length = 0;
}

export function mountComponent(
  element: HTMLElement,
  Component: ComponentType<Record<string, unknown>>,
  props: Record<string, unknown> = {},
): () => void {
  render(<Component {...props} />, element);
  const unmount = () => render(null, element);
  mountedRoots.push({ element, unmount });
  return unmount;
}
