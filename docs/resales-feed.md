# Resales-Online Feed Integration

End-to-end notes for importing properties from the Resales-Online WebAPI V6 into the SPW dashboard. Written so this can be re-implemented on another project from scratch.

## Endpoints

Base URL: `https://webapi.resales-online.com/V6`

| Endpoint | Purpose |
|---|---|
| `GET /SearchProperties` | List page of properties (lightweight summary). Use for the bulk import loop. |
| `GET /PropertyDetails` | Full record for one reference. Required for fields not in the list view (CommunityFees, IBI, Basura, BuiltYear). |

## Authentication

Three params must be sent on every request. **The mapping is non-obvious** — getting it wrong returns `"FilterAgencyId not valid"` even when credentials are correct.

| Param | Value |
|---|---|
| `p1` | Client ID (numeric, given by Resales) |
| `p2` | API Key (40-char hex) |
| `p_agency_filterid` | **Filter Alias** (`1`, `2`, `3`, `4`) — NOT the numeric Filter Id like `54031`. The alias is the small column in the Resales agency portal under "Filters". |

Filter aliases in the agency portal correspond to listing types:
- `1` = Sale
- `2` = Short Term Rent (STR)
- `3` = Long Term Rent (LTR)
- `4` = Featured

You can create one feed config per alias to import each pool separately.

**API key is IP-locked.** The same key won't work from a different server IP. Whitelist the production server IP in the Resales portal before testing — local development against the live API is impossible.

## Response format

V6 returns **JSON by default** (despite the V5-era documentation showing XML). Set up the adapter to handle both:

```ts
const data = typeof response.data === 'string'
  ? this.xmlParser.parse(response.data)
  : response.data;
```

If you only call `xmlParser.parse()` blindly on a JSON response, you get a malformed structure and the importer silently drops every property.

## Pagination

`P_PageNo` (1-based) + `P_PageSize` (max 100 per page). Total count comes back in `root.QueryInfo.PropertyCount`. Stop when `page * limit >= totalCount`.

Production agency feeds typically return 3,000–10,000 properties. At 100/page that's 30–100 pages. Each page is one HTTP call.

## Property field mapping

Resales JSON structure under `root.Property[]`:

```jsonc
{
  "Reference": "R-12345",            // unique external id within the feed
  "AgencyRef": "INT-001",            // your agent's internal ref (optional)
  "PropertyType": {
    "Type": "Detached Villa",        // leaf type — NO parent in the feed
    "NameType": "Detached Villa"
  },
  "Price": "550,000",                // strings WITH commas as thousand separators
  "Currency": "EUR",
  "Bedrooms": 3,
  "Bathrooms": 2,
  "Built": 180,                      // m² built area
  "Plot": 800,                       // m² plot
  "Terrace": 25,                     // m² terrace
  "Country": "Spain",                // metadata only — NOT stored as a level
  "Province": "Málaga",              // = province
  "Area": "Costa del Sol",           // = area (comarca / coastal region)
  "Location": "Marbella",            // = municipality (formal administrative town)
  "SubLocation": "Nueva Andalucía",  // = town (neighborhood / pueblo / urbanización)
  "LocationId": "421",
  "Latitude": "36.5",
  "Longitude": "-4.65",
  "Description": { "EN": "...", "ES": "..." },
  "PropertyFeatures": {
    "Category": [
      { "Type": "Setting", "Value": ["Close To Sea", "Close To Town"] },
      { "Type": "Climate Control", "Value": ["Air Conditioning"] },
      { "Type": "Pool", "Value": ["Private"] }
    ]
  },
  "Pictures": { "Picture": [{ "PictureURL": "...", "PictureCaption": "..." }] }
}
```

### Money fields — comma-string gotcha

Resales returns money values as **strings with commas** (`"3,912"`). JavaScript's `parseFloat("3,912")` returns `3` (stops at comma). Always strip non-digits before parsing:

```ts
const cleaned = String(value).replace(/[^0-9.-]/g, '');
const parsed = parseFloat(cleaned);
```

### Detail-only fields

