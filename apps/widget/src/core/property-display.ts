import type { Property, WidgetConfig } from '@/types';

// Returns the reference to display on cards + detail. When the tenant enabled
// useAgentReferenceAsDisplay AND the property has an agentReference (MLSC-style
// client number), that wins. Otherwise falls back to the widget's own reference.
// URL slugs and API lookups must always use property.reference — this is a
// display-only accessor.
export function getDisplayReference(
  property: Pick<Property, 'reference' | 'agentReference'>,
  config: Pick<WidgetConfig, 'useAgentReferenceAsDisplay'>,
): string {
  if (config.useAgentReferenceAsDisplay && property.agentReference?.trim()) {
    return property.agentReference;
  }
  return property.reference;
}
