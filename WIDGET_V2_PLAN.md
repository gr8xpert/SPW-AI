# SPW V2 Widget Rebuild Plan

## Context

The V2 widget (`apps/widget/`) is currently a minimal vanilla TypeScript widget (~2300 LOC) with basic search/grid/detail-modal. The V1 widget (documented in `E:\SPM\RealtysoftV3\docs\designer-guide.html`) has a rich component-based architecture with 50+ CSS class components, 13 card templates, 6 search templates, 6 carousel templates, map view, wishlist pages, currency converter, mortgage calculator, and more.

**Goal**: Rebuild the V2 widget as a Preact-powered, speed-optimized, animated component framework that:
1. Is **100% backward-compatible** with V1 HTML markup (same CSS classes, data attributes, JS API)
2. Pulls **all configuration from the dashboard** (nothing hardcoded)
3. Loads data **as fast as if cached within the client's website**
4. Has **enhanced UI** with smooth animations and modern design

---

## Architecture

### Framework: Preact (not React)
- **Preact** (3KB gzipped) with `preact/compat` for full React API compatibility
- React would add 40KB to a widget that loads on third-party sites — unacceptable
- Preact supports hooks, context, and all React patterns via compat layer
- If the user needs a React-only library later, compat handles it transparently

### Dual Mode
- **V1 mode** (auto-detected when `rs_*` or `rs-*` classes found): DOM scanner mounts individual Preact components into each `<div class="rs_*">`. No Shadow DOM — designers apply their own CSS.
- **V2 mode** (`data-spw-widget`): Single container, Shadow DOM for style isolation, default layout.
- Both modes can coexist on the same page.

### Three-Layer Architecture

**Layer 1 — DOM Scanner** (`core/dom-scanner.ts`):
On `DOMContentLoaded`, scans the document for `rs_*`, `rs-*-template-*`, `#rs_search` elements. Builds a manifest of `{ element, componentType, variation, dataAttributes, parentContext }`.

**Layer 2 — Component Mounter** (`core/component-mounter.ts`):
Iterates manifest, creates a Preact root in each detected element via `render(<Component />, element)`. Passes data attributes as props.

