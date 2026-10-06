<?php
if (!defined('ABSPATH')) exit;

/**
 * The list behind SPM → Blocks: every block the widget can render, in plain
 * language. Keep in step with apps/widget/src/registry/component-registry.ts.
 */
class SPM_Shortcode_Reference {

    /** Page aliases => their [spm_*] shortcode (see SPM_Shortcode::PAGES). */
    const PAGE_SHORTCODES = [
        'site-search'   => 'spm_search',
        'site-listing'  => 'spm_listing',
        'site-detail'   => 'spm_detail',
        'site-map'      => 'spm_map',
        'site-wishlist' => 'spm_wishlist',
        'site-carousel' => 'spm_carousel',
    ];

    /**
     * The WordPress shortcode for a block: [spm_listing] for a page alias,
     * [spm_listing template="3"] for a fixed design, [spm block="…"] otherwise.
     * Attributes on the div (data-spm-x="y") become x="y".
     */
    public static function shortcode($html) {
        if (!preg_match('/data-spm-widget="([^"]+)"/', $html, $m)) return '';
        $name = $m[1];
        $atts = '';
        if (preg_match_all('/data-spm-(?!widget)([a-z0-9-]+)(?:="([^"]*)")?/', $html, $all, PREG_SET_ORDER)) {
            foreach ($all as $a) $atts .= ' ' . $a[1] . '="' . (isset($a[2]) && $a[2] !== '' ? $a[2] : 'yes') . '"';
        }
        if (isset(self::PAGE_SHORTCODES[$name])) return '[' . self::PAGE_SHORTCODES[$name] . $atts . ']';
        if (preg_match('/^(search|listing|detail|map|carousel)-template-(\d+)$/', $name, $t)) {
            return '[spm_' . $t[1] . ' template="' . (int) $t[2] . '"' . $atts . ']';
        }
        return '[spm block="' . $name . '"' . $atts . ']';
    }