`CommunityFees`, `IBI`, `Basura`, `BuiltYear` are **only available via `/PropertyDetails`**, not in the list endpoint. For bulk import, call PropertyDetails per property (5 concurrent is safe) and merge into the list row before mapping.

`Community_Fees_Year`, `IBI_Fees_Year`, `Basura_Tax_Year` are **yearly** values in Resales. The dashboard hardcodes display units:
- `communityFees` → `/month` → divide yearly by 12 before storing
- `ibiFees` → `/year` → store as-is
- `basuraTax` → `/year` → store as-is

## Location hierarchy

The system uses a canonical **6-level Spanish real-estate hierarchy**:

```
Region        → Andalucía          (autonomous community)
Province      → Málaga             (one of 50 administrative provincias)
Area          → Costa del Sol      (comarca / coastal region — spans many municipalities)
Municipality  → Marbella           (formal administrative municipio)
Town          → Nueva Andalucía    (pueblo / neighborhood within a municipality)
Urbanization  → Aloha              (gated development — rare, manual-only)
```

### Resales → internal level mapping

Resales only sends **5 fields**, none labelled "Region" or "Urbanization":

| Resales field | Internal level | Example |
|---|---|---|
| `Country` | *(not stored — metadata only)* | Spain |
| `Province` | `province` | Málaga |
| `Area` | `area` | Costa del Sol |
| `Location` | `municipality` | Marbella |
| `SubLocation` | `town` | Nueva Andalucía |
| *(not in feed)* | `region` | Andalucía — **filled by AI post-import** |
| *(not in feed)* | `urbanization` | Aloha — **manual entry only** |

⚠ **Common confusion**: Resales' field names don't match what they semantically represent.
- Resales `Area` is **NOT** a municipality. It's a comarca/coastal-region.
- Resales `Location` **is** the actual municipality (Marbella, Mijas, Estepona).
- Resales `SubLocation` is a pueblo or neighborhood within a municipality.

If you map Resales' field names to internal levels by name alone, the data ends up at the wrong layer. Use the explicit table above.

### Walking the chain

`findOrCreateLocation` builds the chain top-down, creating each missing level and pointing its `parentId` at the previous one. Skip a level when its value equals the parent's value (e.g. some properties have `SubLocation == Location`).

### Slug uniqueness — per parent, not global

The `locations` unique index is **`(tenantId, parentId, slug)`**, NOT `(tenantId, slug)`. Two locations can share a slug as long as they have different parents:

```
Spain → Málaga → Costa del Sol → Mijas       → Centro    ✓
Spain → Málaga → Costa del Sol → Marbella    → Centro    ✓ (same slug, different parent)
```

If you index on `(tenantId, slug)` only, the second "Centro" import silently reuses the first one and ends up attached to the wrong municipality.

When looking up an existing node, scope by parent: `findOne({ where: { tenantId, slug, parentId } })`.

## Property types

Resales sends a **flat leaf type per property** (e.g. "Detached Villa", "Middle Floor Apartment", "Townhouse"). There is no parent grouping in the feed.

**Import strategy**: keep leaf types as-is — do **not** auto-collapse subtypes (it destroys the granularity users want for filtering).

**Post-import AI enrichment** automatically groups obvious subtypes under parents (e.g. "Detached Villa" + "Semi-Detached Villa" → "Villas"). The user can override anything via the dashboard's parent picker. Re-runs respect manual edits — only `aiAssigned=true` rows are re-evaluated.

The widget property search expands a selected parent type to include all descendants in the `IN` clause.

## Features

Resales groups features under category headings:

| Resales `Type` | Our `category` |
|---|---|
| Setting | exterior |
| Orientation | exterior |
| Climate Control | climate |
| Views | views |
| Features | interior |
| Furniture | interior |
| Kitchen | interior |
| Garden | exterior |
| Pool | community |
| Security | security |
| Parking | parking |
| Utilities | other |
| Condition / Category | other |

Pass the heading-derived category as a hint when calling `findFeatureIds(tenantId, names, categoryMap)`. If a feature already exists in the DB with category `other`, the import upgrades it to the better category. User-set categories are never overwritten.

