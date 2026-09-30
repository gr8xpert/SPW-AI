<?php
if (!defined('ABSPATH')) exit;

/**
 * Inject property detail URLs into XML sitemaps so Google can discover and
 * index them. Hooks into Yoast SEO, Rank Math, AIOSEO, and native WP sitemaps
 * (added in WP 5.5). Pulls refs from /api/v1/property-refs.
 *
 * Falls back gracefully when no SEO plugin is active — WP core sitemaps are
 * always available on modern WP installs.
 */
class SPM_Sitemap {
    const TRANSIENT_REFS = 'spm_sitemap_refs';
    const TTL = 6 * HOUR_IN_SECONDS;
    const SUBTYPE = 'spm-properties';

    private static $instance = null;
    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // Always-on: property URLs in sitemaps are core SEO and should "just work"
        // for every install. Cap is fixed at 5000 (was a settings field before V2.2).
        // Yoast SEO
        add_filter('wpseo_sitemap_index', [$this, 'yoast_index']);
        add_action('init', [$this, 'register_yoast_provider']);

        // Rank Math
        add_filter('rank_math/sitemap/index', [$this, 'rankmath_index']);
        add_filter('rank_math/sitemap/external_sitemaps', function ($items) {
            $items[] = ['loc' => home_url('/spm-sitemap.xml'), 'lastmod' => date('c')];
            return $items;
        });

        // Native WP sitemap (5.5+) — register a custom provider
        add_action('init', [$this, 'register_wp_provider']);

        // Standalone /spm-sitemap.xml endpoint (works without any SEO plugin)
        add_action('init', [$this, 'register_rewrite']);
        // Before WordPress's redirect_canonical (template_redirect, 10), which
        // would send /spm-sitemap.xml to /spm-sitemap.xml/.
        add_action('template_redirect', [$this, 'serve_standalone'], 0);
    }

    /** Cached list of property refs (+ optional title slugs + lastmod). */
    public function fetch_refs() {
        $cached = get_transient(self::TRANSIENT_REFS);
        if ($cached !== false) return $cached;

        $max = 5000;
        // Title slugs must be in the language the sitemap URLs use (default).
        $lang = class_exists('SPM_I18n') ? SPM_I18n::instance()->default_lang_code() : 'en';
        $r = SPM_API_Client::get('api/v1/property-refs', ['limit' => $max, 'lang' => $lang ?: 'en']);
        if (is_wp_error($r)) {
            set_transient(self::TRANSIENT_REFS, [], 5 * MINUTE_IN_SECONDS);
            return [];
        }
        $rows = $r['data'] ?? $r;
        if (!is_array($rows)) $rows = [];

        $out = [];
        foreach ($rows as $row) {
            if (is_string($row)) {
                $out[] = ['ref' => $row, 'title_slug' => '', 'lastmod' => ''];
                continue;
            }
            $ref = $row['reference'] ?? $row['ref'] ?? '';
            if (!$ref) continue;
            $out[] = [
                'ref'        => $ref,
                'title_slug' => $row['titleSlug'] ?? $row['slug'] ?? '',
                // Full segment from the API (slug format + custom slug); newer APIs only.
                'segment'    => $row['segment'] ?? '',
                'lastmod'    => $row['updatedAt'] ?? $row['lastModified'] ?? '',
            ];
        }

        set_transient(self::TRANSIENT_REFS, $out, self::TTL);
        return $out;
    }

    /** A property's sitemap URL from a fetch_refs() row (same address the widget links to). */
    public static function url_for($row) {
        return self::build_url($row['ref'], $row['title_slug'] ?? '', $row['segment'] ?? '');
    }

    private static function build_url($ref, $title_slug = '', $segment = '') {
        // Sitemap URLs are emitted in the default language (one canonical URL
        // per property). Translation plugins discover language alternates via
        // the hreflang tags rendered on the detail page itself.
        $default = class_exists('SPM_I18n') ? SPM_I18n::instance()->default_lang_code() : 'en';
        $slug = SPM_Plugin::slug('detail', $default);
        $path = $segment !== '' ? $segment : ($title_slug ? $title_slug . '_' . $ref : $ref);
        return home_url('/' . $slug . '/' . rawurlencode($path));
    }

    // ─── Yoast ────────────────────────────────────────────────────────

    public function yoast_index($str) {
        $str .= '<sitemap>'
              . '<loc>' . esc_url(home_url('/spm-sitemap.xml')) . '</loc>'
              . '<lastmod>' . date('c') . '</lastmod>'
              . '</sitemap>';
        return $str;
    }

    public function register_yoast_provider() {
        if (!class_exists('WPSEO_Sitemap_Provider')) return;
        // Yoast lets us appendix via its index hook above; the standalone URL
        // serves the content. No separate provider class needed for simple appends.
    }

    // ─── Rank Math ────────────────────────────────────────────────────

    public function rankmath_index($str) {
        return $str . '<sitemap>'
              . '<loc>' . esc_url(home_url('/spm-sitemap.xml')) . '</loc>'
              . '<lastmod>' . date('c') . '</lastmod>'
              . '</sitemap>';
    }

    // ─── Native WP sitemap (5.5+) ─────────────────────────────────────

    public function register_wp_provider() {
        if (!function_exists('wp_register_sitemap_provider') || !class_exists('WP_Sitemaps_Provider')) return;
        require_once SPM_DIR . 'includes/class-spm-sitemap-provider.php';
        wp_register_sitemap_provider('spm_properties', new SPM_Sitemap_Provider());
    }

    // ─── Standalone /spm-sitemap.xml ──────────────────────────────────

    public function register_rewrite() {
        add_rewrite_rule('^spm-sitemap\.xml$', 'index.php?spm_sitemap=1', 'top');
        // The address before 2.8.0, which sites may have given to search engines.
        add_rewrite_rule('^spw-sitemap\.xml$', 'index.php?spm_sitemap=1', 'top');
        add_filter('query_vars', function ($v) { $v[] = 'spm_sitemap'; return $v; });
    }

    public function serve_standalone() {
        if (!get_query_var('spm_sitemap')) return;

        nocache_headers();
        header('Content-Type: application/xml; charset=UTF-8');
        echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
        echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";

        foreach ($this->fetch_refs() as $row) {
            $url = self::url_for($row);
            echo "  <url>\n";
            echo '    <loc>' . esc_url($url) . "</loc>\n";
            if (!empty($row['lastmod'])) {
                echo '    <lastmod>' . esc_html($row['lastmod']) . "</lastmod>\n";
            }
            echo "    <changefreq>weekly</changefreq>\n";
            echo "    <priority>0.7</priority>\n";
            echo "  </url>\n";
        }
        echo '</urlset>';
        exit;
    }

    /** Manually flush the cached ref list (e.g. after large data import). */
    public static function flush() {
        delete_transient(self::TRANSIENT_REFS);
    }
}
