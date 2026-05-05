import { render, type ComponentType } from 'preact';
import type { ScanEntry } from './dom-scanner';
import { getComponent, getTemplate } from '@/registry/component-registry';

interface MountedRoot {
  element: HTMLElement;
  unmount: () => void;
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

  const props: Record<string, unknown> = {
    ...dataAttributes,
    _element: element,
  };
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
  });
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
