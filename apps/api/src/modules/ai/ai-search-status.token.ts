import type { Tenant } from '../../database/entities';

// Lets the widget-config endpoint (TenantModule) report whether to show the AI
// buttons without importing AiModule, which already imports TenantModule.
// Looked up by this token through ModuleRef at request time.
export const AI_SEARCH_STATUS = 'AI_SEARCH_STATUS';

export interface AiSearchStatusProvider {
  publicStatus(tenant: Tenant): Promise<{ enabled: boolean; voice: boolean }>;
}
