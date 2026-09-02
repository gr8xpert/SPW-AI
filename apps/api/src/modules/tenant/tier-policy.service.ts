import { Injectable } from '@nestjs/common';
import {
  DashboardAddons,
  DEFAULT_DASHBOARD_ADDONS,
  TenantTier,
  TIER_PRESETS,
  DEFAULT_TENANT_TIER,
} from '@spm/shared';

// Central policy for how the 3-tier commercial plan maps to dashboard add-on
// flags. Kept as its own service so both the create/update flow and the CSV
// import flow can reach a single source of truth without duplicating the
// merge logic (or accidentally diverging on precedence).
//
// Precedence rules the service enforces:
//   1. Start from the tier preset (TIER_PRESETS[tier]).
//   2. Layer any explicit dashboardAddons overrides on top. This lets
//      super-admin manually enable a single premium add-on for a Tier 1 or
//      Tier 2 client without upgrading their whole tier.
//   3. Anything the DTO does not mention keeps the preset value.
@Injectable()
export class TierPolicyService {
  /**
   * Compute the effective DashboardAddons for a tenant given a tier and
   * optional per-flag overrides. Never mutates its inputs.
   */
  computeAddons(
    tier: TenantTier | undefined,
    overrides?: Partial<DashboardAddons> | null,
  ): DashboardAddons {
    const effectiveTier: TenantTier = tier ?? DEFAULT_TENANT_TIER;
    const preset = TIER_PRESETS[effectiveTier] ?? DEFAULT_DASHBOARD_ADDONS;
    return { ...preset, ...(overrides ?? {}) };
  }

  /**
   * Apply the preset for a new tier to an existing tenant, preserving any
   * add-on the caller explicitly overrides in `overrides`. Returns a fresh
   * DashboardAddons object suitable for tenant.dashboardAddons =.
   *
   * Note: this REPLACES the current dashboardAddons rather than merging into
   * them. That's intentional — a tier change is the operator saying "reset
   * this tenant to the preset for tier X, with these explicit exceptions".
   * Silently preserving previous ad-hoc unlocks across tier changes would
   * make the tier column misleading.
   */
  applyTierPreset(
    tier: TenantTier,
    overrides?: Partial<DashboardAddons> | null,
  ): DashboardAddons {
    return this.computeAddons(tier, overrides);
  }

  /**
   * Return the DashboardAddons a tier grants by default (no overrides).
   * Handy for the CSV import preview so the operator can see what a row
   * will unlock before confirming.
   */
  presetFor(tier: TenantTier): DashboardAddons {
    return { ...(TIER_PRESETS[tier] ?? DEFAULT_DASHBOARD_ADDONS) };
  }

  isValidTier(v: unknown): v is TenantTier {
    return v === 1 || v === 2 || v === 3;
  }
}
