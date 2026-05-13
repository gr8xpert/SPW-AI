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

### `SearchProperties` vs `PropertyDetails` — Location shape differs

The two endpoints return Location differently. After merging list + detail responses, the same field can live in two places:

- **SearchProperties** (list view): flat siblings at root
  ```json
  { "Province": "Málaga", "Area": "Costa del Sol", "Location": "Marbella", "SubLocation": "Nueva Andalucía" }
  ```
- **PropertyDetails** (detail view): nested inside `Location`
  ```json
  { "Location": { "LocationName": "Marbella", "Province": "Málaga", "Area": "Costa del Sol", "SubLocation": "Nueva Andalucía" } }
  ```

The adapter merge (`{ ...listProperty, ...detailRaw }`) replaces `raw.Location` with the object form. Read every location field from **both** places:

```ts
const locObj = (raw.Location && typeof raw.Location === 'object') ? raw.Location : null;
const locationName = locObj?.LocationName || (typeof raw.Location === 'string' ? raw.Location : '');
const subLocation  = locObj?.SubLocation || raw.SubLocation || '';
const province     = locObj?.Province    || raw.Province    || '';
const area         = locObj?.Area        || raw.Area        || '';
```

Reading only the root-level `raw.SubLocation` silently drops every town after the detail merge — properties end up under their municipality with no town level created.

### Cross-province areas are valid duplicates (Costa del Sol)

The hierarchy is a strict tree, so an Area that spans multiple provinces gets a separate node per province. **Costa del Sol** is the textbook case — it covers parts of both Málaga (Marbella, Estepona) and Cádiz (Sotogrande), so the importer correctly creates:

```
Andalucía → Málaga → Costa del Sol → Marbella, ...
Andalucía → Cádiz  → Costa del Sol → Sotogrande, ...
```

This is **not** a bug — it's the price of a tree where Area is a child of Province. To collapse them, the user re-parents one onto a province that already has a same-slug Area; the system auto-merges (see *Auto-merge on reparent* below).

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

### Auto-merge on reparent

When the user (or any code path) moves a location to a new parent that **already has a same-slug sibling**, the system folds the moved node into its twin:

1. Re-points every property from `source.id` → `target.id`
2. Reparents each source child under target — recursively merging if the children also collide
3. Deletes the source row

This lets the dashboard's bulk-move dialog also act as a "merge tool": select **Costa del Sol (Cádiz)**, move it under **Málaga**, and the system silently merges it into the existing Costa del Sol there along with any overlapping sub-municipalities. The API returns `{ count, merged }` so the toast can say *"Moved 2 · merged 1 duplicate"*.

The unique index `(tenantId, parentId, slug)` would otherwise reject the move with a constraint violation, so the merge path is the only way for users to consolidate duplicates without manual SQL.

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

### `missingX` re-attach branches

`contentHash` matching is the right default — but it makes the importer skip rows even when **the row lost a link to a related taxonomy** (e.g. its `locationId` was nulled). Each related link needs an explicit "missing" check that bypasses the hash skip:

```ts
const missingPropertyType = !existing.propertyTypeId && !!feedProperty.propertyType && feedProperty.propertyType !== 'Unknown';
const missingFeatures     = (!existing.features?.length) && feedProperty.features.length > 0;
const missingLocation     = !existing.locationId && hasIncomingLocation;

if (!dataChanged && !imagesChanged && !promote && !neverPublished
    && !missingPropertyType && !missingFeatures && !missingLocation) return 'skipped';
```

Then each branch only writes the single column it owns. Without `missingLocation`, the "Wipe & Re-import" flow nulls every `locationId` but the resync sees "hash unchanged" and skips — the locations table stays empty.

## Wipe & Re-import

Destructive operational button on the feeds page: `POST /api/dashboard/feeds/:id/wipe-and-sync`. Used after a hierarchy/mapping fix when you want a clean rebuild instead of mixing old and new rows.

What it does:

1. `UPDATE properties SET locationId = NULL WHERE tenantId = ?`
2. `SET FOREIGN_KEY_CHECKS = 0; DELETE FROM locations WHERE tenantId = ?; SET FOREIGN_KEY_CHECKS = 1;`
3. Queues a normal feed sync — the `missingLocation` branch in `importProperty` re-attaches every property to its newly-built chain.

Property types and features are **not** wiped — they import correctly by `slug` and don't suffer from the SubLocation-style mapping bug.

