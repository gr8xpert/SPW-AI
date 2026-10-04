=== Smart Property Manager ===
Contributors: realtysoft
Tags: real estate, property, listings, idx, mls
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 2.9.1
License: GPLv2 or later

One-click integration for the Smart Property Manager. Listings, search, property detail pages, social sharing, and SEO.

== Description ==

Connects your WordPress site to the Smart Property Manager (SPM) platform. Install, paste your API key, done.

* Shortcodes for page builders: `[spm_listing location="Marbella" under="500000"]` and one per page type; SPM → Blocks lists every block.
* Setup wizard: paste the API key, confirm the suggested page names and addresses (pre-translated for common languages), done. Creates Properties, Property Detail, Wishlist and an optional Map Search page — as linked translations on Polylang / WPML sites. Activation never touches existing content.
* Pages follow the design and brand colour chosen in the SPM dashboard (Website Design) — no page editing to change the look.
* Site Health screen (SPM → Site Health, also in Tools → Site Health): plain-language checks with one-click fixes.
* SEO-friendly property URLs with per-language slugs: /property/villa-marbella_R5P-371150, /es/propiedad/..., /de/immobilie/...
* Server-side Open Graph + Twitter Card meta tags so links shared on WhatsApp/Facebook/Twitter show the actual property
* Schema.org RealEstateListing JSON-LD for Google rich results
* Per-language data cache: locations / types / features / labels for every site language in one file per language, so pages load them in a single cached request instead of four API calls. Refreshed within minutes of a change (hourly check + background check on page views) and via the Sync Now button
* Compatibility shims for WP Rocket, Autoptimize, LiteSpeed Cache, FlyingPress, SG Optimizer, W3 Total Cache
* Translation plugin support: Polylang, WPML, TranslatePress, Weglot, GTranslate — per-page locale, language-prefixed URLs, hreflang alternates
* XML sitemap: auto-injects property URLs into Yoast, Rank Math, and native WP sitemaps + standalone /spw-sitemap.xml
* Search box on any page (e.g. the homepage) sends visitors to the Properties page with their search applied
* Design, brand colour, display currency, listing types, search options and feature toggles are configured per client in the SPM dashboard, not here

== Installation ==

1. Plugins → Add New → Upload Plugin → choose `spw-<version>.zip` (build it with `pnpm build:wp-plugin` from the repo root) → Activate.
2. The setup wizard opens by itself: paste the API key, check the page names and addresses, click **Create my pages**.
3. Add the Properties page to the site menu.
4. Anything wrong later? SPM → Site Health shows it with a one-click fix.

== Changelog ==

= 2.9.1 =
* The Filter IDs and Settings pages now show the plain filter attributes, e.g. `data-spm-location="5"`. These set the search a page starts with: visitors can still change them, and the list keeps its paging, view tabs and sort. Add `data-spm-fixed="yes"` to lock every filter on a block. The old examples used `data-spm-lock-…`, which also locked the search.
* For a short list, for example on the homepage, add `data-spm-standalone` (with `data-spm-limit` / `data-spm-featured` as needed). It shows just those cards, with no paging, view tabs or sort.
* This needs the widget released on 2026-10-05; the plugin loads it automatically.

= 2.9.0 =
* Faster: each listings page now opens with its own listings straight away. Before, only an unfiltered list was saved, so a page set to "for sale, cheapest first" (or any other filter) waited for the API on every first visit. The first time a page is visited after updating, the widget tells the plugin which search the page opens with; the plugin saves its results (and the search dropdown counts) in uploads/spm-data/, and every later visitor sees them at once. They are refreshed with the rest of the site's data whenever something changes in the dashboard, and the live results still replace them a moment later.
* Only the page's search is sent — nothing about the visitor.

= 2.8.0 =
* Fixed: the plugin could not be activated next to another plugin whose code also used the SPW name (a "fatal error" on activation). Everything in the plugin is now named SPM — folder `spm`, file `spm.php` — to match the menu and the blocks.
* Upgrading from the old `spw` folder: install this one, activate it, and it carries your settings over and switches the old copy off. You can then delete the old one. Old `[spw …]` shortcodes and `SPW_API_URL` / `SPW_LOADER_URL` in wp-config.php keep working.
* Faster: the site's data file now also holds your dashboard settings and the first page of listings, so the search and the listings appear as soon as the page opens. They are refreshed from the API straight after, and the file is rebuilt whenever something changes in the dashboard (checked every 10 minutes and hourly), or with Sync Now.
* Faster: the page asks the browser to fetch the widget and the data file, and to connect to the API, while the rest of the page is still loading.
* Existing data files are rebuilt once after updating, to add the new parts.

= 2.7.3 =
* Changed: SPM → Blocks now shows the block form — `<div data-spm-widget="site-listing"></div>` — instead of shortcodes. It is the same line on WordPress, Wix, Squarespace, Webflow or plain HTML, so there is one set of instructions to follow. Pages you built with `[spm_listing …]` keep working exactly as before.
* New: `site-wishlist` puts the whole saved-properties page in place from one block, the way `site-listing` and `site-detail` already did.
* Changed: the plugin no longer keeps its own copy of the filter words. It passes what you write to the widget, which is the only place a filter is defined — so a new filter works everywhere at once, with no plugin update.

= 2.7.2 =
* New filters in the shortcodes: `featured="yes"` (only listings marked Featured), `own="yes"` (only your own listings, not feed-shared ones) and `own-first="yes"` (everything, yours at the top). SPM → Blocks lists them.

