<?php
if (!defined('ABSPATH')) exit;

/**
 * Which page plays each role (listings / detail / wishlist), whether the
 * plugin created it or the admin built it by hand.
 *
 *   1. the page the generator created (stored in the settings), if published
 *   2. a published page sitting on the configured slug
 *   3. a published page carrying that role's widget code — a `data-spm-widget`
 *      div, a design id or an [spm_*] shortcode, in the page body or in a page
 *      builder's own storage (Elementor keeps its layout in post meta)
 *
 * Without 2 and 3 a hand-built property page answered /property/<ref> with
 * "Page not found", and the wishlist link pointed at a /wishlist/ page that
 * did not exist. Search results are remembered until a page is saved.
 */
class SPM_Page_Finder {
    const CACHE = 'spm_found_pages';

    /** Text that marks a page as playing a role. Quote-free: Divi encodes quotes. */
    const MARKERS = [
        // A page built from single parts ([spm block="detail_title"] …) is one too.
        'detail'   => ['site-detail', 'detail-template-', '[spm_detail', '[spm_property', 'detail_title', 'detail_gallery', 'detail_price', 'detail_description'],
        // Not a bare "[spm_wishlist": that also matched [spm_wishlist_form] (2.9.11).
        'wishlist' => ['wishlist_grid', '[spm_wishlist]', '[spm_wishlist '],
        'listings' => ['site-listing', 'listing-template-', '[spm_listing'],
        'buyer'    => ['buyer-page', '[spm_buyer_page'],
    ];

    private static $instance = null;
    private static $memo = [];

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('save_post_page', [self::class, 'forget']);
        add_action('trashed_post', [self::class, 'forget']);
        add_action('untrashed_post', [self::class, 'forget']);
        add_action('deleted_post', [self::class, 'forget']);
        // Elementor writes its layout meta after the post itself is saved.
        add_action('elementor/editor/after_save', [self::class, 'forget']);
    }

    public static function forget() {
        self::$memo = [];
        delete_option(self::CACHE);
    }

    /**
     * The default-language page for a role, or 0.
     * @param string $type listings | detail | wishlist | map
     * @param string $slug_lang language whose slug to try (step 2); default language when ''
     */
    public static function page_id($type, $slug_lang = '') {
        $id = (int) SPM_Plugin::get($type . '_page_id');
        if ($id && get_post_status($id) === 'publish') return $id;
        if (!isset(self::MARKERS[$type])) return 0;

        $lang = $slug_lang ?: (class_exists('SPM_I18n') ? SPM_I18n::instance()->default_lang_code() : 'en');
        // The detail slug is the property URL prefix (/property/<ref>), and a
        // page may sit on it — the generator's own page is "<slug>-detail".
        $slug = SPM_Plugin::slug($type, $lang);
        $at_slug = $slug ? get_page_by_path($slug) : null;
        if ($at_slug && $at_slug->post_status === 'publish') {
            return (int) $at_slug->ID;
        }

        return self::found($type);
    }

    /** A published page carrying the role's widget code, or 0 (cached). */
    public static function found($type) {
        if (isset(self::$memo[$type])) return self::$memo[$type];
        $cache = get_option(self::CACHE, []);
        $cache = is_array($cache) ? $cache : [];
        if (array_key_exists($type, $cache)) {
            $id = (int) $cache[$type];
            if (!$id || get_post_status($id) === 'publish') return self::$memo[$type] = $id;
        }
        $id = self::search($type);
        $cache[$type] = $id;
        update_option(self::CACHE, $cache, false);
        return self::$memo[$type] = $id;
    }

    private static function search($type) {
        $ids = self::matching_ids($type);
        if (!$ids) return 0;

        // A listings page must not be the homepage (featured listings), one
        // of the search-tab pages (/properties-for-sale/ …) or a property /
        // wishlist page.
        if ($type === 'listings') {
            $front = (int) get_option('page_on_front');
            if ($front) $ids = array_values(array_diff($ids, [$front]));
            $skip = [];
            foreach (SPM_Plugin::TAB_TYPES as $tab) {
                foreach ((array) SPM_Plugin::get('slugs_' . $tab, []) as $s) if ($s) $skip[$s] = true;
            }
            $other = array_merge(self::matching_ids('detail'), self::matching_ids('wishlist'));
            $ids = array_values(array_filter($ids, function ($id) use ($skip, $other) {
                return !in_array($id, $other, true) && !isset($skip[get_post_field('post_name', $id)]);
            }));
            if (!$ids) return 0;
        }

        // Multilingual sites: the default-language page; translations are
        // picked per URL language by the caller.
        $info = class_exists('SPM_I18n') ? SPM_I18n::instance()->detect() : ['plugin' => ''];
        $default = class_exists('SPM_I18n') ? SPM_I18n::instance()->default_lang_code() : 'en';
        foreach ($ids as $id) {
            $lang = '';
            if ($info['plugin'] === 'polylang' && function_exists('pll_get_post_language')) {
                $lang = (string) pll_get_post_language($id);
            } elseif ($info['plugin'] === 'wpml') {
                $d = apply_filters('wpml_element_language_details', null, ['element_id' => $id, 'element_type' => 'page']);
                $lang = (string) ($d->language_code ?? '');
            }
            if ($lang === '' || $lang === $default) return $id;
        }
        return $ids[0];
    }

    /** Published pages whose body or Elementor layout holds a marker, oldest first. */
    private static function matching_ids($type) {
        global $wpdb;
        $content = [];
        $meta = [];
        $args_c = [];
        $args_m = [];
        foreach (self::MARKERS[$type] as $m) {
            $like = '%' . $wpdb->esc_like($m) . '%';
            $content[] = 'p.post_content LIKE %s';
            $args_c[] = $like;
            $meta[] = 'pm.meta_value LIKE %s';
            $args_m[] = $like;
        }
        $sql = "SELECT p.ID FROM {$wpdb->posts} p
            WHERE p.post_type = 'page' AND p.post_status = 'publish'
              AND ((" . implode(' OR ', $content) . ")
                OR p.ID IN (SELECT pm.post_id FROM {$wpdb->postmeta} pm
                            WHERE pm.meta_key = '_elementor_data' AND (" . implode(' OR ', $meta) . ")))
            ORDER BY p.ID ASC LIMIT 50";
        $rows = $wpdb->get_col($wpdb->prepare($sql, array_merge($args_c, $args_m)));
        return array_map('intval', (array) $rows);
    }
}
