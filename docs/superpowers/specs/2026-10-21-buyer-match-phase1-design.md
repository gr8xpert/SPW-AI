# Buyer Match — Phase 1 technical design

2026-10-21 · Client plan: https://claude.ai/code/artifact/6d33412a-752e-4673-ac7f-c5ae0ea0fa61 (Phase 1 section).
Phases 2 (tracking, buyer page, alerts, reverse match) and 3 (AI) are out of scope. Nothing below blocks them.

## Decisions (user, 2026-10-21)

- Extend `leads` (Lead = Buyer). Existing leads survive. `contacts` (newsletter) stays separate; each buyer keeps its `contactId`.
- Duplicate leads with the same email are **soft-merged** by the migration: the oldest becomes the buyer and the others get `mergedIntoId` and are hidden. Nothing is deleted and `down()` undoes it.
- Agents are the tenant's active users (`admin` = manager, `user` = agent). A new endpoint gated by Buyer Match lists them. Inviting logins still needs the Team add-on.
- The **Buyers** menu item replaces Leads for every client. Without the add-on it shows the lock screen. The old Leads pages are removed. Website intake keeps saving leads for every tenant.
- The Suggested PDF uses the server-side Puppeteer brochure (`layout-v1`): a cover page plus one page per property.
- Add-on key `buyerMatch`, off by default. Super Admin bypasses it (UI hook + `DashboardAddonGuard`, as today).
- Settings are per tenant and configurable, never hard-coded: assignment (default agent or round-robin), which agents are in the rotation, "agents see each other's buyers", stale days, match weights, and property URL patterns.
- No AI. Buyer Match dashboard text lives in one language file (English only for now).

## Data model (one migration `1777230000000-BuyerMatch.ts`)

### `leads`: new columns
| Group | Columns |
|---|---|
| Role | `role` enum(buyer, registered, seller, professional, estate_agent, developer, landlord, tenant), default `buyer` |
| Contact | `firstName`, `lastName`, `phone` (exists via contact; copied), `mobile`, `language` varchar(5), `preferredContact` enum(call, email, whatsapp), `photoUrl`, `street`, `street2`, `city`, `zip`, `state`, `country` varchar(2) |
| Legal | `idType`, `idNumber`, `lawyer` |
| Pipeline | `stageId` FK buyer_stages (SET NULL), `subStatus` varchar(100), `priority` tinyint 0–3, `timeframe` varchar(50), `dealValue` decimal(15,2), `waitingReplyAt` date, `referredBy` varchar(150), `referralPercent` decimal(5,2) |
| Visit | `visitStart` date, `visitEnd` date |
| Wishlist | `wishlist` JSON (`BuyerWishlist`, below) |
| Answers | `answers` JSON `{ [questionKey]: string[] }` |
| Other people | `relatedContacts` JSON `{name, relation, email, phone}[]` (the Contacts tab) |
| Housekeeping | `mergedIntoId` int null, `lastActivityAt` timestamp, `importRef` varchar(50) (Odoo ID, for re-import) |

`status` stays and is kept in step with the stage kind (open → unchanged, won → `won`, lost → `lost`), so lead scoring, the website health check and webhooks keep working. The legacy `budget*`/`preferred*` columns are copied into `wishlist` and left in place for rollback. After that, `wishlist` is the only source of truth.

```ts
interface BuyerWishlist {
  listingTypes?: ListingType[];          // sale | rent | holiday_rent | development
  locationIds?: number[];                // any level; expanded to descendants when matching
  propertyTypeIds?: number[];
  minBedrooms?: number; minBathrooms?: number;
  budgetMin?: number; budgetMax?: number; currency?: string;
  minBuildSize?: number; maxBuildSize?: number; minPlotSize?: number; maxPlotSize?: number;
  featureIds?: number[];                 // condition, views, pool, setting… are SPM features
  sendMatchesTo?: 'buyer' | 'agent' | 'both';
  guessed?: boolean;                     // true when made from an enquiry, cleared on agent edit
}
```

