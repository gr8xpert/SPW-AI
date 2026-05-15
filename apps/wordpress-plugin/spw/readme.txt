=== Smart Property Manager ===
Contributors: realtysoft
Tags: real estate, property, listings, idx, mls, shortcode
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 2.3.2
License: GPLv2 or later

One-click integration for the Smart Property Manager. Listings, search, property detail pages, social sharing, and SEO.

== Description ==

Connects your WordPress site to the Smart Property Manager (SPM) platform. Install, paste your API key, done.

* One-click "Create Pages" button — drops Listings, Property Detail, and Wishlist pages pre-filled with raw `<div data-spm-widget="...">` markup (same syntax as a non-WP embed). Activation never touches existing content.
* SEO-friendly property URLs with per-language slugs: /property/villa-marbella_R5P-371150, /es/propiedad/..., /de/immobilie/...
* Server-side Open Graph + Twitter Card meta tags so links shared on WhatsApp/Facebook/Twitter show the actual property
* Schema.org RealEstateListing JSON-LD for Google rich results
* Local JSON cache for locations / types / features / labels (daily auto-refresh + manual sync button)
* Compatibility shims for WP Rocket, Autoptimize, LiteSpeed Cache, FlyingPress, SG Optimizer, W3 Total Cache
* Translation plugin support: Polylang, WPML, TranslatePress, Weglot, GTranslate — per-page locale, language-prefixed URLs, hreflang alternates
* XML sitemap: auto-injects property URLs into Yoast, Rank Math, and native WP sitemaps + standalone /spw-sitemap.xml
* Theme, currency, listing types, feature toggles, analytics, and custom CSS — all configured per-tenant in your SPM dashboard, not here

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/spw/` or install via Plugins → Add New.
2. Activate.
3. Go to SPM → Settings, paste your API Key, click **Test Connection**, save.
4. The Property Search / Listings / Detail pages are created automatically.

== Changelog ==

= 2.3.2 =
* Moved the **Pages** card to its own submenu (SPM &rarr; Pages). Three large cards with title editor + status + Create Missing Pages, side by side. Sidebar on Settings now has a link card.
* Settings sanitizer is now partial-update aware &mdash; each form (Settings / Pages) only updates the keys it owns, so saving page titles can never wipe the API key or slug map and vice versa.

= 2.3.1 =
* Renamed: plugin display name is now **Smart Property Manager** (was Smart Property Widget). The admin menu shows **SPM** instead of SPW. Settings storage keys, constants and the directory are unchanged so existing installs upgrade in place without losing data.
* Filter IDs page: Locations / Property Types / Features are now collapsible accordions so all three are visible from the top of the page. Locations is open by default; typing in the search auto-opens any section with matches and dims sections with none.
* Settings page: removed the lone "Settings" tab strip &mdash; with only one tab it added noise without value.

= 2.3.0 =
* New: **Filter IDs Reference** submenu page (SPW &rarr; Filter IDs). Browse every Location, Property Type and Feature synced for this tenant, with a live search and one-click Copy button next to each ID. Locations and property types render as a hierarchical tree (region &rarr; province &rarr; area &rarr; municipality &rarr; town &rarr; urbanization); features are grouped by category. Reads directly from the local JSON cache &mdash; no extra API calls.
* New: settings page now links to the reference card so admins can find the ID for a `data-spm-lock-location` / `data-spm-lock-property-type` / `data-spm-lock-features` attribute in two clicks.

= 2.2.5 =
* Redesigned the settings page: status strip at the top (API token / last sync / cached items / pages), stepped cards, three-up Pages grid with Ready/Pending badges, and a sticky save bar. Same fields and behavior &mdash; just easier to scan.
* Highlighted page cards in green when the page exists and amber when it doesn't, so an admin can tell at a glance whether Create Missing Pages still has work to do.
* Surfaced the human-readable time-since-last-sync ("3 minutes ago") alongside the absolute timestamp.

= 2.2.4 =
* Friendly sync errors also apply to legacy results saved before 2.2.3. No need to click Sync Now first &mdash; the settings view translates stored "HTTP 401: {…}" strings on render.
* Fixed a parse error in settings-page.php caused by a duplicate `<?php` tag.

= 2.2.3 =
* Sync errors now show a short, action-oriented message ("Invalid API key — check the token above and save") instead of the raw JSON the API returned. Raw response is collapsed under a "Technical details" disclosure. When every sync request fails the same way (e.g. 401 on all four endpoints), one banner is shown instead of four duplicates.
* Page titles for Listings / Detail / Wishlist are now editable from the settings page. The "Create Missing Pages" button uses whatever titles you saved.
* Languages declared by your active translation plugin (Polylang, WPML, TranslatePress, Weglot, GTranslate) are auto-added as rows in the slug table with empty slug fields ready to fill in.

= 2.2.2 =
* Slug settings consolidated into one row per language with Listings, Detail and Wishlist slug inputs side-by-side. "+ Add language" appends a new row.
* English row is anchored as the cross-language fallback and cannot be removed from the UI.

= 2.2.1 =
* Page creation moved from activation to an explicit "Create Missing Pages" button in the settings sidebar. Activation no longer creates posts.
* Settings sidebar now lists each of the three pages with a status (existing or `not created`) so the gap is obvious.

= 2.2.0 =
* BREAKING: Removed shortcodes entirely. Pages now use raw `<div data-spm-widget="...">` markup so WP and non-WP embeds share a single contract.
* BREAKING: Settings page stripped to just API token + per-language slug maps + sync controls. Currency, theme, results-per-page, feature toggles, listing types, analytics, custom CSS, and sitemap options are now configured per-tenant in the SPW dashboard.
* New: per-language slugs for listings / detail / wishlist pages (e.g. `/property/...` in English, `/es/propiedad/...` in Spanish). Rewrites, sitemap, OG tags and hreflang all read the per-lang slug map.
* New: API URL and loader URL are now constants overridable via `define('SPW_API_URL', '...')` / `define('SPW_LOADER_URL', '...')` in wp-config — no longer settings.
* Removed: SPW_Shortcodes and SPW_Analytics modules.

= 2.1.1 =
* Fixed widget loader URL — bundle now ships from spw-ai.com/widget/ (was widget.spw-ai.com)
* Local JSON cache now passes ?lang= explicitly so cron-baked names match the configured language (API resolves i18n server-side)
* Shortcodes [spw_search], [spw_listings], [spw_map], [spw_detail] now pass filter attributes through as data-spm-* (e.g. `[spw_listings template="05" lock-location="123"]` for Marbella-only listings)
* OG tags / Schema.org defensively resolve title/description if the API ever returns a raw i18n map

= 2.1.0 =
* Translation plugin compatibility (Polylang/WPML/TranslatePress/Weglot/GTranslate)
* Per-page locale forwarded to widget config and OG fetch (fixes V1 SSR-language bug)
* Language-prefixed rewrites for /{lang}/{slug}/{title}_{ref}
* hreflang alternates on property detail pages
* Property sitemap integration (Yoast, Rank Math, native WP /wp-sitemap.xml, /spw-sitemap.xml)
* GA4 + GTM injection with widget-event forwarding to dataLayer
* og:locale tag
* Fixed ref/title-slug split honoring `property_ref_position` for both start and end

= 2.0.0 =
* Rewritten for SPW V2 Preact widget (data-spm-* attributes)
* Added server-side OG / Twitter / Schema.org injection
* Added /api/v1/sync-meta polling to skip redundant cache refreshes
* Added auto page generator and shortcode wrappers
