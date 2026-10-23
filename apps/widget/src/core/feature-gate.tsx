import { useEffect } from 'preact/hooks';
import type { ComponentType } from 'preact';
import { useConfig } from '@/hooks/useConfig';
import type { WidgetConfig } from '@/types';

// Blocks that belong to a paid add-on (Super Admin → client → Add-ons).
// Map Search: the map designs and their parts. Map View: the explore map
// (the Map choice on results pages reads enableMapView itself).
const MAP_SEARCH_BLOCK = /^(map-template-\d+|map_container|map_location_tags|map_radius_search|map_results_panel|map_view_toggle)$/;

export function blockAllowed(name: string, config: WidgetConfig): boolean {
  if (MAP_SEARCH_BLOCK.test(name)) return config.mapSearchEnabled !== false;
  if (name === 'map_view') return config.enableMapView !== false;
  return true;
}

export function needsGate(name: string): boolean {
  return MAP_SEARCH_BLOCK.test(name) || name === 'map_view';
}

/**
 * Draws the block only while its add-on is on. Follows live settings, so a
 * switch turned off in Super Admin hides the block on the next page load even
 * when the page started from a saved copy. The empty element is hidden too,
 * so no reserved space is left behind.
 */
export function gated(name: string, Component: ComponentType<Record<string, unknown>>): ComponentType<Record<string, unknown>> {
  return function FeatureGate(props: Record<string, unknown>) {
    const config = useConfig();
    const allowed = blockAllowed(name, config);
    const el = props._element as HTMLElement | undefined;
    useEffect(() => {
      if (el) el.style.display = allowed ? '' : 'none';
    }, [el, allowed]);
    if (!allowed) return null;
    return <Component {...props} />;
  };
}