**Layer 3 — Shared Store** (`core/store.ts`):
Since each `rs_*` div is its own Preact root (they can't share React context), a singleton pub/sub store lives outside the Preact tree. Components subscribe via `useSyncExternalStore` hook.

```
SPWStore (singleton)
├── state: { filters, lockedFilters, results, favorites, labels, config, localData, currency, ui }
├── subscribe(slice, callback)
├── dispatch(action, payload)
└── getState()
```

### Custom Layouts (Designer Freedom)

This is a **core feature**, not an add-on. Templates are optional convenience shortcuts — the primary usage model is designers creating their own HTML layouts and dropping in `rs_*` components wherever they want:

**Custom search layout** — designer controls all HTML/CSS, widget only fills the `rs_*` divs:
```html
<div id="rs_search" class="my-hero-search">
    <h2>Find Your Dream Home</h2>
    <div class="my-filters-row">
        <div class="rs_location" data-rs-variation="1"></div>
        <div class="rs_listing_type" data-rs-variation="3"></div>
        <div class="rs_bedrooms" data-rs-variation="2"></div>
    </div>
    <div class="rs_search_button"></div>
</div>
```

**Custom results layout** — mix widget components with any HTML:
```html
<div class="my-results-bar">
    <div class="rs_results_count"></div>
    <div class="rs_active_filters"></div>
    <div class="rs_sort"></div>
    <div class="rs_view_toggle"></div>
</div>
<div class="rs_property_grid" data-rs-columns="4" data-rs-template="5"></div>
<div class="rs_pagination"></div>
```

**Custom detail page** — choose which sub-components to show and arrange freely:
```html
<div class="rs_detail">
    <div class="rs_detail_gallery"></div>
    <div class="my-two-column">
        <div class="my-main">
            <h1 class="rs_detail_title"></h1>
            <div class="rs_detail_price"></div>
            <div class="rs_detail_description"></div>
            <div class="rs_detail_features"></div>
        </div>
        <aside class="my-sidebar">
            <div class="rs_detail_agent"></div>
            <div class="rs_detail_inquiry_form"></div>
            <div class="rs_mortgage_calculator"></div>
        </aside>
    </div>
    <div class="rs_detail_related" data-limit="6"></div>
</div>
```

**Custom wishlist page** — same principle:
```html
<div class="my-wishlist">
    <div class="rs_wishlist_header"></div>
    <div class="rs_wishlist_shared_banner"></div>
    <div class="my-toolbar">
        <div class="rs_wishlist_actions"></div>
        <div class="rs_wishlist_sort"></div>
    </div>
    <div class="rs_wishlist_empty"></div>
    <div class="rs_wishlist_grid"></div>
    <div class="rs_wishlist_compare_btn"></div>
    <div class="rs_wishlist_modals"></div>
</div>
```

**Quick features bar** — inline feature checkboxes selected from dashboard:
```html
<div id="rs_search" class="my-search">
    <!-- normal filters row -->
    <div class="rs_location"></div>
    <div class="rs_property_type"></div>
    <div class="rs_bedrooms"></div>
    <div class="rs_price"></div>
    <div class="rs_search_button"></div>
    <!-- quick features row: shows dashboard-selected features as checkboxes -->
    <div class="rs_quick_features"></div>
    <!-- renders: ☐ Beachfront ☐ Golf ☐ Pool ☐ Sea Views ... [Advanced Search →] -->
</div>
```
Which features appear is configured in dashboard (not hardcoded). The "Advanced Search" link opens the full `rs_features` popup modal. Designers can also override via `data-rs-feature-ids="1,5,12,20"`.

**How it works**: The DOM Scanner finds ALL `rs_*` elements regardless of their nesting or surrounding HTML. Each gets its own Preact root. The shared store connects them all. Designers have total freedom over layout, spacing, ordering, and surrounding markup — the widget only renders inside the `rs_*` divs it finds.

**Templates vs Custom**: If a designer uses `<div class="rs-search-template-01">`, the widget renders a pre-built layout inside it. If they use individual `rs_*` components, they control the layout themselves. Both approaches work on the same page.

### Backward-Compatible APIs
- `window.RealtySoftConfig` — parsed at init, merged with dashboard config
- `window.RealtySoft.getMode()` / `.State.getState()` / `.State.get('filters')` / `.search()` / `.reset()` — thin wrappers around SPWStore

---

## Data Loading Strategy (Speed) — Four-Layer Architecture

### The Problem
WordPress has a server-side plugin that syncs JSON locally. Wix, Squarespace, plain HTML, and other platforms have ZERO server-side capability — everything must be pure client-side JavaScript. The widget must load instantly on ALL platforms.

### The Bundle.json Concept
Instead of 5+ separate fetches, ALL static data is bundled into ONE CDN-hosted file:
```json
{
  "syncVersion": 42,
  "config": { "theme": "light", "primaryColor": "#2563eb", ... },
  "locations": [ ... ],
  "types": [ ... ],
  "features": [ ... ],
  "labels": { ... },
  "defaultResults": { "data": [ /* first page of properties */ ], "meta": { "total": 1250 } }
}
```

### Four Cache Layers

**Layer 0 — WP Inline Preload** (WordPress only): `window.__SPW_DATA__` injected in `<head>` by WP plugin — zero network, ~50ms to content.

**Layer 1 — IndexedDB Cache** (all platforms): On first load, bundle saved to IndexedDB keyed by `spw:{apiKey}`. Subsequent visits read IndexedDB (~2-5ms) → render immediately → background freshness check.

**Layer 2 — CDN Edge Cache** (all platforms, first visit): `https://data.smartpropertywidget.com/{tenant-slug}/v{syncVersion}/bundle.json` — single file, versioned URLs for instant cache busting, CDN edge latency 20-80ms.

**Layer 3 — API Origin** (fallback for dynamic queries): Direct API calls for filtered searches, property detail, inquiry submissions. Latency: 200-500ms.

### Load Sequence
```
DOMContentLoaded (t=0ms)
├── DOM Scanner: find all rs_* elements (sync, <2ms)
├── Render skeletons into every element (sync, <5ms)            ← USER SEES LAYOUT
├── Check window.__SPW_DATA__ (WP)?
│   └── YES → hydrate immediately, skip network                 ← DONE AT ~50ms
├── Check IndexedDB for cached bundle?
│   ├── FOUND → hydrate immediately                             ← DONE AT ~50ms
│   │   └── Background: compare syncVersion → silently update if stale
│   └── NOT FOUND → fetch bundle.json from CDN
│       └── Received → hydrate + save to IndexedDB              ← DONE AT ~150ms
└── Widget is fully interactive with properties visible
```

### Performance by Visit
| Scenario | Time to Content |
|----------|----------------|
| WordPress (inline data) | ~50ms |
| Repeat visit, any platform (IndexedDB) | ~50ms |
| First visit, any platform (CDN bundle) | ~100-200ms |
| Filtered search (API call) | ~200-400ms |

### Search Result Caching
- **Default results**: included in bundle.json → always instant
- **Filtered results**: cached in-memory by filter hash during session
- **Back navigation** (detail → results): instant from memory cache
- Invalidated on sync version bump or 5-min TTL

---

## Animation Strategy

**CSS transitions and @keyframes only** — no animation library. Every animation runs on GPU-composited properties (`transform`, `opacity`) for 60fps.

| Component | Animation | Duration |
|-----------|-----------|----------|
| Property cards | Staggered fade-up (`--i * 60ms` delay) | 400ms |
| Card hover | Lift + shadow | 200ms |
| Skeleton pulse | Shimmer gradient | 1.5s loop |
| Modal open/close | Backdrop fade + content scale(0.95→1) | 200ms |
| Gallery lightbox | Fade + zoom | 250ms |
| Carousel slide | translateX | 300ms |
| Filter tags | Scale in/out | 150ms |
| Favorites heart | Bounce scale(1→1.3→1) | 300ms |
| Chat panel | Slide up | 250ms |
| Map markers | Drop-in from above | 300ms |
| Page transition | Cross-fade (View Transitions API, progressive) | 200ms |

---

## Map Search

### Two Search Modes

**1. Viewport Search (pan/zoom)**
User pans and zooms the map → widget automatically searches for properties within the visible bounds. No extra UI needed — the map IS the search.
```
User pans map → debounce 300ms → GET /api/v1/properties?bounds=36.5,-5.2,36.8,-4.8
→ markers update on map + results panel updates (template 03)
```

**2. Radius Search (address + distance)**
User enters an address in the filter bar → geocodes to lat/lng → draws circle on map → searches within radius.
```
User types "Marbella" → autocomplete → select → choose "5km" → 
GET /api/v1/properties?lat=36.51&lng=-4.88&radius=5
→ map centers on address, circle overlay shown, markers within radius displayed
```
Radius UI lives in the filter bar alongside other filters: `[ Search by address... ] [ 5km ▾ ]`
Distance options: 1km, 2km, 5km, 10km, 25km, 50km (configurable from dashboard).

### Three Map Templates

**Template 01 — Location Tags** (inspired by Screenshot 1)
```
+-------------------------------------------------------+
| [Marbella 234] [Estepona 89] [Benahavís 45] [+12 more]|
+-------------------------------------------------------+
|                                                       |
|              FULL-WIDTH MAP                           |
|         (12) cluster    [€250K] [€180K]               |
|                                                       |
+-------------------------------------------------------+
| [10 zones ○ | ● 177 properties]     [View All →]      |
+-------------------------------------------------------+
```
- Location tags auto-populated from search results
- Clicking a tag zooms map to that location + filters
- Bottom toggle: "zones" (cluster circles by location) vs "properties" (individual price markers)

**Template 02 — Full-Width + Filters** (inspired by Screenshot 2)
```
+-------------------------------------------------------+
| [Address...] [Price ▾] [Type ▾] [Beds ▾] [All Filters]|
| [● List] [○ Map]                                      |
+-------------------------------------------------------+
|                                                       |
|              FULL-WIDTH MAP                           |
|     [€250K] [€180K] [€320K] [€415K]                  |
|                                                       |
+-------------------------------------------------------+
```
- Filter bar is part of the template (uses existing search components)
- List/Map toggle switches between `rs_property_grid` and map
- Price markers shown at all zoom levels, clusters when dense

**Template 03 — Split Panel** (inspired by Screenshot 3)
```
+-------------------------------------------------------+
| [Address...] [Price ▾] [Type ▾] [Beds ▾] [More ▾]    |
+-------------------------------+-----------------------+
|                               | Card 1 [€250K]       |
|         MAP (60%)             | Card 2 [€180K]       |
|    [€250K]    [€320K]         | Card 3 [€320K]       |
|         [€180K]               | Card 4 [€415K]       |
|                               | Card 5 [€190K]       |
+-------------------------------+-----------------------+
```
- Map and results panel are side-by-side
- Hovering a card highlights the corresponding marker on the map
- Hovering a marker highlights the corresponding card in the panel
- Results panel scrolls independently, uses compact card layout
- On mobile: collapses to stacked (map on top, cards below) or toggle

### Map Markers

**Price markers** (zoomed in): Each property shows a pill-shaped marker with formatted price (e.g., `€250K`, `$1.2M`). Active/hovered marker gets a different color. Currency follows the widget's currency setting.

**Cluster markers** (zoomed out): When markers overlap, they merge into a circle showing the count (e.g., `12`, `45`). Clicking a cluster zooms in. Cluster color intensifies with higher counts.

**Marker popup**: Clicking a price marker shows a mini property card popup (image, title, price, beds/baths, area). Click popup → opens detail page.

### Map Search API Parameters

Existing `GET /api/v1/properties` endpoint needs two new parameter sets:

```
# Viewport search (bounds)
GET /api/v1/properties?bounds=swLat,swLng,neLat,neLng

# Radius search (center + distance)
GET /api/v1/properties?lat=36.51&lng=-4.88&radius=5
```

Both combine with all existing filters (type, price, beds, etc.).

### Geocoding
Address-to-coordinates for radius search uses **Nominatim** (free, no API key) or **Google Maps Geocoding API** (if tenant has configured a Google Maps key in dashboard). Configurable per tenant.

### Map Lazy Loading
Leaflet (~40KB gzipped) is lazy-loaded only when a map component is detected on the page. Non-map pages have zero map overhead.

### HTML Usage

```html
<!-- Template approach -->
<div class="rs-map-template-03"></div>

<!-- Custom layout approach -->
<div class="my-map-page">
  <div class="rs_map_radius_search"></div>
  <div class="my-split">
    <div class="rs_map_container" data-rs-zoom="12" data-rs-center="36.51,-4.88"></div>
    <div class="rs_map_results_panel" data-rs-template="3"></div>
  </div>
</div>
```

### Data Attributes for Map
| Attribute | Description | Default |
|-----------|-------------|---------|
| `data-rs-zoom` | Initial zoom level | 10 |
| `data-rs-center` | Initial center `lat,lng` | Auto (fit all markers) |
| `data-rs-radius-options` | Custom distances `1,2,5,10,25` | `1,2,5,10,25,50` |
| `data-rs-cluster-threshold` | Zoom level to switch from clusters to pins | 14 |
| `data-rs-map-style` | Map tile style | OpenStreetMap default |

---

## Component Registry

### Search Components (13)
| CSS Class | Component | Variations |
|-----------|-----------|------------|
| `rs_location` | RsLocation | 1=Typeahead, 2=Cascading, 3=Hierarchical, 4=Dropdown |
| `rs_listing_type` | RsListingType | 1=Buttons, 2=Dropdown, 3=Tabs |
| `rs_property_type` | RsPropertyType | 1=Typeahead, 2=Dropdown, 3=Multi-select, 4=Icons |
| `rs_bedrooms` | RsBedrooms | 1=Dropdown, 2=Buttons, 3=Free input |
| `rs_bathrooms` | RsBathrooms | 1=Dropdown, 2=Buttons, 3=Free input |
| `rs_price` | RsPrice | 1=Inputs, 2=Range slider, 3=Dropdown |
| `rs_built_area` | RsBuiltArea | 1=Inputs, 2=Range slider |
| `rs_plot_size` | RsPlotSize | 1=Inputs, 2=Range slider |
| `rs_features` | RsFeatures | 1=Popup modal, 2=Inline checkboxes, 3=Tags |
| `rs_quick_features` | RsQuickFeatures | Inline checkboxes for dashboard-selected popular features + "Advanced Search" link that opens full `rs_features` popup |
| `rs_reference` | RsReference | 1 |
| `rs_search_button` | RsSearchButton | 1 |
| `rs_reset_button` | RsResetButton | 1 |

### Templates
- 6 search templates: `rs-search-template-01` through `06`
- 13 listing/card templates: `rs-listing-template-01` through `13`
- 6 carousel templates: `data-rs-template="1-6"` on `rs_property_carousel`
- 3 map search templates: `rs-map-template-01` through `03`

### Listing Components (8)
`rs_property_grid`, `rs_property_carousel`, `rs_pagination`, `rs_sort`, `rs_results_count`, `rs_active_filters`, `rs_view_toggle`, `rs_map_view`

### Map Search Templates (3)
| CSS Class | Layout | Description |
|-----------|--------|-------------|
| `rs-map-template-01` | Full-width + location tags | Location chips with property counts on top, full-width map below, zone/property cluster toggle |
| `rs-map-template-02` | Full-width + filter bar | Filter dropdowns on top, full-width map with price markers, list/map view toggle |
| `rs-map-template-03` | Split panel | Map on left (~60%), property card list on right (~40%), shared filter bar on top |

### Map Search Sub-Components
| CSS Class | Component | Description |
|-----------|-----------|-------------|
| `rs_map_container` | RsMapContainer | Leaflet map canvas with price markers + cluster counts |
| `rs_map_location_tags` | RsMapLocationTags | Clickable location chips with property counts (template 01) |
| `rs_map_radius_search` | RsMapRadiusSearch | Address input + distance dropdown in filter bar |
| `rs_map_results_panel` | RsMapResultsPanel | Scrollable property card list synced with map viewport (template 03) |
| `rs_map_view_toggle` | RsMapViewToggle | Switch between list view and map view |

### Detail Components (30+)
Container `rs_detail` with sub-components: `rs_detail_gallery`, `rs_detail_title`, `rs_detail_price`, `rs_detail_ref`, `rs_detail_location`, `rs_detail_address`, `rs_detail_type`, `rs_detail_status`, `rs_detail_beds`, `rs_detail_baths`, `rs_detail_built`, `rs_detail_plot`, `rs_detail_terrace`, `rs_detail_garden`, `rs_detail_year`, `rs_detail_floor`, `rs_detail_orientation`, `rs_detail_parking`, `rs_detail_energy_rating`, `rs_detail_community_fees`, `rs_detail_description`, `rs_detail_features`, `rs_detail_specs`, `rs_detail_map` (4 variations), `rs_detail_related`, `rs_detail_resources`, `rs_detail_video_embed`, `rs_detail_video_link`, `rs_detail_tour_link`, `rs_detail_pdf`, `rs_detail_wishlist`, `rs_detail_share`, `rs_detail_back`, `rs_detail_agent` (with sub-components), `rs_detail_inquiry_form`, `rs_mortgage_calculator`

### Wishlist Components (9)
`rs_wishlist_list`, `rs_wishlist_header`, `rs_wishlist_actions`, `rs_wishlist_sort`, `rs_wishlist_grid`, `rs_wishlist_empty`, `rs_wishlist_compare_btn`, `rs_wishlist_shared_banner`, `rs_wishlist_modals`, `rs_wishlist_counter`

### Utility Components (4)
`rs_language_selector`, `rs_currency_selector`, `rs_share_buttons`, `rs-price-stats` (price placeholders)

### Filter System
- Pre-filled (changeable): `data-rs-location="505"`, `data-rs-property-type="76"`, etc.
- Locked (immutable): `data-rs-lock-location="505"`, `data-rs-lock-listing-type="resale"`, etc.
- Standalone grids: `data-rs-standalone` with own filters independent of page search

---

## File Structure

```
apps/widget/src/
├── index.ts                          # Entry point, dual mode detection
├── types/                            # TypeScript interfaces
│   ├── property.ts, search.ts, config.ts, labels.ts, events.ts, state.ts
├── core/
│   ├── store.ts                      # SPWStore (pub/sub state)
│   ├── actions.ts                    # Action creators
│   ├── selectors.ts                  # State selectors
│   ├── dom-scanner.ts                # Scans for rs_* elements
│   ├── component-mounter.ts          # Mounts Preact roots
│   ├── data-loader.ts                # Four-layer data loading (WP inline → IndexedDB → CDN → API)
│   ├── attribute-parser.ts           # data-rs-* parsing
│   ├── config-parser.ts              # RealtySoftConfig merging
│   ├── api-client.ts                 # Fetch wrapper with API key
│   ├── chat-client.ts                # AI chat SSE
│   └── legacy-api.ts                 # window.RealtySoft shim
├── registry/
│   ├── component-registry.ts         # rs_* → Preact component map (lazy-loaded)
│   └── template-registry.ts          # rs-*-template-* map
├── hooks/
│   ├── useStore.ts, useFilters.ts, useFavorites.ts, useLabels.ts
│   ├── useConfig.ts, useCurrency.ts, useProperty.ts, useSearch.ts
│   ├── useIntersection.ts, useAnimation.ts
├── components/
│   ├── common/        # Skeleton, StoreProvider, ErrorBoundary, LazyImage, Modal, PriceDisplay, Badge
│   ├── search/        # 12 search components + variation sub-components
│   ├── listing/       # Grid, carousel, pagination, sort, count, active-filters, view-toggle
│   │   └── cards/     # 13 card templates (CardTemplate01.tsx through 13)
│   ├── map/           # MapContainer, LocationTags, RadiusSearch, ResultsPanel, ViewToggle, markers
│   ├── detail/        # 30+ detail sub-components
│   ├── wishlist/      # 9 wishlist components
│   ├── utility/       # Language, currency, wishlist counter, mortgage calc, price stats
│   └── chat/          # Chat bubble, panel, message, property card
├── templates/
│   ├── search/        # SearchTemplate01-06.tsx (composite components)
│   ├── listing/       # ListingTemplate01-13.tsx (grid + card template wrappers)
│   └── map/           # MapTemplate01-03.tsx (map search layout templates)
├── animations/
│   └── presets.ts     # CSS keyframe/transition definitions
├── styles/
│   ├── base.css, components.css, templates.css, animations.css, v2-widget.css
└── utils/
    ├── helpers.ts, currency.ts, url.ts, pdf.ts, constants.ts
```

---

## API Additions Required

### New Public Endpoints (backend `apps/api/`)

1. **`GET /api/v1/locations`** — Public location list for non-WP sites
   - File: `modules/location/public-location.controller.ts`
   - Auth: `X-API-Key` header
   - Returns: Location tree for the tenant

2. **`GET /api/v1/property-types`** — Public property types
   - File: `modules/property-type/public-property-type.controller.ts`

3. **`GET /api/v1/features`** — Public features list
   - File: `modules/feature/public-feature.controller.ts`

4. **`GET /api/v1/properties/:reference/similar`** — Similar properties
   - File: Extend `modules/property/public-property.controller.ts`
   - Query: `limit=6`, `priceRange=0.3`
   - Implements progressive relaxation (location+type+price → location+price → type+price → broadest)

5. **`GET /api/v1/bundle`** — Complete data bundle (config + locations + types + features + labels + default results)
   - Auth: `X-API-Key`
   - Cache: `public, max-age=86400, immutable` (versioned URL)
   - CDN-hosted at `https://data.smartpropertywidget.com/{tenant-slug}/v{syncVersion}/bundle.json`

### Existing Endpoints to Extend
- `GET /api/v1/properties` — Add geo search params: `bounds=swLat,swLng,neLat,neLng` and `lat,lng,radius` for map search
- `GET/POST/DELETE /api/v1/favorites` — Confirm anonymous session-based support
- `GET /api/v1/license/config` — Add fields: `enableMortgageCalculator`, `similarProperties`, `propertyPageSlug`, `propertyPageUrl` (for share links), `searchTemplateId`, `listingTemplateId`, `mapSearchEnabled`, `defaultMapTemplate`, `radiusOptions`, `geocodingProvider`, `quickFeatureIds` (array of feature IDs to show as inline checkboxes)

### WP Plugin Enhancement
- Inject `window.__SPW_DATA__` inline in `<head>` with full bundle data (zero-network loading)
- Keep existing local JSON sync as fallback

### No Backend Needed
- **Currency rates**: Client-side via Frankfurter API (free, no key)
- **PDF generation**: Client-side HTML template + `window.print()`
- **Geocoding**: Nominatim (free) or Google Maps Geocoding (tenant-configured key)

---

## Implementation Phases

### Phase 1: Foundation (Core architecture + Speed layer)
- Vite config with Preact aliases
- SPWStore (pub/sub state management)
- DOMScanner + ComponentMounter
- Component registry with lazy loading
- **DataLoader v2 (four-layer cache)**: `window.__SPW_DATA__` → IndexedDB → CDN bundle.json → API fallback
- **IndexedDB cache manager**: read/write/invalidate cached bundles keyed by `spw:{apiKey}`
- **Background sync checker**: compare cached syncVersion vs API, update silently if stale
- Attribute parser (data-rs-*, data-rs-lock-*)
- Config parser (RealtySoftConfig)
- window.RealtySoft API shim
- Skeleton component + CSS shimmer animations
- Theme CSS variables system
- **New API**: `GET /api/v1/bundle` endpoint + bundle generation service
- **New API**: `GET /api/v1/locations`, `/v1/property-types`, `/v1/features` (individual fallbacks)
- **WP plugin**: inject `window.__SPW_DATA__` inline in `<head>`

**Testable**: Place `<div class="rs_location" data-rs-variation="1">` on a page → skeleton renders at <10ms → location data appears from IndexedDB/CDN → second visit loads instantly from cache.

### Phase 2: Search Components
- All 13 search components with all variations
- `#rs_search` container detection
- Pre-filled + locked filter support
- 6 search templates (rs-search-template-01 through 06)
- Search submission → API call → results in store

**Testable**: Full V1-compatible search form works with all templates and filter combinations.

### Phase 3: Listing Components
- RsPropertyGrid with column control + standalone support
- RsPropertyCarousel with 6 carousel templates
- 13 card templates
- RsPagination, RsSort, RsResultsCount, RsActiveFilters, RsViewToggle
- Staggered card animations, lazy image loading
- Responsive grid breakpoints

**Testable**: Search returns results, grid renders with selected template, pagination/sorting works.

### Phase 4: Property Detail
- rs_detail container with property ID resolution (6 sources)
- All 30+ detail sub-components
- Gallery with lightbox
- Inquiry form → API submission
- Similar properties → new API endpoint
- Map with Leaflet (lazy-loaded)
- Mortgage calculator
- PDF generation (client-side)

**Testable**: Navigate to property detail page, all V1 components render, inquiry form submits.

### Phase 5: Wishlist, Utilities & Social Sharing
- 9 wishlist components
- Currency converter (Frankfurter API)
- Language selector
- Price placeholders (#MINPRICE#, #MAXPRICE#, #AVGPRICE#)
- **Share button** — generates client-domain share URLs using `propertyPageUrl` pattern from dashboard
- Favorites API integration
- **OG tag integrations**:
  - WP plugin: update `class-spw-og-tags.php` for V2 property URL patterns
  - Cloudflare Worker: create and publish (`packages/cf-worker-og/`)
  - PHP middleware: create (`packages/og-middleware/og.php`)
  - Node.js middleware: create (`packages/og-middleware/og.js`)
  - Vercel/Netlify edge functions: create (`packages/og-middleware/vercel.ts`, `netlify.ts`)
- **Dashboard**: add `propertyPageUrl` setting + platform setup wizard UI

**Testable**: Share a property on WhatsApp/Facebook → correct image, title, price appear → link opens client's website.

### Phase 6: Map Search & AI Chat
- **3 map search templates** (`rs-map-template-01`, `02`, `03`)
- Leaflet map with **price markers** (zoomed in) + **cluster counts** (zoomed out)
- **Viewport search**: pan/zoom → debounced bounds query → markers + results update
- **Radius search**: address autocomplete (Nominatim/Google) → distance dropdown → circle overlay → filter by radius
- Radius UI in filter bar: `[ Search by address... ] [ 5km ▾ ]`
- Map sub-components: `rs_map_container`, `rs_map_location_tags`, `rs_map_radius_search`, `rs_map_results_panel`, `rs_map_view_toggle`
- Marker popup: mini property card (image, title, price, beds/baths)
- Split panel (template 03): card hover ↔ marker highlight sync
- Mobile: split collapses to stacked or toggle
- API: add `bounds` and `lat,lng,radius` params to `GET /api/v1/properties`
- AI chat bubble (Preact rewrite)
- Analytics tracking (view, search, PDF)
- Debug mode

**Testable**: All 3 map templates render correctly. Pan map → markers update. Enter address + select 5km → circle shown, properties within radius displayed. Click marker → popup card → click → detail page.

### Phase 7: V2 Mode, Polish & Testing
- V2 `data-spw-widget` mode with Shadow DOM
- Bundle size audit (target: <60KB gzipped core)
- Cross-browser testing
- Accessibility audit
- Performance profiling
- WP plugin updates if needed

---

## Bundle Size Budget
| Chunk | Estimated Size (gzipped) |
|-------|-------------------------|
| Core (Preact + store + scanner + data loader) | ~15KB |
| Search components (all 12) | ~8KB |
| Listing components + cards | ~16KB |
| Detail components | ~12KB |
| Wishlist | ~5KB |
| CSS (all) | ~8KB |
| **Total core bundle** | **~64KB** |
| Map search templates + components | ~6KB |
| Leaflet (lazy, only if map used) | ~40KB |
| Carousel (lazy, only if used) | ~4KB |

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `apps/widget/package.json` | Add preact, @preact/preset-vite, leaflet deps |
| `apps/widget/vite.config.ts` | Preact plugin, React aliases, code splitting |
| `apps/widget/tsconfig.json` | JSX pragma → preact |
| `apps/widget/src/` | Complete rewrite (new structure above) |
| `apps/api/src/modules/location/` | New public-location.controller.ts |
| `apps/api/src/modules/property-type/` | New public-property-type.controller.ts |
| `apps/api/src/modules/feature/` | New public-feature.controller.ts |
| `apps/api/src/modules/property/public-property.controller.ts` | Add similar endpoint + geo search params (bounds, radius) |
| `apps/api/src/modules/bundle/` | New — bundle generation service + controller |
| `packages/cf-worker-og/` | New — Cloudflare Worker for OG tags |
| `packages/og-middleware/` | New — PHP, Node.js, Vercel, Netlify OG middleware |
| `packages/wp-plugin/includes/class-spw-og-tags.php` | Update for V2 URL patterns |
| `packages/wp-plugin/` | Add `window.__SPW_DATA__` inline injection |
| `apps/dashboard/src/app/(dashboard)/dashboard/settings/` | Add `propertyPageUrl` setting + platform setup wizard |

---

## Social Media Sharing (OG Tags)

### The Problem
Social media crawlers never execute JavaScript. They fetch raw HTML and read `<meta>` OG tags from `<head>`. Share URL must ALWAYS be the client's domain — SPW domain must never appear.

### Solution: Platform-Specific OG Tag Injection

| Platform | Solution | OG Tags? |
|----------|----------|----------|
| WordPress | WP Plugin (exists) | Yes |
| Self-hosted (PHP/Node) | Middleware file | Yes |
| Wix/Squarespace/Webflow + Cloudflare | CF Worker | Yes |
| Netlify | Edge Function | Yes |
| Vercel | Middleware | Yes |

**Cloudflare Worker flow**: Intercepts property URL requests → checks User-Agent → social crawler gets HTML with OG tags → regular browser passes through to origin → widget JS handles rendering.

**Share URL**: Always `https://clientwebsite.com/property/{reference}` — configured via `propertyPageUrl` in dashboard settings.

**OG tags generated**: `og:title`, `og:description` (price + summary), `og:image` (main photo), `og:url` (client domain), `twitter:card`.

**Optional**: OG image generation endpoint (`GET /api/v1/properties/:ref/og-image`) for branded 1200x630 preview images.

---

## Verification

1. **V1 compatibility**: Create test HTML page replicating every example from `designer-guide.html` — same HTML, load V2 widget script instead of V1 — all components must render and function identically
2. **Performance**: Lighthouse audit targeting First Contentful Paint <500ms, CLS 0, TBT <50ms
3. **Bundle size**: `vite build` → check `dist/*.iife.js` gzipped size < 65KB
4. **Cross-browser**: Test on Chrome, Firefox, Safari, Edge
5. **API**: Test all new public endpoints with API key auth (including geo search params)
6. **Animation**: 60fps verified via Chrome DevTools Performance tab
7. **Social sharing**: Share property link on WhatsApp, Facebook, LinkedIn, Twitter — verify correct OG preview appears and link opens client's website
8. **Speed**: Repeat visit on non-WP site loads from IndexedDB in <50ms — verify via Performance tab
9. **Map search**: All 3 map templates render. Viewport search updates on pan/zoom. Radius search draws circle and filters. Marker popups show property card. Split panel card↔marker hover sync works.
