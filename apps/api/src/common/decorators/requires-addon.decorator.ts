import { SetMetadata } from '@nestjs/common';
import type { DashboardAddons } from '@spm/shared';

export type DashboardAddonKey = keyof DashboardAddons;

// Metadata key consumed by DashboardAddonGuard. Exported so the guard can
// reference it without re-declaring the literal string.
export const REQUIRES_ADDON_KEY = 'requiresDashboardAddon';

// Marks a controller or handler as requiring a specific dashboard add-on to be
// enabled for the caller's tenant. The DashboardAddonGuard reads this metadata
// at request time and returns 403 when the add-on is locked. Apply at class
// level when every handler needs the same add-on, or per-handler when only
// some routes are gated.
//
//   @RequiresAddon('emailCampaign')
//   @Controller('api/dashboard/campaigns')
//   export class CampaignController { ... }
export const RequiresAddon = (addon: DashboardAddonKey): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRES_ADDON_KEY, addon);