**AI enrichment** runs after import and recategorises any feature still tagged `other` based on the feature name itself ("Air Conditioning" → climate, "Sea View" → views, etc.). Skips rows the user manually set.

## AI enrichment

After every successful feed import, the system queues a background enrichment pass that calls **Claude Haiku 4.5 via OpenRouter** to fill gaps the feed can't:

1. **Locations** — for each province with no parent, map it to a Spanish autonomous community (Region). Creates region nodes (Andalucía, Comunidad Valenciana, etc.) and reparents provinces.
2. **Property types** — group obvious subtypes under broad parents. Conservative: only groups types that clearly share a parent.
3. **Features** — recategorise anything left in `other`.

Items touched by AI are flagged `aiAssigned=true`. Re-runs skip rows where the user has overridden the AI's choice.

### Configuration

| Source | Where |
|---|---|
| Platform default key | `OPENROUTER_API_KEY` env var on the API process. One key used for all tenants. |
| Per-tenant override (encrypted) | `tenants.openrouterApiKey` column. Set via dashboard if a tenant brings their own budget. |
| Legacy per-tenant key (plain JSON) | `tenants.settings.openRouterApiKey`. Still honored as a fallback for the existing chat AI tab. |

Resolution order: encrypted column → settings JSON → platform env var.

### Manual trigger

Each of the three dashboard pages (Locations, Property Types, Features) has an **✨ AI Organize** button that calls `POST /api/dashboard/ai-enrichment/run` with a `scope` of `locations`, `property-types`, or `features` (or `all` for everything).

### Cost

Claude Haiku 4.5 is ~$0.25/M input tokens. A typical tenant (~500 unique locations, ~30 types, ~100 features) costs **$0.001–0.005** per full enrichment run. Re-imports only re-call AI for newly-seen items.

## Property publishing flow

New feed properties should be **active + published** immediately, not draft. The two flags are independent:

- `status='active'` → property is live in the system (vs. `draft`/`sold`/`rented`/`archived`)
- `isPublished=true` → property is publicly visible on the widget
- `publishedAt=now()` → records when it first went live

For first imports: set all three. On resync, only auto-promote from `draft → active` if user hasn't touched it. Detect "never published" via `!isPublished && !publishedAt` to handle the case where a previous bad import created drafts.

## Content hash deduplication

After mapping each property to our internal shape, compute a SHA-256 of the sorted JSON (excluding images). Store as `contentHash`. On resync:

- If hash matches existing → skip (no work)
- If hash differs → update all fields including reattaching to property types / locations / features
- Images change separately — diff by `sourceUrl` to avoid re-downloading

Always include enrichment fields (financial values, featureCategories, etc.) in the hashed payload so changes to mapping logic trigger a full re-link on next sync.

## Sync progress

Persist counters (`totalFetched`, `createdCount`, `updatedCount`, `skippedCount`, `errorCount`) to the `feed_import_logs` row after every page. The dashboard polls `GET /:configId/sync-status` every 3 seconds while a sync is running to drive the progress bar.

## Deploy considerations

- **API key IP-lock**: testing only works from the whitelisted production IP. Don't waste time trying localhost.
- **No git on server**: deploy is FTP upload + shell script that runs `nest build` + `pm2 restart`. Always include cleanup of orphaned files (e.g. removed Paddle integration files broke the build until manually deleted).
- **Migrations**: TypeORM migrations live in `apps/api/src/database/migrations`. Run via `npx typeorm migration:run -d apps/api/dist/config/database.config.js` after each rebuild.
- **OpenRouter key**: add `OPENROUTER_API_KEY=...` to `apps/api/.env`. Restart with `pm2 restart spm-api --update-env` so PM2 reloads the env file. Without the `--update-env` flag the cached environment is reused.

## Common errors and causes