### New tables (all `tenantId` + index, CASCADE on tenant)
- `buyer_stages`: `name` JSON (per language), `color`, `sortOrder`, `kind` enum(open, won, lost). The migration seeds the 9 defaults for every tenant: New lead, Contacted, Requirements mapped, Selection sent, Viewing, Offer / reservation, Notary, Won (won), Lost (lost). Existing statuses are mapped: new→New lead, contacted→Contacted, qualified→Requirements mapped, viewing_scheduled→Viewing, offer_made/negotiating→Offer, won→Won, lost→Lost.
- `lead_agents`: (`leadId`, `userId`) unique. These are the related agents. The main agent stays `leads.assignedTo`.
- `buyer_tasks`: `leadId`, `title`, `assignedTo` (user), `dueAt` datetime, `doneAt`, `createdBy`.
- `buyer_questions`: `key` (slug), `label` JSON, `options` JSON `{key, label: JSON}[]`, `multiple` bool, `showOnForm` bool, `sortOrder`, `isActive`. The starting set (Purpose, Financial situation, Location setting, Distance to airport, Distance to beach, Distance to shops, Timeframe, How did you find us) is seeded the first time a tenant opens Buyer Match. "How did you find us" also fills `referredBy`.
- `lead_suggestions`: `leadId`, `propertyId` (CASCADE), `note`, `virtualTourUrl`, `visitDate`, `status` enum(suggested, sent, visited, interested, not_interested), `sentAt`, `createdBy`. Unique (`leadId`, `propertyId`).
- `lead_files`: `leadId`, `url`, `name`, `mime`, `size`, `uploadedBy`. Stored in R2 through the existing UploadService.

### `lead_activities`
`userId` becomes nullable, so website events can be logged. New types: `enquiry`, `wishlist_form`, `task_done`, `suggestion_sent`, `import`, `merge`. Every activity insert also updates `leads.lastActivityAt`.

### Tenant settings: `settings.buyerMatch` (`BuyerMatchSettings` in `@spm/shared`)
`assignMode: 'default' | 'round_robin'`, `defaultAgentId`, `rotationAgentIds[]`, `agentsSeeAll` (default false), `staleDays` (default 14), `weights {bedrooms, bathrooms, buildSize, plotSize, feature, featureOverrides: {[featureId]: number}}`, `propertyUrlPatterns {[lang|'default']: 'https://site/{lang}/property/{segment}'}`.
These are written by their own endpoint, not `PUT /tenant/settings`, so saving does not bump the widget syncVersion. Round-robin is stateless: it picks the rotation agent whose latest auto-assigned buyer is oldest, so there is no race across the 2 pm2 processes.

## API (`apps/api/src/modules/lead/buyer/`, part of LeadModule)

All `api/dashboard/buyers/*` routes use `@UseGuards(JwtAuthGuard, TenantGuard, DashboardAddonGuard)` + `@RequiresAddon('buyerMatch')`. Settings, stages and questions writes also need `@Roles('admin')`.

**Visibility** lives in one place, `BuyerAccess.scope(qb, user, settings)`. `admin`/super_admin see everyone. A `user` sees buyers where they are `assignedTo` or in `lead_agents`, unless `agentsSeeAll` is on. `findOne` applies the same rule (404, not 403). Merged rows (`mergedIntoId IS NOT NULL`) are always excluded.

