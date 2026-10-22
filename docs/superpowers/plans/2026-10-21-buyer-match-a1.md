# Buyer Match A1 — Core buyers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Leads into Buyers. A1 covers the data model, the migration (stages, soft-merge, add-on key), the buyer list and card views, the buyer record (role, contact, legal, agents, pipeline fields, Contacts, Notes, Visiting period, Activity), agent visibility and the Super Admin toggle.

**Architecture:** The `leads` table gains the buyer columns. New `buyer_stages` and `lead_agents` tables are added. Buyer logic lives in `apps/api/src/modules/lead/buyer/` inside LeadModule and is served at `api/dashboard/buyers/*`, gated by the `buyerMatch` add-on. The dashboard gets `/dashboard/buyers` (list) and `/dashboard/buyers/[id]` (record) in place of the Leads pages.

**Tech Stack:** NestJS 10, TypeORM (MySQL 8), class-validator, Jest. Next.js 14, React Query v5, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-10-21-buyer-match-phase1-design.md`

## Global Constraints

- Every `api/dashboard/buyers/*` route: `@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)` + `@RequiresAddon('buyerMatch')`. Settings and stage writes also need `@UseGuards(RolesGuard)` + `@Roles('admin')`. super_admin passes, as it does today.
- Bodies are class DTOs. Arrays and objects of objects use `@ValidateNested({ each: true })` + `@Type(() => X)`.
- MySQL JSON booleans arrive as 0/1, so coerce with `!!`.
- Never `save()` a row loaded with relations after changing an `*Id`. Use `repository.update(id, patch)` instead.
- Dashboard: no `useCallback` around `api.get`. Queries are keyed with `useTenantQueryScope()` and use `enabled: ready && api.isReady`.
- All Buyer Match dashboard text goes through `useBuyerText()` (`buyers/_i18n/en.ts`).
- Visibility: `admin`/super_admin see all. `user` sees buyers where they are `assignedTo` or in `lead_agents`, unless `settings.buyerMatch.agentsSeeAll`. Rows with `mergedIntoId IS NOT NULL` are never listed.
- Don't commit. Never stage `.claude/settings.json` or `docs/locations-rosvan.csv`. The user commits after testing by hand.
- One migration per milestone. A1 = `1777230000000-BuyerMatchCore.ts`. The spec's single migration is split so each milestone can be tested and deployed on its own.

## File map

| File | Responsibility |
|---|---|
| `packages/shared/src/types/buyer.types.ts` (new) | `BuyerRole`, `BUYER_ROLES`, `BuyerWishlist`, `BuyerMatchSettings`, `DEFAULT_BUYER_MATCH_SETTINGS`, `RelatedContact` |
| `packages/shared/src/types/tenant.types.ts` | `buyerMatch` add-on key; `TenantSettings.buyerMatch?` |
| `apps/api/src/database/entities/lead.entity.ts` | new Lead columns, LeadActivity.userId nullable + new types |
| `apps/api/src/database/entities/buyer-stage.entity.ts` (new) | `BuyerStage` |
| `apps/api/src/database/entities/lead-agent.entity.ts` (new) | `LeadAgent` |
| `apps/api/src/modules/lead/buyer/buyer-defaults.ts` (new) | default stages, `statusToStageIndex`, `stageKindToStatus`, `splitName` (pure) |
| `apps/api/src/database/migrations/1777230000000-BuyerMatchCore.ts` (new) | schema + seed stages + map status + soft-merge + wishlist copy + add-on key |
| `apps/api/src/modules/lead/buyer/buyer-access.ts` (new) | `visibilityClause()` (pure) + `applyVisibility(qb, …)` |
| `apps/api/src/modules/lead/buyer/buyer-stage.service.ts` (new) | list/ensure stages, `defaultStageId` |
| `apps/api/src/modules/lead/buyer/buyer-settings.service.ts` (new) | read/write `settings.buyerMatch` |
| `apps/api/src/modules/lead/buyer/buyer.service.ts` (new) | list, get, create, update, stage, agents, activities |
| `apps/api/src/modules/lead/buyer/buyer.controller.ts` (new) | routes |
| `apps/api/src/modules/lead/buyer/dto/*.ts` (new) | `ListBuyersDto`, `CreateBuyerDto`, `UpdateBuyerDto`, `RelatedContactDto`, `BuyerActivityDto`, `SetStageDto`, `BuyerSettingsDto` |
| `apps/api/src/modules/lead/lead.module.ts`, `lead.service.ts` | register new pieces; `create()` sets stage + names + lastActivityAt |
| `apps/api/src/modules/lead/lead.controller.ts` | deleted (replaced by buyers routes) |
| add-on plumbing (API) | `tenant.service.ts`, `super-admin.service.ts`, `tier-policy.service.ts`, super-admin DTOs |
| add-on plumbing (dashboard) | `hooks/use-dashboard-addons.ts`, `admin/clients/create/page.tsx`, `admin/clients/[id]/edit/page.tsx` |
| `apps/dashboard/src/app/(dashboard)/dashboard/buyers/_i18n/en.ts` + `use-buyer-text.ts` (new) | wording |
| `…/buyers/use-buyers.ts` (new) | React Query hooks + types |
| `…/buyers/page.tsx` + `_components/buyer-card.tsx`, `buyer-filters.tsx`, `buyer-create-dialog.tsx` (new) | list / cards |
| `…/buyers/[id]/page.tsx` + `_components/buyer-header.tsx`, `details-tab.tsx`, `contacts-tab.tsx`, `notes-tab.tsx`, `visit-tab.tsx`, `activity-tab.tsx` (new) | record |
| `…/buyers/settings/page.tsx` (new) | General settings (visibility, assignment) |
| `components/layout/sidebar.tsx`, `dashboard-content.tsx` | Leads → Buyers |
| `…/dashboard/leads/*` | deleted |

---

### Task 1: Shared types + add-on key

**Files:** Create `packages/shared/src/types/buyer.types.ts`; Modify `packages/shared/src/types/tenant.types.ts` (DashboardAddons ~L446-500, TenantSettings), `packages/shared/src/index.ts` (export).

**Produces:**
```ts
export const BUYER_ROLES = ['buyer','registered','seller','professional','estate_agent','developer','landlord','tenant'] as const;
export type BuyerRole = (typeof BUYER_ROLES)[number];
export type PreferredContact = 'call' | 'email' | 'whatsapp';
export interface RelatedContact { name: string; relation?: string; email?: string; phone?: string }
export interface BuyerWishlist { listingTypes?: ('sale'|'rent'|'holiday_rent'|'development')[]; locationIds?: number[]; propertyTypeIds?: number[];
  minBedrooms?: number; minBathrooms?: number; budgetMin?: number; budgetMax?: number; currency?: string;
  minBuildSize?: number; maxBuildSize?: number; minPlotSize?: number; maxPlotSize?: number; featureIds?: number[];
  sendMatchesTo?: 'buyer'|'agent'|'both'; guessed?: boolean }
export interface BuyerMatchSettings { assignMode: 'default'|'round_robin'; defaultAgentId: number | null; rotationAgentIds: number[];
  agentsSeeAll: boolean; staleDays: number }
export const DEFAULT_BUYER_MATCH_SETTINGS: BuyerMatchSettings = { assignMode: 'default', defaultAgentId: null, rotationAgentIds: [], agentsSeeAll: false, staleDays: 14 };
```
(Weights and URL patterns are added to `BuyerMatchSettings` in milestone B.)

- [ ] Add `buyerMatch: boolean` to `DashboardAddons`. Set `false` in `DEFAULT_DASHBOARD_ADDONS`, `true` in `ALL_ENABLED_DASHBOARD_ADDONS`, and add it to each `TIER_PRESETS` entry (tier 3 true, others false). Add `buyerMatch?: Partial<BuyerMatchSettings>` to `TenantSettings`.
- [ ] Run `pnpm --filter @spm/shared build`. Expected: no errors. Then run `pnpm --filter api exec tsc --noEmit -p tsconfig.json` and fix every place that builds a full `DashboardAddons` literal (tenant.service.ts:593-599 fallback, super-admin.service.ts, tier-policy.service.ts) until it compiles.

### Task 2: Pure buyer defaults (TDD)

**Files:** Create `apps/api/src/modules/lead/buyer/buyer-defaults.ts`, Test `apps/api/src/modules/lead/buyer/buyer-defaults.spec.ts`.

**Produces:** `DEFAULT_STAGES: {name: Record<string,string>; color: string; kind: 'open'|'won'|'lost'}[]` (9 entries, en + es), `statusToStageIndex(status: LeadStatus): number`, `stageKindToStatus(kind, current: LeadStatus): LeadStatus`, `splitName(full?: string|null): {firstName: string|null; lastName: string|null}`.

- [ ] Write the failing tests:
```ts
import { DEFAULT_STAGES, statusToStageIndex, stageKindToStatus, splitName } from './buyer-defaults';
describe('buyer defaults', () => {
  it('has 9 stages ending in won + lost', () => {
    expect(DEFAULT_STAGES).toHaveLength(9);
    expect(DEFAULT_STAGES[7].kind).toBe('won');
    expect(DEFAULT_STAGES[8].kind).toBe('lost');
  });
  it.each([['new',0],['contacted',1],['qualified',2],['viewing_scheduled',4],['offer_made',5],['negotiating',5],['won',7],['lost',8]])
    ('maps %s to stage %i', (s, i) => expect(statusToStageIndex(s as any)).toBe(i));
  it('keeps an open status, forces won/lost', () => {
    expect(stageKindToStatus('open', 'qualified')).toBe('qualified');
    expect(stageKindToStatus('open', 'won')).toBe('contacted');
    expect(stageKindToStatus('won', 'new')).toBe('won');
    expect(stageKindToStatus('lost', 'new')).toBe('lost');
  });
  it('splits names', () => {
    expect(splitName('Ana María López')).toEqual({ firstName: 'Ana', lastName: 'María López' });
    expect(splitName('Cher')).toEqual({ firstName: 'Cher', lastName: null });
    expect(splitName('  ')).toEqual({ firstName: null, lastName: null });
  });
});
```
- [ ] Run `pnpm --filter api test -- buyer-defaults`. Expected: FAIL (module not found).
- [ ] Implement:
```ts
import type { LeadStatus } from '../../../database/entities';
export type StageKind = 'open' | 'won' | 'lost';
export const DEFAULT_STAGES: { name: Record<string, string>; color: string; kind: StageKind }[] = [
  { name: { en: 'New lead', es: 'Nuevo contacto' }, color: '#3b82f6', kind: 'open' },
  { name: { en: 'Contacted', es: 'Contactado' }, color: '#06b6d4', kind: 'open' },
  { name: { en: 'Requirements mapped', es: 'Requisitos definidos' }, color: '#8b5cf6', kind: 'open' },
  { name: { en: 'Selection sent', es: 'Selección enviada' }, color: '#a855f7', kind: 'open' },
  { name: { en: 'Viewing', es: 'Visita' }, color: '#f59e0b', kind: 'open' },
  { name: { en: 'Offer / reservation', es: 'Oferta / reserva' }, color: '#f97316', kind: 'open' },
  { name: { en: 'Notary', es: 'Notaría' }, color: '#14b8a6', kind: 'open' },
  { name: { en: 'Won', es: 'Ganado' }, color: '#22c55e', kind: 'won' },
  { name: { en: 'Lost', es: 'Perdido' }, color: '#94a3b8', kind: 'lost' },
];
const STATUS_INDEX: Record<LeadStatus, number> = { new: 0, contacted: 1, qualified: 2, viewing_scheduled: 4, offer_made: 5, negotiating: 5, won: 7, lost: 8 };
export const statusToStageIndex = (s: LeadStatus): number => STATUS_INDEX[s] ?? 0;
export function stageKindToStatus(kind: StageKind, current: LeadStatus): LeadStatus {
  if (kind === 'won' || kind === 'lost') return kind;
  return current === 'won' || current === 'lost' ? 'contacted' : current;
}
export function splitName(full?: string | null) {
  const parts = (full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: null, lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') || null };
}
```
- [ ] Run the test again. Expected: PASS.

### Task 3: Entities + migration

**Files:** Modify `lead.entity.ts`; Create `buyer-stage.entity.ts`, `lead-agent.entity.ts`; export both from `database/entities/index.ts`; Create migration.

**Produces:** these Lead columns:
- `role: BuyerRole`, `firstName`, `lastName`, `phone`, `mobile`, `language`, `preferredContact`, `photoUrl`, `street`, `street2`, `city`, `zip`, `state`, `country`
- `idType`, `idNumber`, `lawyer`
- `stageId`, `stage?: BuyerStage`, `subStatus`, `priority`, `timeframe`, `dealValue`, `waitingReplyAt`, `referredBy`, `referralPercent`
- `visitStart`, `visitEnd`, `wishlist: BuyerWishlist|null`, `answers: Record<string,string[]>|null`, `relatedContacts: RelatedContact[]|null`
- `mergedIntoId`, `lastActivityAt`, `importRef`, `agents?: LeadAgent[]`

All new columns are nullable, except `role` (default 'buyer') and `priority` (default 0). Also:
- `LeadActivity.userId: number | null`.
- `LeadActivityType` gains `'enquiry' | 'wishlist_form' | 'task_done' | 'suggestion_sent' | 'import' | 'merge'`.
- `BuyerStage {id, tenantId, name: Record<string,string>, color, sortOrder, kind, createdAt}`.
- `LeadAgent {id, leadId, userId}` with unique (`leadId`, `userId`), CASCADE on both.

- [ ] Write the entities. Decimal columns use a `{ to: v => v, from: v => v == null ? null : Number(v) }` transformer for `dealValue` and `referralPercent`.
- [ ] Write the migration `BuyerMatchCore1777230000000`. Every step is guarded by `hasColumn`/`hasTable` so a re-run is safe. `up()`:
  1. `CREATE TABLE buyer_stages` (id, tenantId INT NOT NULL, name JSON NOT NULL, color VARCHAR(9), sortOrder INT DEFAULT 0, kind ENUM('open','won','lost') DEFAULT 'open', createdAt, INDEX(tenantId), FK tenant CASCADE).
  2. `CREATE TABLE lead_agents` (id, leadId, userId, UNIQUE(leadId,userId), FKs CASCADE).
  3. `ALTER TABLE leads ADD` all the columns above. Add `stageId` FK → buyer_stages SET NULL, `mergedIntoId` FK → leads SET NULL. Add INDEX(tenantId, mergedIntoId, stageId) and INDEX(tenantId, lastActivityAt).
  4. `ALTER TABLE lead_activities MODIFY userId INT NULL` and extend its type ENUM.
  5. For each `SELECT DISTINCT tenantId FROM tenants`: insert `DEFAULT_STAGES` (sortOrder = index), then `UPDATE leads SET stageId = <id of stage statusToStageIndex(status)> WHERE tenantId = ? AND status IN (...)`. Run one UPDATE per index group.
  6. Names: `UPDATE leads l JOIN contacts c ON c.id = l.contactId SET l.phone = COALESCE(l.phone, c.phone)`. Then compute firstName/lastName in TS with `splitName(c.name)` and update per row (row counts are small).
  7. Wishlist copy: `UPDATE leads SET wishlist = JSON_OBJECT(...)` from `budgetMin`, `budgetMax`, `budgetCurrency`, `preferredLocations` → locationIds, `preferredTypes` → propertyTypeIds, `preferredFeatures` → featureIds, `preferredBedroomsMin` → minBedrooms. Only `WHERE wishlist IS NULL AND (budgetMin IS NOT NULL OR preferredLocations IS NOT NULL OR preferredTypes IS NOT NULL OR preferredBedroomsMin IS NOT NULL)`. Use `JSON_OBJECT` with NULLs stripped in TS: select the rows, build the object, update them.
  8. `UPDATE leads l SET lastActivityAt = GREATEST(l.updatedAt, COALESCE((SELECT MAX(a.createdAt) FROM lead_activities a WHERE a.leadId = l.id), l.updatedAt))`.
  9. Soft-merge: `UPDATE leads l JOIN (SELECT contactId, MIN(id) keepId FROM leads GROUP BY contactId HAVING COUNT(*) > 1) d ON d.contactId = l.contactId AND l.id <> d.keepId SET l.mergedIntoId = d.keepId`. Then, on each kept row, raise lastActivityAt to the newest of its merged rows. Skip a notes merge: notes of merged rows show in the activity feed instead (Task 5).
  10. Add-on key: the `JSON_SET(... '$.buyerMatch', false)` pattern from `1776330000000-AiTranslationAddon.ts`.
  `down()`: remove the add-on key, `UPDATE leads SET mergedIntoId = NULL`, drop the new columns and FKs, `DELETE FROM lead_activities WHERE userId IS NULL`, `MODIFY userId INT NOT NULL`, restore the old ENUM, drop `lead_agents` and `buyer_stages`.
- [ ] Start the services: `docker compose -p spw up -d mysql redis`. Then `pnpm --filter api build && cd apps/api && pnpm migration:run`. Expected: `BuyerMatchCore1777230000000 has been executed successfully`.
- [ ] Verify in SQL:
  - `SELECT tenantId, COUNT(*) FROM buyer_stages GROUP BY tenantId` gives 9 per tenant.
  - `SELECT COUNT(*) FROM leads WHERE stageId IS NULL` gives 0.
  - `SELECT COUNT(*) FROM leads WHERE mergedIntoId IS NOT NULL` equals the duplicate count measured before running.
- [ ] Check reversibility: `pnpm migration:revert`, confirm the leads row count is unchanged and the schema is back, then run it again.

### Task 4: Visibility (TDD)

**Files:** Create `buyer-access.ts`, Test `buyer-access.spec.ts`.

**Produces:**
```ts
export interface BuyerViewer { id: number; role: string; originalRole?: string }
export function seesAllBuyers(v: BuyerViewer, agentsSeeAll: boolean): boolean
export function visibilityClause(v: BuyerViewer, agentsSeeAll: boolean, alias = 'lead'): { sql: string; params: Record<string, unknown> } | null
export function applyVisibility(qb: SelectQueryBuilder<Lead>, v: BuyerViewer, agentsSeeAll: boolean, alias = 'lead'): void
```
- [ ] Failing tests:
  - admin sees all (`null` clause).
  - super_admin and originalRole super_admin see all.
  - `user` with agentsSeeAll sees all.
  - `user` without it gets `(lead.assignedTo = :viewerId OR EXISTS (SELECT 1 FROM lead_agents la WHERE la.leadId = lead.id AND la.userId = :viewerId))` with `{ viewerId: 7 }`.
  - webmaster sees all (support role).
- [ ] Implement:
```ts
const ALL = new Set(['super_admin', 'webmaster', 'admin']);
export const seesAllBuyers = (v: BuyerViewer, seeAll: boolean) => seeAll || ALL.has(v.role) || v.originalRole === 'super_admin';
export function visibilityClause(v: BuyerViewer, seeAll: boolean, alias = 'lead') {
  if (seesAllBuyers(v, seeAll)) return null;
  return { sql: `(${alias}.assignedTo = :viewerId OR EXISTS (SELECT 1 FROM lead_agents la WHERE la.leadId = ${alias}.id AND la.userId = :viewerId))`, params: { viewerId: v.id } };
}
export function applyVisibility(qb, v, seeAll, alias = 'lead') { const c = visibilityClause(v, seeAll, alias); if (c) qb.andWhere(c.sql, c.params); }
```
- [ ] Run `pnpm --filter api test -- buyer-access`. Expected: PASS.

### Task 5: Stage, settings and buyer services

**Files:** Create `buyer-stage.service.ts`, `buyer-settings.service.ts`, `buyer.service.ts`, `dto/*.ts`, Test `buyer.service.spec.ts`; Modify `lead.service.ts` (create), `lead.module.ts`.

**Consumes:** Tasks 2–4. **Produces:**
- `BuyerStageService.list(tenantId): Promise<BuyerStage[]>`. If the tenant has no stages, it seeds `DEFAULT_STAGES` first, so tenants created after the migration work.
- `BuyerStageService.defaultStageId(tenantId): Promise<number>` (first open stage).
- `BuyerSettingsService.get(tenantId): Promise<BuyerMatchSettings>` (merged with defaults, `!!` coercion) and `.update(tenantId, patch)`. It writes `tenants.settings` with `JSON_SET`-free read-modify-write of `settings.buyerMatch` only, through `tenantRepository.update`.
- `BuyerService`:
  - `list(tenantId, viewer, dto: ListBuyersDto) → {data: BuyerListItem[], total}`. Filters: q (name/email/phone), role, agentId, stageId, priority, source, locationId (`JSON_CONTAINS(lead.wishlist->'$.locationIds', :loc)`), budgetMin/budgetMax overlap on `wishlist` JSON, `stale` (lastActivityAt < now − staleDays and stage kind open). Sort: lastActivityAt desc (default) | createdAt | name | priority. Page/limit (default 24). Select contact email, agent name and stage.
  - `get(tenantId, viewer, id)`: relations contact, assignedToUser, stage, agents.user, property. Returns 404 if not visible or merged. Also returns `mergedIds: number[]`.
  - `create(tenantId, viewer, dto: CreateBuyerDto)`: finds the contact by email. If an unmerged lead exists for that contact, throws `ConflictException({ code: 'BUYER_EXISTS', id })`. Otherwise it calls `contactService.findOrCreate` and inserts with source dto.source ?? 'other', `stageId = defaultStageId`, `assignedTo = dto.assignedTo ?? viewer.id`, `lastActivityAt = now`.
  - `update(tenantId, viewer, id, dto: UpdateBuyerDto)`: `repository.update` with only the keys present (never save the loaded entity). If `email` changed, re-link `contactId` through findOrCreate. If `agentIds` is present, replace the `lead_agents` rows (excluding assignedTo). `assignedTo` change logs an `assignment` activity.
  - `setStage(tenantId, viewer, id, stageId)`: checks the stage belongs to the tenant, updates `stageId` + `status = stageKindToStatus(kind, status)` + wonAt/lostAt, and logs a `status_change` activity `{fromStageId, toStageId}`.
  - `agents(tenantId) → {id, name, email, role, avatarUrl}[]`: active users with role admin|user.
  - `activities(tenantId, viewer, id)`: activities where `leadId IN (id, ...mergedIds)`, newest first, user name joined. The notes of merged rows are prepended as synthetic `{type:'note', description, createdAt, fromMergedLeadId}` entries.
  - `addActivity(tenantId, viewer, id, dto)`: inserts the activity and sets `lastActivityAt = now` (and `lastContactAt` for call/email/sms/viewing/meeting).
- DTOs:
  - `CreateBuyerDto`: email (IsEmail), firstName, lastName, phone, mobile, role (IsIn BUYER_ROLES), language, source, assignedTo, notes.
  - `UpdateBuyerDto`: everything in Create (all optional), plus preferredContact, photoUrl, the address fields, idType, idNumber, lawyer, subStatus, priority (IsInt 0–3), timeframe, dealValue, waitingReplyAt (IsDateString), referredBy, referralPercent (0–100), visitStart, visitEnd, notes, `agentIds` (IsInt each), and `relatedContacts` (`@ValidateNested({each:true}) @Type(() => RelatedContactDto)`, max 20).
  - `ListBuyersDto`: query params with `@Type(() => Number)`.
  - `SetStageDto {stageId}`. `BuyerActivityDto {type IsIn note|call|email|sms|viewing|meeting|offer, description}`.
  - `BuyerSettingsDto`: assignMode, defaultAgentId, rotationAgentIds, agentsSeeAll, staleDays 1–365.
- `LeadService.create` (website intake today) additionally sets `stageId = await stages.defaultStageId(tenantId)`, `firstName/lastName` from `splitName(dto.name)`, `phone`, and `lastActivityAt = now`. Proper dedupe arrives in milestone C.
- [ ] Failing spec `buyer.service.spec.ts`, with mocked repositories in the style of `form-mail.service.spec.ts`:
  - (a) `create` throws `ConflictException` with the existing id when the email has an unmerged buyer.
  - (b) `update` calls `leadRepo.update` with only the sent keys and never `save`.
  - (c) `setStage` to a won stage writes `status: 'won'` and `wonAt`.
  - (d) `setStage` with another tenant's stage throws NotFound.
- [ ] Implement until `pnpm --filter api test -- buyer` passes.

### Task 6: Controller, module wiring, retire old leads routes

**Files:** Create `buyer.controller.ts`; Modify `lead.module.ts` (add BuyerStage, LeadAgent, User and Tenant to forFeature; providers; controller); Delete `lead.controller.ts`.

Routes (prefix `api/dashboard/buyers`):
- `GET /` list
- `GET /agents`
- `GET /stages`
- `GET /settings`
- `PUT /settings` (admin)
- `POST /`
- `GET /:id`
- `PUT /:id`
- `PUT /:id/stage`
- `GET /:id/activities`
- `POST /:id/activities`

Static routes are declared before `/:id`. The viewer comes from `@CurrentUser()` → `{ id: user.sub, role: user.role, originalRole: user.originalRole }`.
- [ ] Check `dashboard-content.tsx` for its use of `/api/dashboard/leads*`. If it uses stats, add `GET /buyers/stats` (`{total, newThisWeek, byStageKind}`, honouring visibility) and point the dashboard at it.
- [ ] `pnpm --filter api build`. Expected: OK. Restart the API (`node dist/main.js`). Then run the scratchpad script `a1-api.js`, logged in as `e2e-client@test.local`:
  - before enabling the add-on: `GET /buyers` returns 403 ADDON_LOCKED
  - set `dashboardAddons.buyerMatch = true` for tenant 2 in SQL and wait out the 30 s guard cache
  - `GET /buyers` returns 200 with the migrated leads
  - `POST` returns 201, a second `POST` with the same email returns 409
  - `PUT` saves role, priority and relatedContacts
  - `PUT /stage` to Won makes status won
  - activities lists the new entries
- [ ] Agent visibility: create a `user` in tenant 2 (SQL insert with bcrypt hash of `password123`, role `user`). Log in as them: `GET /buyers` shows only buyers assigned to them or linked to them, and `GET /buyers/:otherId` returns 404. Set `agentsSeeAll=true` and they see all. A `PUT /settings` from that user returns 403.

### Task 7: Add-on toggle (Super Admin + dashboard hook)

**Files:** Modify `apps/dashboard/src/hooks/use-dashboard-addons.ts` (interface, ALL_LOCKED, ALL_UNLOCKED), `app/(admin)/admin/clients/[id]/edit/page.tsx` (zod schema L60, TIER_ADDON_PRESETS L75, defaults L141/L193 with `!!`, toggle list ~L642), `app/(admin)/admin/clients/create/page.tsx` (~L637); API super-admin DTOs if they whitelist keys.

- [ ] Add a `buyerMatch` toggle labelled "Buyer Match" with the description "Buyers, wishlists, matching and pipeline". Run `pnpm --filter dashboard exec tsc --noEmit`. Expected: no errors.
- [ ] Browser check: as Super Admin, open the tenant 2 edit page, switch Buyer Match off, save, and reload: it is still off. Switch it back on.

### Task 8: Dashboard wording + data hooks

**Files:** Create `buyers/_i18n/en.ts`, `buyers/use-buyer-text.ts`, `buyers/use-buyers.ts`.

**Produces:**
```ts
// en.ts
export const en = { menu: 'Buyers', title: 'Buyers', newBuyer: 'New buyer', search: 'Search name, email or phone', roles: { buyer: 'Buyer', registered: 'Registered', seller: 'Seller', professional: 'Professional', estate_agent: 'Estate Agent', developer: 'Developer', landlord: 'Landlord', tenant: 'Tenant' }, /* …every string the A1 screens use… */ } as const;
export type BuyerText = typeof en;
// use-buyer-text.ts
export function useBuyerText(): BuyerText { return en; } // one place to switch language later
```
- `use-buyers.ts` exports types `BuyerListItem` and `Buyer` (matching the API), `BuyerStage`, `BuyerAgent`, `BuyerActivity`, plus `buyerKeys`.
- Hooks: `useBuyers(params)`, `useBuyer(id)`, `useBuyerStages()`, `useBuyerAgents()`, `useBuyerActivities(id)`, `useBuyerSettings()`, `useCreateBuyer()`, `useUpdateBuyer(id)`, `useSetBuyerStage(id)`, `useAddBuyerActivity(id)`, `useUpdateBuyerSettings()`.
- Each query uses `useApi()` + `useTenantQueryScope()` in its key, with an inline `queryFn: async () => api.get(...)` (no useCallback). Mutations invalidate `buyerKeys.all`.
- [ ] `tsc --noEmit` passes.

### Task 9: Buyers list (cards + list)

**Files:** Create `buyers/page.tsx`, `_components/buyer-card.tsx`, `buyer-filters.tsx`, `buyer-create-dialog.tsx`, `buyer-table.tsx`.

- Page = `LockedRouteGuard addon="buyerMatch" featureName="Buyer Match"` around `BuyersPageInner`.
- Header: title, card/list toggle (kept in `?view=`), and New buyer. Links to the Board and To do pages are added in A2.
- Filters row: search (debounced 300 ms), role, agent, stage, priority (0–3), source, "Stale only". State lives in the URL query so a reload keeps it.
- **Card:** avatar (photo or initials), name, email, country, 0–3 stars, stage badge in the stage colour, agent name, and "last activity N days ago". Click opens `/dashboard/buyers/[id]`.
- **List:** a table with Name, Email, Phone, Role, Stage, Agent, Priority, Last activity.
- Paging uses `PageNumbers`.
- **Create dialog:** first/last name, email (required), phone, role (default Buyer), agent (default me). On 409 it shows "This email already belongs to …" with an Open link.
- [ ] Browser check on :3020 as e2e-client: migrated leads appear, filters narrow the list, the card/list toggle and paging work, and a create + duplicate shows the 409 link.

### Task 10: Buyer record

**Files:** Create `buyers/[id]/page.tsx`, `_components/buyer-header.tsx`, `details-tab.tsx`, `contacts-tab.tsx`, `notes-tab.tsx`, `visit-tab.tsx`, `activity-tab.tsx`.

- **Header:**
  - name and photo URL
  - role radio group (8 roles, saves on change)
  - stage select (calls `useSetBuyerStage`)
  - priority stars (click to set 0–3)
  - main agent select plus related agents (multi-select checkboxes in a dropdown)
  - email/phone with `mailto:`/`tel:`, and a WhatsApp button `https://wa.me/<digits of mobile||phone>`