| Symptom | Cause | Fix |
|---|---|---|
| `FilterAgencyId not valid` | Sending Filter Id (e.g. `54031`) instead of Filter Alias (`1`) | Use the small numeric column from the agency portal |
| Sync ran but 0 imported | Adapter calling XMLParser on JSON response | Detect content-type and switch parser |
| Community Fees shows €3/month | `parseFloat("3,912")` truncates at comma | Strip non-digits with `replace(/[^0-9.-]/g, '')` before parsing |
| Property types show "Detached Villa" only — no grouping | Resales doesn't send parent groups | Group manually in the dashboard, or wait for AI enrichment to suggest groupings |
| All features under "Other" | Category headings not mapped | Map Resales heading → internal category in adapter (AI recategorises any remaining 'other' post-import) |
| Locations flat (all towns) | `findOrCreateLocation` only created the leaf | Build top-down chain through all available levels |
| Costa del Sol labelled "Municipality" | Resales `Area` mapped to internal `municipality` by name match | Map by semantic meaning: Resales `Area`→`area`, `Location`→`municipality`, `SubLocation`→`town` |
| Two different "Centro" districts collapsed into one | Slug unique on `(tenantId, slug)` only | Use `(tenantId, parentId, slug)` index; lookups must scope by parent |
| All provinces ungrouped (no Region above) | Resales doesn't send Region | Run AI enrichment after import — fills Region from Province via Claude |
| AI Organize button does nothing | No OpenRouter key resolved | Set `OPENROUTER_API_KEY` env var on the API and `pm2 restart spm-api --update-env` |
| AI re-overwrites user's manual parent choice | Skipping `aiAssigned` flag check on re-run | Only re-evaluate rows where `aiAssigned=true` |
| API error after migration | Orphaned dist files from removed feature (e.g. Paddle → Stripe) | Delete corresponding files from `apps/api/dist` |

## Re-implementation checklist

If porting this to another project:

1. **Entities**:
   - `Property` (`source`, `externalId`, `contentHash`, `lockedFields`, image array)
   - `PropertyType` (with `parentId`, `aiAssigned`)
   - `Location` (with `parentId`, `aiAssigned`, `level` enum: `region | province | area | municipality | town | urbanization`)
   - `Feature` (with `category` enum and `aiAssigned`)
   - `FeedConfig`, `FeedImportLog`
   - `Tenant.openrouterApiKey` (encrypted, nullable — per-tenant AI override)
2. **Unique indexes**:
   - Locations: `(tenantId, parentId, slug)` — NOT `(tenantId, slug)`
3. **Adapter**: One file per feed provider; common base interface with `validateCredentials()` + `fetchProperties(page, limit)` returning `{ properties, totalCount, hasMore }`.
4. **Feed service**:
   - `findOrCreateLocation` builds the 6-level parent chain, looking up by `(tenantId, parentId, slug)`
   - `findPropertyTypeId` auto-creates the leaf type
   - `findFeatureIds` auto-creates with category hint and upgrades 'other' on resync
5. **Queue**: BullMQ job that calls `fetchProperties` in a paginated loop, importing each property via `importProperty`, persisting progress after each page.
6. **AI enrichment module**:
   - Calls OpenRouter (Claude Haiku 4.5) with platform-key fallback
   - Three methods: `enrichLocations` (fills Region from Province), `enrichPropertyTypes` (groups subtypes), `enrichFeatures` (recategorises 'other')
   - Runs automatically at the end of `processImport`; manual trigger via `POST /api/dashboard/ai-enrichment/run`
   - Marks touched rows `aiAssigned=true`; skips user-overridden rows on re-runs
7. **Sync-status endpoint** for the dashboard to poll.
8. **Widget search**: when filtering by parent `locationId` or `propertyTypeId`, expand to include all descendant ids before applying the IN clause.
9. **Reset/lock fields**: support per-property `lockedFields[]` so users can pin a field and prevent the feed from overwriting it.

That covers the integration end-to-end. Live behavior is in `apps/api/src/modules/feed/adapters/resales.adapter.ts`, `apps/api/src/modules/feed/feed.service.ts`, and `apps/api/src/modules/ai-enrichment/ai-enrichment.service.ts`.