    public static function groups() {
        return [
            [
                'title' => 'One shortcode per page (start here)',
                'intro' => 'Each one puts a whole page design in place and follows your SPM dashboard → Website Design. Add <code>data-spm-template="3"</code> to pin a design instead.',
                'shortcodes' => [
                    '<div data-spm-widget="site-search"></div>'   => 'Search form — put it above your results, or on the homepage',
                    '<div data-spm-widget="site-listing"></div>'  => 'Property results (cards, sorting, paging)',
                    '<div data-spm-widget="site-detail"></div>'   => 'Property page — on the SPM property page only',
                    '<div data-spm-widget="site-map"></div>'      => 'Map search',
                    '<div data-spm-widget="site-wishlist"></div>' => 'Saved properties page (heading, buttons, list)',
                    '<div data-spm-widget="site-carousel"></div>' => 'Property carousel — any page; add data-spm-featured="yes" etc. to pick its properties',
                ],
            ],
            [
                'title' => 'Fixed designs, by name',
                'intro' => 'Use these when you want one specific design on one page, whatever the dashboard says.',
                'items' => [
                    'site-search'   => 'Search form — the design chosen in your dashboard',
                    'site-listing'  => 'Property results — the design chosen in your dashboard',
                    'site-detail'   => 'Property page — the design chosen in your dashboard',
                    'site-map'      => 'Map search — the design chosen in your dashboard',
                    'site-carousel' => 'Property carousel — the design chosen in your dashboard',
                    'search-template-01' => 'Search form, fixed design 1 (…-02 to -06 also exist)',
                    'listing-template-01' => 'Property results, fixed design 1 (…-02 to -17 also exist)',
                    'detail-template-01' => 'Property page, fixed design 1',
                    'map-template-01' => 'Map search, fixed design 1 (…-02, -03 also exist)',
                ],
            ],
            [
                'title' => 'Hand-picked properties',
                'intro' => 'Show exactly the properties you choose, in the order you list their reference numbers (up to 50). Works with any listing design, and never changes the page\'s search.',
                'shortcodes' => [
                    '<div data-spm-widget="site-listing" data-spm-ref="R1234,R2345,R3456,R4567,R5678,R6789"></div>' => 'Six chosen properties in the listing design chosen in your dashboard',
                    '<div data-spm-widget="listing-template-13" data-spm-ref="R1234,R2345,R3456"></div>' => 'Three chosen properties in design 13',
                    '<div data-spm-widget="site-carousel" data-spm-ref="R1234,R2345,R3456,R4567"></div>' => 'Chosen properties in a carousel',
                ],
            ],
            [
                'title' => 'Property carousels',
                'intro' => 'A slider of properties for any page. <code>[spm_carousel]</code> follows your SPM dashboard → Website Design → Carousel; <code>template="2"</code> pins a design. Each carousel picks its own properties from its filters, e.g. <code>[spm_carousel featured="yes" limit="8" autoplay="yes"]</code>, and never changes the page\'s search.',
                'items' => [
                    'carousel-template-01' => 'Centre focus — five cards, the middle one largest',
                    'carousel-template-02' => '3D perspective — cards tilt and blur away from the centre',
                    'carousel-template-03' => 'Coverflow — side cards turn to face the centre',
                    'carousel-template-04' => 'Full width — one large photo with Prev / Next panels',
                    'carousel-template-05' => 'Tilted — three slanted photos side by side',
                    'carousel-template-06' => 'Dark numbered cards — three cards with large numbers',
                ],
            ],
            [
                'title' => 'Search form — one field per block',
                'intro' => 'Build your own search bar. Add <code>&lt;div data-spm-widget="search_button"&gt;&lt;/div&gt;</code> to run the search.',
                'items' => [
                    'location'        => 'Location chooser',
                    'listing_type'    => 'For sale / for rent chooser',
                    'property_type'   => 'Property type chooser',
                    'bedrooms'        => 'Bedrooms',
                    'bathrooms'       => 'Bathrooms',
                    'price'           => 'Price range',
                    'built_area'      => 'Built area',
                    'plot_size'       => 'Plot size',
                    'terrace'         => 'Terrace size',
                    'features'        => 'Features (full list)',
                    'quick_features'  => 'Features (a few popular ones)',
                    'reference'       => 'Search by reference',
                    'search_button'   => 'Search button',
                    'reset_button'    => 'Clear search button',
                ],
            ],
            [
                'title' => 'Property results',
                'items' => [
                    'property_grid'     => 'The properties themselves (grid or list)',
                    'property_carousel' => 'Properties in a slider',
                    'pagination'        => 'Page numbers',
                    'sort'              => 'Sort chooser',
                    'results_count'     => 'How many properties were found',
                    'active_filters'    => 'The search filters in use, each removable',
                    'view_toggle'       => 'Grid / list switch',
                    'map_view'          => 'Results on a map',
                ],
            ],
            [
                'title' => 'Property page',
                'intro' => 'Only on the SPM property page. Place each block in its own Divi module to build your own layout.',
                'items' => [
                    'detail'                => 'The whole property page in one block',
                    'detail_gallery'        => 'Photo gallery',
                    'detail_title'          => 'Property title (heading)',
                    'detail_price'          => 'Price',
                    'detail_ref'            => 'Reference number',
                    'detail_location'       => 'Location',
                    'detail_address'        => 'Address',
                    'detail_type'           => 'Property type',
                    'detail_status'         => 'Status (for sale, sold…)',
                    'detail_beds'           => 'Bedrooms',
                    'detail_baths'          => 'Bathrooms',
                    'detail_built'          => 'Built area',
                    'detail_plot'           => 'Plot size',
                    'detail_terrace'        => 'Terrace size',
                    'detail_garden'         => 'Garden size',
                    'detail_year'           => 'Year built',
                    'detail_floor'          => 'Floor',
                    'detail_orientation'    => 'Orientation',
                    'detail_parking'        => 'Parking',
                    'detail_energy_rating'  => 'Energy rating',
                    'detail_community_fees' => 'Community fees',
                    'detail_specs'          => 'All the key figures together',
                    'detail_description'    => 'Description',
                    'detail_features'       => 'Features list',
                    'detail_map'            => 'Map of the property',
                    'detail_video_embed'    => 'Video player',
                    'detail_video_link'     => 'Link to the video',
                    'detail_tour_embed'     => 'Virtual tour',
                    'detail_tour_link'      => 'Link to the virtual tour',
                    'detail_pdf'            => 'Download brochure (PDF)',
                    'detail_resources'      => 'Brochure, energy certificate and other files',
                    'detail_agent'          => 'The agent for this property',
                    'detail_inquiry_form'   => 'Enquiry form',
                    'detail_share'          => 'Share buttons',
                    'detail_wishlist'       => 'Save-to-wishlist button',
                    'detail_back'           => 'Back to results link',
                    'detail_related'        => 'Similar properties',
                    'mortgage_calculator'   => 'Mortgage calculator',
                ],
            ],
            [
                'title' => 'Map search',
                'items' => [
                    'map_container'     => 'The map itself',
                    'map_location_tags' => 'Area chips above the map',
                    'map_radius_search' => 'Search by address and distance',
                    'map_results_panel' => 'Property list beside the map',
                    'map_view_toggle'   => 'Map / list switch',
                ],
            ],
            [
                'title' => 'Saved properties (wishlist)',
                'items' => [
                    'wishlist_grid'         => 'The saved properties',
                    'wishlist_header'       => 'Heading with the count',
                    'wishlist_actions'      => 'Share / download / clear buttons',
                    'wishlist_empty'        => 'The "nothing saved yet" message',
                    'wishlist_sort'         => 'Sort chooser',
                    'wishlist_list'         => 'Saved properties as a list',
                    'wishlist_compare_btn'  => 'Compare button',
                    'wishlist_modals'       => 'Share / compare windows (needed by the buttons)',
                    'wishlist_counter'      => 'Counter for a menu or header',
                ],
            ],
            [
                'title' => 'Anywhere on the site',
                'items' => [
                    'language_selector' => 'Language chooser',
                    'currency_selector' => 'Currency chooser',
                    'share_buttons'     => 'Share buttons',
                    'chat_bubble'       => 'AI chat bubble',
                    'chat_panel'        => 'AI chat panel',
                ],
            ],
        ];
    }

