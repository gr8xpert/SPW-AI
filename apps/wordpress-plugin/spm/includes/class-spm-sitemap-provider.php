<?php
if (!defined('ABSPATH')) exit;

if (!class_exists('WP_Sitemaps_Provider')) return;

/**
 * Native WP 5.5+ sitemap provider that surfaces property detail URLs at
 * /wp-sitemap.xml automatically. One subtype, paginated by sitemap_max_urls.
 */
class SPM_Sitemap_Provider extends WP_Sitemaps_Provider {

    public function __construct() {
        $this->name        = 'spm_properties';
        $this->object_type = 'spm_properties';
    }

    public function get_url_list($page_num, $subtype = '') {
        $refs = SPM_Sitemap::instance()->fetch_refs();
        $per_page = (int) apply_filters('wp_sitemaps_max_urls', 2000);
        if ($per_page < 1) $per_page = 2000;

        $offset = ($page_num - 1) * $per_page;
        $slice  = array_slice($refs, $offset, $per_page);

        $urls = [];
        foreach ($slice as $row) {
            $entry = ['loc' => SPM_Sitemap::url_for($row)];
            if (!empty($row['lastmod'])) $entry['lastmod'] = $row['lastmod'];
            $urls[] = $entry;
        }
        return $urls;
    }

    public function get_max_num_pages($subtype = '') {
        $refs = SPM_Sitemap::instance()->fetch_refs();
        $per_page = (int) apply_filters('wp_sitemaps_max_urls', 2000);
        if ($per_page < 1) $per_page = 2000;
        $total = count($refs);
        return $total === 0 ? 0 : (int) ceil($total / $per_page);
    }

    public function get_object_subtypes() {
        return [];
    }
}