- **Tabs:** Details, Contacts, Notes, Visiting period, Activity. Wishlist, Matched, Suggested, Files and Tasks arrive in later milestones and are not shown as placeholders.
- **Details:** three cards, each with its own Save button (only changed fields are sent):
  - Contact: names, phone, mobile, email, language (tenant languages), preferred contact, address
  - Identity & legal: ID type, ID number, lawyer
  - Pipeline: sub-status, timeframe, deal value, waiting-for-reply date, referred by, referral %
- **Contacts:** rows of name / relation / email / phone with add and remove, saved as `relatedContacts`.
- **Notes:** a textarea for `notes` (internal) with Save.
- **Visiting period:** start and end dates with Save.
- **Activity:** a log form (type + text) and a timeline with icon per type, user name ("Website" when userId is null) and relative time. Entries from merged leads get a "from earlier enquiry" tag.
- [ ] Browser check: change role, stage, stars, agent and related agents, each field group, contacts, notes and dates. Reload and everything persists. The activity timeline shows the stage and assignment changes.

### Task 11: Settings page, menu, remove Leads

**Files:** Create `buyers/settings/page.tsx`; Modify `components/layout/sidebar.tsx:85`, `dashboard-content.tsx`; Delete `dashboard/leads/` (page.tsx, [id]/page.tsx, use-leads.ts).

