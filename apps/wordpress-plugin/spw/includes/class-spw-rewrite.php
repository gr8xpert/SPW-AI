<?php
if (!defined('ABSPATH')) exit;

/**
 * Routes `/<detail-slug>/<ref>` (and `/<lang>/<detail-slug>/<ref>`) to the
 * auto-created detail page so the widget can pick the ref off the URL.
 *
 * Detail slug now resolves per-language from the configured slug map. We
 * register a rule for every (lang, slug) pair — plus an unprefixed rule for
 * the default language — so an admin can use translated slugs like
 * `/es/propiedad/villa-marbella_R5P-123`.
 */
class SPW_Rewrite {
    private static $instance = null;
    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('init', [self::class, 'add_rules']);
        add_filter('query_vars', [$this, 'query_vars']);
        // Priority 0 — run before WP's redirect_canonical (default 10) so it
        // can't bounce /property/<ref>/ → /property/ before we route.
        add_action('template_redirect', [$this, 'route_to_detail'], 0);
        // Belt-and-braces: kill canonical redirects on our detail URLs.
        add_filter('redirect_canonical', [$this, 'block_canonical_for_detail'], 10, 2);
    }

    public function block_canonical_for_detail($redirect_url, $requested_url) {
        if (get_query_var('spw_ref')) return false;
        return $redirect_url;
    }

    public function query_vars($vars) {
        $vars[] = 'spw_ref';
        $vars[] = 'spw_lang';
        return $vars;
    }

    public static function add_rules() {
        $map = (array) SPW_Plugin::get('slugs_detail', ['en' => 'property']);
        if (empty($map)) $map = ['en' => 'property'];

        // Default-language (no prefix) rules — one per unique slug so older
        // links continue to work if the admin reshuffled the map.
        $default_lang = class_exists('SPW_I18n') ? SPW_I18n::instance()->default_lang_code() : 'en';
        $seen = [];
        foreach ($map as $lang => $slug) {
            if (!$slug) continue;
            if (isset($seen[$slug])) continue;
            $seen[$slug] = true;
            $quoted = preg_quote($slug, '#');
            add_rewrite_rule(
                '^' . $quoted . '/([^/]+)/?$',
                'index.php?spw_ref=$matches[1]',
                'top'
            );
        }

        // Language-prefixed rules — one per (lang, slug) pair. We DON'T skip
        // the default lang here because some translation plugins do prefix it.
        foreach ($map as $lang => $slug) {
            if (!$lang || !$slug || $lang === $default_lang) continue;
            $lc = preg_quote($lang, '#');
            $sl = preg_quote($slug, '#');
            add_rewrite_rule(
                '^' . $lc . '/' . $sl . '/([^/]+)/?$',
                'index.php?spw_lang=' . $lang . '&spw_ref=$matches[1]',
                'top'
            );
        }
    }

    public static function is_property_detail() {
        return (bool) get_query_var('spw_ref', false);
    }

    /**
     * When a ref matches, render the auto-created detail page so the widget
     * can mount inside it.
     */
    public function route_to_detail() {
        if (!self::is_property_detail()) return;
        $detail_id = (int) SPW_Plugin::get('detail_page_id');

        // Fall back to a designer-built page so admins don't have to click
        // "Create Pages". Strategy (first match wins):
        //   a) page whose slug matches the configured detail slug for the lang
        //   b) any published page whose content contains the detail widget marker
        if (!$detail_id) {
            $lang = (string) get_query_var('spw_lang');
            if (!$lang && class_exists('SPW_I18n')) {
                $lang = SPW_I18n::instance()->current_lang() ?: 'en';
            }
            $slug = SPW_Plugin::slug('detail', $lang);
            $found = get_page_by_path($slug);
            if ($found) $detail_id = (int) $found->ID;
        }

        if (!$detail_id) {
            $hits = get_posts([
                'post_type'      => 'page',
                'post_status'    => 'publish',
                's'              => 'detail-template-01',
                'numberposts'    => 1,
                'fields'         => 'ids',
                'suppress_filters' => true,
            ]);
            if (!empty($hits)) $detail_id = (int) $hits[0];
        }

        if (!$detail_id) return;

        $page = get_post($detail_id);
        if (!$page) return;

        global $wp_query, $post;
        $wp_query->is_404            = false;
        $wp_query->is_home           = false;
        $wp_query->is_archive        = false;
        $wp_query->is_singular       = true;
        $wp_query->is_page           = true;
        $wp_query->is_single         = false;
        $wp_query->queried_object    = $page;
        $wp_query->queried_object_id = $page->ID;
        $wp_query->post              = $page;
        $wp_query->posts             = [$page];
        $wp_query->post_count        = 1;
        $wp_query->found_posts       = 1;
        $wp_query->max_num_pages     = 1;
        $post = $page;
        setup_postdata($page);
        status_header(200);
    }

    /** Returns the current ref or null. Splits on the LAST underscore. */
    public static function current_ref() {
        $raw = get_query_var('spw_ref');
        if (!$raw) return null;
        $under = strrpos($raw, '_');
        if ($under === false) return $raw;
        return substr($raw, $under + 1);
    }

    /** Returns the title-slug portion of the URL (before the ref), if any. */
    public static function current_title_slug() {
        $raw = get_query_var('spw_ref');
        if (!$raw) return '';
        $under = strrpos($raw, '_');
        if ($under === false) return '';
        return substr($raw, 0, $under);
    }
}