= 2.7.1 =
* Fixed: on a property page, themes that build the header and footer from a template (Divi's Theme Builder) lost their styling — the menu disappeared and the logo filled the page. The property URL is now resolved while WordPress works out the request, so the theme sees an ordinary page.
* Fixed: `[spm_wishlist]` showed "No saved properties yet" underneath a list that did have properties in it.
* Changed: a shorter menu — Settings, Pages, Blocks, Site Health. Setup is run from the button on Settings, and the filter ID reference sits at the foot of the Blocks page, where it is used.

= 2.7.0 =
* New: shortcodes, for Divi / Elementor and any page builder. One per page: `[spm_search]`, `[spm_listing]`, `[spm_detail]`, `[spm_map]`, `[spm_wishlist]`. They follow the design chosen in the SPM dashboard, or `template="3"` pins one.
* New: filters inside the shortcode, in plain words: `[spm_listing location="Marbella" under="500000" beds="3" baths="2" sort="newest" limit="6"]`. Locations, property types and features are matched by name against your own lists. `fixed="yes"` stops visitors changing them.
* New: `own-search="yes"` lets a block search on its own, so one page can hold several different lists (e.g. "Latest in Marbella" and "New developments").
* New: every single part has its own shortcode too — `[spm block="detail_gallery"]`, `[spm block="property_grid"]` and so on. SPM → Blocks lists them all with one-click copy.
* Fixed: an unknown sort value (e.g. sort="price") emptied the whole page; unknown values are now ignored.
* Fixed: a `limit` set on the page was overridden by the dashboard's results-per-page.

= 2.6.0 =
* New: property pages use the property's SEO section from the SPM dashboard (filled by hand or by AI): Meta Title as the page title, Meta Description, Meta Keywords, Page Title as the heading, and the custom JSON-LD schema when set. Open Graph / Twitter previews use them too.
* New: one canonical address per property: the URL format chosen in the dashboard (Settings → Property URL format) and the property's own Slug are used for links, the sitemap, the canonical tag and hreflang alike. On property pages the canonical, title, description and schema of WordPress, Yoast SEO, Rank Math and All in One SEO are replaced by the property's own, so there is exactly one of each.
* Fixed: the page title override was registered after WordPress had already printed the title.
* Fixed: hreflang links now point at each language's own property address.
* New: the widget script is loaded with the deployed widget's version (?ver=), so a widget update reaches the site within minutes without clearing any cache.
* New: the plugin tells the SPM dashboard which site it runs on (Website Health page).
* New: a property's cached page data follows your dashboard: editing a title or SEO field shows on the website within minutes instead of up to 12 hours.

= 2.5.0 =
* New: setup wizard (SPM → Setup), opened automatically after activation. Three steps: connect (API key checked on the spot), pages & languages, done (pages created, search lists downloaded, health shown).
* New: multilingual setup. Every language of the site gets suggested page names and web addresses (English, Spanish, German, French, Dutch, Italian, Portuguese, Swedish, Norwegian, Danish, Finnish, Polish, Russian). With Polylang or WPML each language gets its own page, linked as translations; property URLs open the page of the URL's language.
* New: pages use `site-search`, `site-listing`, `site-detail` and `site-map` blocks, which show the templates chosen in the SPM dashboard → Website Design. Untouched pages from older versions can be switched in one click; pages you edited are never changed.
* New: SPM → Site Health — connection, widget script, permalinks, pages, translations, property addresses, search lists, background updates, caching plugins, brand colour — each with a one-click fix where possible. Also listed under Tools → Site Health.
* New: pages paint in the dashboard's brand colour straight away (no blue flash while loading); the property-page loading spinner uses it too.
* Fixed: page IDs saved by the page generator during an admin request could be reverted by the settings sanitizer.
* Fixed: a page in the bin no longer counts as existing; it is created again.
* Fixed: on property URLs, Polylang / WPML no longer add hreflang links to the plain detail page next to the plugin's own.

= 2.4.0 =
* New: lookup data (locations, property types, features, labels) is cached for EVERY site language, one bundle file per language, and the widget loads it in a single request. Previously only the default language was cached and the widget never used the cache, so every page made four API calls.
* New: cache freshness follows the API's syncVersion — checked hourly and, in the background, on page views when the last check is over 10 minutes old. A feed import or dashboard edit reaches the site within minutes instead of the next day.
* New: a search box on a page without results (e.g. the homepage) takes the visitor to the Properties page with the search applied. The widget also gets the Wishlist page URL, so the wishlist counter links to it.
* New: display currency is set in the SPM dashboard (Settings → Widget) and prices in other currencies are converted.
* New: `uninstall.php` removes the plugin's options, transients, scheduled sync and cached files when the plugin is deleted.
* Fixed: the property sitemap (/spw-sitemap.xml and the Yoast / Rank Math / core providers) was always empty — the API endpoint it relied on did not exist.
* Fixed: changing the detail slug no longer needs a manual Settings → Permalinks re-save.
* Fixed: detail URLs whose title is a single word (`/property/villa_R5P-1`) now resolve; the reference is read the same way in PHP (OG tags) and in the widget.
* Fixed: the wishlist page shows every saved property, not only those in the first page of search results.
* Fixed: a `SPW_API_URL` wp-config override now also applies to Test Connection, sync, OG tags and the sitemap.
* Fixed: caching/optimisation plugin exclusions now match the real bundle name (spm-widget.umd.js).

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