- **Settings (General card, admins only; a `user` sees a read-only notice):**
  - "Agents can see each other's buyers" switch
  - new website buyers go to: Default agent (select) / Round-robin (checkbox list of agents)
  - stale after N days
  Saved with `useUpdateBuyerSettings`. Stages, Questions and Match weights tabs come in A2/B.
- **Sidebar:** replace the Leads item with `{ name: 'Buyers', href: '/dashboard/buyers', icon: UserCircle, addon: 'buyerMatch' }`, without `minTier`. Add a gear link to settings in the buyers page header.
- Grep the dashboard for any other `/dashboard/leads` link and repoint it.
- [ ] Builds: `pnpm --filter api build`, `pnpm --filter dashboard build` (then restart `npx next dev -p 3020`, see the memory note) and `pnpm --filter api test`. Expected: all pass. Also run `pnpm --filter widget build`, since the shared package changed.
- [ ] Final browser pass:
  - tenant 2 admin: the full flow works
  - the agent login sees only their own buyers
  - a tenant with buyerMatch off shows a greyed Buyers item, the lock screen at /dashboard/buyers, and a 403 from the API
  - Super Admin "Viewing as" that tenant is unlocked
- [ ] Write the handoff `D:\VirtualOffice\_Shared\handoffs\spw-fullstack-handoff.md` (new dated section) and update the `project_buyers_module.md` memory. Don't commit.
