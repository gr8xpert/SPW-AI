<?php
if (!defined('ABSPATH')) exit;

if (!class_exists('WP_Sitemaps_Provider')) return;

/**
 * Native WP 5.5+ sitemap provider that surfaces property detail URLs at
 * /wp-sitemap.xml automatically. One subtype, paginated by sitemap_max_urls.
 */
class SPW_Sitemap_Provider extends WP_Sitemaps_Provider {

    public function __construct() {
        $this->name        = 'spw_properties';
        $this->object_type = 'spw_properties';
    }

    public function get_url_list($page_num, $subtype = '') {
        $refs = SPW_Sitemap::instance()->fetch_refs();
        $per_page = (int) apply_filters('wp_sitemaps_max_urls', 2000);
        if ($per_page < 1) $per_page = 2000;

        $offset = ($page_num - 1) * $per_page;
        $slice  = array_slice($refs, $offset, $per_page);

        $urls = [];
        $default = class_exists('SPW_I18n') ? SPW_I18n::instance()->default_lang_code() : 'en';
        $slug = SPW_Plugin::slug('detail', $default);

        foreach ($slice as $row) {
            $ref = $row['ref'];
            $ts  = $row['title_slug'] ?? '';
            $path = $ts ? $ts . '_' . $ref : $ref;

            $entry = ['loc' => home_url('/' . $slug . '/' . $path)];
            if (!empty($row['lastmod'])) $entry['lastmod'] = $row['lastmod'];
            $urls[] = $entry;
        }
        return $urls;
    }

    public function get_max_num_pages($subtype = '') {
        $refs = SPW_Sitemap::instance()->fetch_refs();
        $per_page = (int) apply_filters('wp_sitemaps_max_urls', 2000);
        if ($per_page < 1) $per_page = 2000;
        $total = count($refs);
        return $total === 0 ? 0 : (int) ceil($total / $per_page);
    }

    public function get_object_subtypes() {
        return [];
    }
}
