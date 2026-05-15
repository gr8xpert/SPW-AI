=== Smart Property Widget ===
Contributors: realtysoft
Tags: real estate, property, listings, idx, mls, shortcode
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 2.1.0
License: GPLv2 or later

One-click integration for the Smart Property Widget. Listings, search, property detail pages, social sharing, and SEO.

== Description ==

Connects your WordPress site to the Smart Property Widget (SPW) platform. Install, paste your API key, done.

* Auto-creates Listings, Property Detail, and Wishlist pages
* SEO-friendly property URLs: /property/villa-marbella_R5P-371150
* Server-side Open Graph + Twitter Card meta tags so links shared on WhatsApp/Facebook/Twitter show the actual property
* Schema.org RealEstateListing JSON-LD for Google rich results
* Local JSON cache for locations / types / features / labels (daily auto-refresh + manual sync button)
* Shortcodes: [spw_search], [spw_listings], [spw_map], [spw_detail], [spw_wishlist], [spw component="..."]
* Compatibility shims for WP Rocket, Autoptimize, LiteSpeed Cache, FlyingPress, SG Optimizer, W3 Total Cache
* Translation plugin support: Polylang, WPML, TranslatePress, Weglot, GTranslate — per-page locale, language-prefixed URLs, hreflang alternates
* XML sitemap: auto-injects property URLs into Yoast, Rank Math, and native WP sitemaps + standalone /spw-sitemap.xml
* Analytics: GA4 + GTM with widget event forwarding (spw:property_view, spw:search, spw:lead_submit, spw:favorite_toggle)
* Theme, currency, language, and listing-type configuration in the admin

== Installation ==

1. Upload the plugin folder to `wp-content/plugins/spw/` or install via Plugins → Add New.
2. Activate.
3. Go to SPW → Settings, paste your API Key, click **Test Connection**, save.
4. The Property Search / Listings / Detail pages are created automatically.

== Changelog ==

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
