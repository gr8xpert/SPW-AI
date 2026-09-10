<?php
if (!defined('ABSPATH')) exit;

/**
 * Creates the three widget host pages on-demand. Called from the settings
 * page's "Create Pages" button — NOT auto-run on activation, since installs
 * often have hand-built pages already and we don't want to clutter them.
 *
 * Pages are pre-filled with raw `<div data-spm-widget="...">` blocks so the
 * markup matches what a non-WordPress embed would use. This keeps the
 * documentation single-source-of-truth: copy the same div onto any site.
 *
 * The Detail page is virtual in practice — the rewrite routes
 * `/{slug}/{ref}` requests to it — but we still create a real WP page so it
 * has a settings-page link and supports the OG / loading-overlay hooks.
 *
 * @return array Map of opt_key => {status: 'created'|'exists'|'failed', id?: int, error?: string, title?: string}
 */
class SPW_Page_Generator {

    public static function create_pages() {
        $opts = get_option(SPW_OPTION, SPW_Plugin::default_settings());
        $changed = false;
        $results = [];

        $listings_html =
            "<!-- wp:html -->\n"
          . '<div data-spm-widget="search-template-01"></div>' . "\n\n"
          . '<div data-spm-widget="listing-template-01"></div>' . "\n"
          . "<!-- /wp:html -->";

        $detail_html =
            "<!-- wp:html -->\n"
          . '<div data-spm-widget="detail-template-01"></div>' . "\n"
          . "<!-- /wp:html -->";

        $wishlist_html =
            "<!-- wp:html -->\n"
          . '<div data-spm-widget="wishlist_header"></div>' . "\n"
          . '<div data-spm-widget="wishlist_actions"></div>' . "\n"
          . '<div data-spm-widget="wishlist_grid"></div>' . "\n"
          . '<div data-spm-widget="wishlist_empty"></div>' . "\n"
          . "<!-- /wp:html -->";

        $pages = [
            'listings_page_id' => [
                'title'   => SPW_Plugin::page_title('listings'),
                'slug'    => SPW_Plugin::slug('listings', 'en'),
                'content' => $listings_html,
            ],
            'detail_page_id' => [
                'title'   => SPW_Plugin::page_title('detail'),
                'slug'    => SPW_Plugin::slug('detail', 'en') . '-detail',
                'content' => $detail_html,
            ],
            'wishlist_page_id' => [
                'title'   => SPW_Plugin::page_title('wishlist'),
                'slug'    => SPW_Plugin::slug('wishlist', 'en'),
                'content' => $wishlist_html,
            ],
        ];

        foreach ($pages as $opt_key => $page) {
            $existing_id = (int)($opts[$opt_key] ?? 0);
            if ($existing_id && get_post_status($existing_id)) {
                $results[$opt_key] = [
                    'status' => 'exists',
                    'id'     => $existing_id,
                    'title'  => get_the_title($existing_id),
                ];
                continue;
            }

            $id = wp_insert_post([
                'post_title'     => $page['title'],
                'post_name'      => $page['slug'],
                'post_content'   => $page['content'],
                'post_status'    => 'publish',
                'post_type'      => 'page',
                'comment_status' => 'closed',
                'ping_status'    => 'closed',
            ], true);

            if (is_wp_error($id) || !$id) {
                $results[$opt_key] = [
                    'status' => 'failed',
                    'error'  => is_wp_error($id) ? $id->get_error_message() : 'unknown',
                    'title'  => $page['title'],
                ];
                continue;
            }

            $opts[$opt_key] = (int) $id;
            $changed = true;
            $results[$opt_key] = [
                'status' => 'created',
                'id'     => (int) $id,
                'title'  => $page['title'],
            ];
        }

        if ($changed) update_option(SPW_OPTION, $opts);
        return $results;
    }
}