`FOREIGN_KEY_CHECKS = 0` is required because `locations.parentId` references `locations.id` with `ON DELETE SET NULL`. The self-referential cascade would slow the delete to a crawl on large tenants (thousands of rows × per-row update).

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
| 0 towns imported | Adapter reads `raw.SubLocation` only from root, missing the nested form in PropertyDetails | Read SubLocation from both `raw.Location?.SubLocation` and `raw.SubLocation` |
| Wipe ran but locations still 0 after resync | `contentHash` matches → `importProperty` returned `skipped` → `findOrCreateLocation` never called | Add `missingLocation` to the skip-condition + an "if missing only" re-attach branch |
| Two "Costa del Sol" nodes — one per province | Tree hierarchy forces duplication for areas spanning multiple provinces | Expected. User merges via bulk-move (auto-merge on slug collision) |
| Bulk move fails with unique-constraint violation | Target parent already has a child with the same slug as the moved node | The move path must run the merge logic instead of a raw `parentId` update |
| Next.js chunk 404 / MIME error after deploy | `.next/static/`, `.next/server/`, and `.next/BUILD_ID` uploaded out of sync | Replace all three together from the same build; hard-refresh the browser |

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
   - `importProperty` must include `missingLocation` / `missingPropertyType` / `missingFeatures` branches that bypass the `contentHash` skip when a relationship was orphaned (e.g. after a wipe)
   - `wipeLocationsAndSync` for clean rebuilds: nulls `properties.locationId`, deletes locations under `FOREIGN_KEY_CHECKS = 0`, then queues a normal sync
5. **Queue**: BullMQ job that calls `fetchProperties` in a paginated loop, importing each property via `importProperty`, persisting progress after each page.
6. **AI enrichment module**:
   - Calls OpenRouter (Claude Haiku 4.5) with platform-key fallback
   - Three methods: `enrichLocations` (fills Region from Province), `enrichPropertyTypes` (groups subtypes), `enrichFeatures` (recategorises 'other')
   - Runs automatically at the end of `processImport`; manual trigger via `POST /api/dashboard/ai-enrichment/run`
   - Marks touched rows `aiAssigned=true`; skips user-overridden rows on re-runs
7. **Sync-status endpoint** for the dashboard to poll.
8. **Widget search**: when filtering by parent `locationId` or `propertyTypeId`, expand to include all descendant ids before applying the IN clause.
9. **Reset/lock fields**: support per-property `lockedFields[]` so users can pin a field and prevent the feed from overwriting it.
10. **Location service** must implement auto-merge on reparent (`update` + `bulkMove`): when moving a node to a parent that already has a same-slug sibling, re-point properties + reparent children (recursively) + delete the source. Without this, every duplicate-area cleanup hits the `(tenantId, parentId, slug)` unique-constraint wall.

That covers the integration end-to-end. Live behavior is in:

- `apps/api/src/modules/feed/adapters/resales.adapter.ts` — field mapping + list/detail merge
- `apps/api/src/modules/feed/feed.service.ts` — `importProperty`, `findOrCreateLocation`, `wipeLocationsAndSync`
- `apps/api/src/modules/location/location.service.ts` — auto-merge on reparent (`update` + `bulkMove` + `mergeInto`)
- `apps/api/src/modules/ai-enrichment/ai-enrichment.service.ts` — Region / type-group / feature-category enrichment

## Next.js deploy gotcha

The dashboard is Next.js App Router. Hot-deployed bundles use **hash-named chunks** that all reference each other. When you change one page:

- `BUILD_ID` is regenerated
- Many chunk filenames change
- The server-rendered HTML embeds the new chunk hashes verbatim

If you upload `.next/server/` and `.next/BUILD_ID` but skip a chunk in `.next/static/` (or vice versa), the browser asks for a hash that doesn't exist and gets the Nginx 404 HTML body, which fails with `MIME type ('text/html') is not executable`.

**Safe pattern**: always replace `.next/server/`, `.next/static/`, `.next/BUILD_ID`, and `.next/*.json` together from the same build. `.next/cache/` is build-only — never upload it (it's ~440 MB of webpack cache).

Route-group folders use **parentheses** (`(dashboard)`, `(admin)`). Some FTP clients (notably Plesk's web file manager) mangle these to `%28dashboard%29`. If parens disappear from the server paths, switch to FileZilla/WinSCP or upload a zip and unzip via SSH.
