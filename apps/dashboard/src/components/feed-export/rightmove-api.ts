// Shapes shared by the Rightmove card's parts.
import type { IdealistaTypeRow } from './idealista-api';

export interface RightmoveSettings {
  enabled: boolean;
  networkId: number | null;
  branchId: number | null;
  mode: 'own' | 'selected';
  propertyIds: number[];
  includeSpanish: boolean;
}

export interface RightmoveOverview {
  settings: RightmoveSettings;
  // Only a Super Admin (or one impersonating) may set the network/branch ID.
  canSetIds: boolean;
  // false = no certificate on the server: pushes are a dry run.
  live: boolean;
  placeCount: number;
  onRightmove: number;
  withErrors: number;
  lastActivity: string | null;
  typeOptions: Array<{ value: string; label: string }>;
  types: IdealistaTypeRow[];
}

export interface RightmoveCheck {
  included: number;
  pending: number;
  skipped: Array<{ id: number; reference: string; reason: string }>;
  issues: Array<{ id: number; reference: string; issues: string[] }>;
  warnings: string[];
  sample: unknown;
}

export interface RightmoveTown {
  locationId: number;
  name: string;
  parent: string;
  listings: number;
  linked: boolean;
  place: { id: number; label: string } | null;
}

export interface RightmovePushSummary {
  dryRun: boolean;
  sent: number;
  unchanged: number;
  removed: number;
  failed: number;
  skipped: number;
  message?: string;
}

export interface RightmoveLogRow {
  id: number;
  action: 'send' | 'remove' | 'list';
  agentRef: string | null;
  success: boolean;
  dryRun: boolean;
  message: string | null;
  errors: Array<{ code: string; description: string }> | null;
  warnings: Array<{ code: string; description: string }> | null;
  createdAt: string;
}

export interface RightmoveLogs {
  logs: RightmoveLogRow[];
  listings: Array<{
    agentRef: string;
    propertyId: number | null;
    rightmoveUrl: string | null;
    lastPushedAt: string | null;
    warnings: Array<{ code: string; description: string }> | null;
  }>;
}