    public static function options() {
        return [
            'data-spm-location="5216585"'   => 'Only this location. Use the ID from SPM &rarr; Filter IDs — names like "Marbella" can belong to an area, a municipality and a town at once. A name is accepted only when it is unique in your list.',
            'data-spm-type="14"'            => 'Only this property type (ID from Filter IDs).',
            'data-spm-features="31,44"'     => 'Only properties with these features (IDs, comma separated).',
            'data-spm-for="sale"'           => 'sale, rent, holiday or new-development',
            'data-spm-beds="3"'             => 'At least 3 bedrooms. A range works too: <code>beds="3-4"</code>.',
            'data-spm-baths="2"'            => 'At least 2 bathrooms (ranges allowed).',
            'data-spm-under="500000"'       => 'Maximum price. <code>over="200000"</code> sets a minimum, <code>price="200000-500000"</code> both.',
            'data-spm-built="120-300"'      => 'Built area in m². <code>plot=""</code> and <code>terrace=""</code> work the same way.',
            'data-spm-featured="yes"'       => 'Only listings marked Featured in the dashboard. Mark some first, or the block will be empty.',
            'data-spm-own="yes"'            => 'Only your own listings, not the ones shared from a feed.',
            'data-spm-own-first="yes"'      => 'Everything, with your own listings at the top.',
            'data-spm-sort="newest"'        => 'newest, oldest, price_asc, price_desc, featured or updated',
            'data-spm-limit="6"'            => 'How many properties to show',
            'data-spm-ref="R1234,R2345"'  => 'Only these properties, in this order (reference numbers, comma separated, up to 50). One reference shows just that property.',
            'data-spm-template="3"'         => 'Pin one design instead of the dashboard one',
            'data-spm-fixed="yes"'          => 'The visitor cannot change these filters (for a page like "Marbella villas")',
            'data-spm-standalone'           => 'This block searches on its own — use it when one page holds several different lists (e.g. "Latest in Marbella" and "New developments"). Without it, the page\'s search form drives the list.',
            'class="my-class"'              => 'Your own CSS class on the block',
        ];
    }
}
