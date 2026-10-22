<?php
if (!defined('ABSPATH')) exit;

/**
 * The buyer's personal "My properties" page (SPM Buyer Match, 2.9.12).
 *
 * Buyers open it from the link in the emails their agent sends
 * (/my-properties/?t=<code>); the [spm_buyer_page] block shows the
 * properties sent to them and lets them like, reject or ask to view each.
 * The page is personal, so it is kept out of search engines, sitemaps and
 * page caches, and the plugin tells SPM its address (x-spm-buyer-page) so
 * the links in emails point here.
 */
class SPM_Buyer_Page {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_filter('wp_robots', [$this, 'robots']);
        add_action('template_redirect', [$this, 'no_cache'], 0);
        add_filter('wp_sitemaps_posts_query_args', [$this, 'core_sitemap'], 10, 2);
        add_filter('wpseo_exclude_from_sitemap_by_post_ids', [$this, 'excluded_ids']);
        add_filter('rank_math/sitemap/exclude_posts', [$this, 'excluded_ids_csv']);
        add_action('wp_ajax_spm_create_buyer_page', [$this, 'ajax_create']);
    }

    /** The page's id (default language), or 0. */
    public static function page_id() {
        return (int) SPM_Page_Finder::page_id('buyer');
    }

    /** The page's address in the site's default language, or '' when there is none. */
    public static function url() {
        $id = self::page_id();
        if (!$id) return '';
        $url = get_permalink($id);
        return $url ? (string) $url : '';
    }

    /** The page and its translations (Polylang / WPML). */
    private static function all_ids() {
        $id = self::page_id();
        if (!$id) return [];
        $ids = [$id];
        $info = SPM_I18n::instance()->detect();
        if (in_array($info['plugin'], ['polylang', 'wpml'], true)) {
            foreach (SPM_I18n::instance()->all_language_codes() as $lang) {
                $tid = SPM_Page_Generator::translation_of($info['plugin'], $id, $lang);
                if ($tid) $ids[] = (int) $tid;
            }
        }
        return array_values(array_unique($ids));
    }

    private static function is_buyer_page() {
        if (!is_page()) return false;
        $ids = self::all_ids();
        return $ids && in_array((int) get_queried_object_id(), $ids, true);
    }

    public function robots($robots) {
        if (self::is_buyer_page()) {
            $robots['noindex'] = true;
            $robots['nofollow'] = true;
            unset($robots['max-image-preview']);
        }
        return $robots;
    }

    /** Personal content: never served from a page cache, never indexed. */
    public function no_cache() {
        if (!self::is_buyer_page()) return;
        if (!defined('DONOTCACHEPAGE')) define('DONOTCACHEPAGE', true);
        nocache_headers();
        header('X-Robots-Tag: noindex, nofollow', true);
        // The code in the address must not leak to other sites (images, links).
        header('Referrer-Policy: same-origin', true);
        do_action('litespeed_control_set_nocache', 'spm buyer page');
    }

    public function core_sitemap($args, $post_type) {
        if ($post_type !== 'page') return $args;
        $ids = self::all_ids();
        if ($ids) $args['post__not_in'] = array_merge((array) ($args['post__not_in'] ?? []), $ids);
        return $args;
    }

    public function excluded_ids($ids) {
        return array_merge((array) $ids, self::all_ids());
    }

    public function excluded_ids_csv($csv) {
        $ids = self::all_ids();
        if (!$ids) return $csv;
        return trim((string) $csv . ',' . implode(',', $ids), ',');
    }

    public function ajax_create() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $results = SPM_Page_Generator::create_pages(['types' => ['buyer'], 'publish' => true]);
        SPM_Page_Finder::forget();
        wp_send_json_success(['results' => $results, 'url' => self::url()]);
    }
}