| Area | Routes |
|---|---|
| Buyers | `GET /buyers` (search; filters role, agent, stage, priority, town, budget, source, answers, stale; sort; page), `POST /buyers`, `GET/PUT /buyers/:id`, `PUT /buyers/:id/stage`, `GET /buyers/agents` |
| Activity | `GET/POST /buyers/:id/activities` (includes merged rows' activities) |
| Tasks | `GET /buyers/tasks/today`, `GET/POST /buyers/:id/tasks`, `PUT/DELETE /buyers/tasks/:taskId` |
| Board | `GET /buyers/board` (stages + cards, same filters) |
| Files | `GET/POST/DELETE /buyers/:id/files` |
| Wishlist/match | `PUT /buyers/:id/wishlist`, `GET /buyers/:id/matches?page` |
| Suggested | `GET/POST /buyers/:id/suggestions` (by propertyIds or reference), `PUT/DELETE …/:sid` |
| Send | `POST /buyers/:id/send` `{propertyIds, recipients, message?, lang?}`, `GET /buyers/:id/suggestions.pdf?lang` |
| Settings | `GET/PUT /buyers/settings`, CRUD + reorder for `/buyers/stages` and `/buyers/questions` |
| Import | `POST /buyers/import/odoo/preview` (multipart xlsx), `POST /buyers/import/odoo/apply` (same file + mapping) |
| Public | `GET /api/v1/buyer-questions?lang`, `POST /api/v1/buyer-wishlist` (ApiKeyThrottlerGuard 30/min, reCAPTCHA, never GET) |

Every request body is a class DTO. Nested arrays and objects use `@ValidateNested` + `@Type` (see the DTO interface-array gotcha). JSON booleans from MySQL are coerced with `!!`. Services that change `*Id` fields on rows loaded with relations drop the relation first (see the TypeORM FK gotcha). The old `api/dashboard/leads` routes are removed with the old pages.

## Matching

`PropertySearchService.applyFilters` becomes reusable (public, or an extracted `applySearchFilters`), so matches use exactly the website search rules: active, published, site listing types, min prices, and location/type descendants.
- **Must-haves, filtered in SQL:** listing types, locations, property types, budget (price inside budget; developments by range overlap).
- **Wishes, scored in code:** min bedrooms, min bathrooms, build and plot size, each feature. Each has a weight from settings (feature overrides per feature id).
  `score = round(100 × Σ weight of met wishes / Σ weight of wishes asked)`, or 100 when no wishes are asked.
- Candidates are capped at 500, sorted by score then newest, and paginated in memory. Each result carries `score`, `met[]`, `missed[]` (the start of Phase 2 near-misses) and `suggested: bool`.
- `matchService.match(tenantId, wishlist)` is pure on the wishlist, so Phase 2 alerts and reverse match can reuse it.
- Currency is not converted in Phase 1: the budget is compared with the listing price as-is.

## Sending

- **Email:** a `BuyerMailService` built like `FormMailService` (client-branded, platform SMTP, no platform name). It lists the chosen properties with photo, title (`titleOf`), price (`priceText`) and a link from `propertyUrlPatterns` + `propertyUrlSegment`. It is sent in the buyer's `language`. The email wording comes from new `buyer_email_*` labels (DEFAULT_LABELS + translation memory fill). Each send creates or updates `lead_suggestions` (status `sent`, `sentAt`) and logs a `suggestion_sent` activity.
- **PDF:** `BrochureService.renderSelection(tenant, propertyIds, lang)` builds one HTML document: an agency cover with the buyer's name, then each property's `layout-v1` body with page breaks. It renders through the existing puppeteer pool. Suggested properties only.

## Website intake (`BuyerIntakeService.upsertFromWebsite`)

- **Dedupe:** find the contact by email, then its unmerged lead. If one exists, update it and log an activity. Otherwise create a buyer and assign it with the settings.
- **Enquiry** (`/v1/inquiry`) and **favourites email** with sender (`/v1/share-favorites`): if the buyer has no wishlist yet (or only a guessed one), guess it from the properties:
  - same listing type and type
  - the town (the property's location, walked up to town level)
  - price ±20% (min×0.8 to max×1.2 across items)
  - bedrooms ≥ the lowest
  An agent-edited wishlist is never overwritten. The enquiry is logged as an `enquiry` activity with the property and message.
- **Wishlist form** (`/v1/buyer-wishlist`): the visitor's exact wishlist replaces the old one (the old one is kept in the activity metadata), plus answers and contact fields. Emails: the agent gets a notice; the visitor gets a branded confirmation in the page language (`wishlist_form_*` labels).
- Intake runs for every tenant (the data is just leads). Only the dashboard screens are locked.

## Widget `wishlist-form`

- `registerComponent('wishlist-form', …)` → `components/wishlist-form/RsWishlistForm.tsx`.
- It keeps its own form state and never touches global `useFilters`.
- The location, type and feature pickers inside `RsLocation`, `RsPropertyType` and `RsFeatures` are exported, take `value`/`onChange`, and get a `facets={false}` option (all options shown). Bedroom, bathroom and price options come from the widget config.
- Contact fields reuse the inquiry form's country-code phone (`askVisitorCountry` moved to a shared helper), privacy consent and `useRecaptcha`.
- Buyer questions are fetched from `/v1/buyer-questions?lang`. All labels come from DEFAULT_LABELS in a new `wishlist_form` category, so they can be translated in Labels.
- `setupPage` skips the automatic property search when the page holds only form blocks.
- **WP plugin 2.9.11:** `[spm_wishlist_form]` → `<div class="spm-block" data-spm-widget="wishlist-form">`, listed on the Blocks page.

## Odoo import

- New API dependency `exceljs`, parsed on the server. Columns are found by their Odoo header labels (e.g. `Suggested Properties/Property Reference`).
- A row with an empty `ID` is a sub-row: a further suggested property of the buyer above it.
- **Matching by name:**
  - agents: user name or email
  - towns: `locationKey` on name + aliases
  - types and features: name in any language
  - question options: label
  - role, priority and status: fixed maps
- **Preview** returns: new vs update (by email, then `importRef`), counts, and every value that did not match, with a dropdown to map it to an SPM item or skip it.
- **Apply** sends the same file plus the mapping. It is idempotent on `importRef`. Unmatched values are kept as text in the buyer's notes. Suggestions are created only for references that exist in SPM; missing ones are listed.
- Photos and files are not in the export.
- Tests run against a made-up sample built by `apps/api/test/fixtures/make-odoo-sample.ts`, until the real file arrives.

## Dashboard (`/dashboard/buyers/*`)

| Route | What |
|---|---|
| `/dashboard/buyers` | Card / list toggle, search, filters (role, agent, stage, priority, town, budget, source, answers, stale), group by stage or agent |
| `/dashboard/buyers/[id]` | Header (role radio, stage, stars, agent + related agents, stale badge). Tabs: Wishlist, Matched, Suggested, Contacts, Notes, Visiting period, Files, Activity, Tasks |
| `/dashboard/buyers/board` | dnd-kit kanban by stage (patterns from images-tab) |
| `/dashboard/buyers/today` | My tasks: overdue first, today, then my stale buyers |
| `/dashboard/buyers/settings` | Tabs: General (assignment, visibility, stale days, URL patterns), Stages, Questions (per-language labels), Match weights |
| `/dashboard/buyers/import` | Upload → preview + mapping → apply |

- Every page is wrapped in `LockedRouteGuard addon="buyerMatch"`.
- Fetching uses React Query with `useTenantQueryScope`, and plain fetch functions (never `useCallback` around `api.get`).
- All Buyer Match text goes through `buyers/_i18n/en.ts` + `useBuyerText()`.
- The Matched table is extracted from `properties/page.tsx` into a shared `PropertyRowsTable`.
- Sidebar: Leads → `{ name: 'Buyers', href: '/dashboard/buyers', addon: 'buyerMatch' }`.
- Super Admin client create/edit pages get the Buyer Match toggle.

## Testing

- **Jest unit specs:**
  - match scoring and must-have mapping
  - wishlist guess
  - visibility scope
  - dedupe/upsert
  - Odoo parser on the sample (rows, sub-rows, unmatched)
  - migration status→stage map
- **Local E2E per milestone:** API 3001, dashboard 3020, widget 5173, tenant 2 (e2e-client@test.local). Use curl for the API and a real browser for the screens, logged in as an admin and as a `user` agent (to check visibility). Also check a tenant without the add-on (locked) and Super Admin impersonation (unlocked).
- `pnpm build` must pass for api, dashboard and widget. Nothing is committed; the user commits after testing by hand.
