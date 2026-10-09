=== SPM Converter ===
Contributors: realtysoft
Requires at least: 6.0
Requires PHP: 7.4
Stable tag: 1.0.1
License: GPLv2 or later

Moves a website to Smart Property Manager: rewrites Inmotech shortcodes and old Smart Property Widget (SPW / RealtySoft V3) codes into SPM blocks.

== Description ==

SPM → Move to SPM (opens by itself after activation).

1. Install and set up Smart Property Manager (API key) first.
2. The page scans the site on its own and says how many places hold old codes — pages, Elementor layouts, widgets and theme options.
3. Old location, property type and feature IDs are translated to the client's SPM IDs by name (by parent name when a name is used twice; near-miss names like "Penthouses" → "Penthouse" are pre-filled for checking). Anything it can't work out is asked in plain words under "Needs your help", with the page it's used on; unanswered ones are left out. The old names come from the old SPW plugin's files on the site, or from the old widget server by the site's domain.
4. Click Convert. Then "Switch it off" for the old Inmotech / Smart Property Widget plugin, and clear the page cache.

Advanced (folded away) shows every code before and after, all ID matches, the block each Inmotech shortcode becomes, history, and a box to try a code.

Every run can be undone from History. An undo leaves alone anything edited since the conversion.

What it converts:

* Inmotech: 2020* listing shortcodes, footer_prop / ft_prop_style*, property_slider_style01–03, and the search shortcodes (horizontal_search, tab_search, …), with their filter="…" options.
* SPW: search, listing and map templates, carousels, the detail and wishlist pages, every search field, listing part and detail field with an SPM equivalent, data-rs-* filters (lock-* becomes a fixed filter), and the old loader/config scripts pasted into pages.

Things to know:

* SPM search forms take no preset filters; they move to the page's results block when the page has exactly one.
* A per-page count on a main results page is left out (in SPM it would turn off paging); SPM uses the dashboard's results-per-page.
* Old designs with an SPM port keep their look (SPW listing 01, 07–11 → SPM 12–17; carousels 1–6; search 01–06). Others use the design picked in the SPM dashboard.

== Changelog ==

= 1.0.1 =
* One-screen flow: scans on its own with a loader and step bar, asks only what it can't work out, then Convert and the last steps (switch off the old plugin, clear the cache). Technical details moved under Advanced.
* Page styles and script no longer stick to an old cached copy after an update.

= 1.0.0 =
* First release.
