<?php
if (!defined('ABSPATH')) exit;

/**
 * Property pages (/<detail-slug>/<segment>) for crawlers and caches (2.9.9).
 *
 * Crawlers request every property page, often with parameters picked up
 * elsewhere (?page=2, ?il_page=…, a stray ?ref=). Each variant used to be a
 * new page built from scratch, so one site could be crawled endlessly.
 *
 *  1. One address per property: a request whose path is not the property's
 *     canonical address (old title, other language's slug, trailing slash) or
 *     that carries parameters SPM does not use gets a 301 to the clean
 *     address. Tracking parameters (utm_*, gclid, fbclid, …) are kept.
 *  2. Cacheable: no Set-Cookie for visitors (Polylang's pll_language and the
 *     like stop Nginx / Cloudflare from caching), and a Cache-Control that
 *     lets a server or CDN cache keep the page.
 *  3. The finished HTML is saved as a file (uploads/spm-cache/pages/) per
 *     address and served from there for up to 6 hours. The data version is in
 *     the folder name, so a property or dashboard edit (new syncVersion)
 *     starts a fresh folder; a new widget build, a plugin update or any saved
 *     post clears it too.
 *
 * Logged-in users (page builders, previews) are never redirected or cached.
 * Turn the HTML cache off with define('SPM_PAGE_CACHE', false) or the
 * spm_page_cache_enabled filter. Response headers: X-SPM-Cache (HIT/MISS/
 * BYPASS) and Server-Timing (PHP time), to see where the time goes.
 */
class SPM_Detail_Page {
    const TTL = 6 * HOUR_IN_SECONDS;
    const DIR = 'spm-cache/pages';

    // Parameters that never change the page: kept on redirects, ignored for the cache.
    const TRACKING = [
        'gclid', 'gbraid', 'wbraid', 'dclid', 'fbclid', 'msclkid', 'yclid', 'twclid', 'ttclid',
        'li_fat_id', 'mc_cid', 'mc_eid', '_ga', '_gl', 'srsltid', 'igshid',
    ];
    // Parameters that do change the page: kept on redirects and part of the cache key.
    const NEEDED = ['lang'];

    private static $instance = null;
    private $status = 'BYPASS';

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // After SPM_Rewrite::route_to_detail (0); the redirect after
        // SPM_OG_Tags::prepare (5), which loads the property.
        add_action('template_redirect', [$this, 'serve_cached'], 1);
        add_action('template_redirect', [$this, 'redirect_and_buffer'], 6);
        add_action('save_post', [$this, 'on_save_post'], 10, 2);
        foreach (['switch_theme', 'customize_save_after', 'wp_update_nav_menu', 'upgrader_process_complete'] as $hook) {
            add_action($hook, [self::class, 'clear']);
        }
        add_action('update_option_spm_widget_version', [self::class, 'clear']);
    }

    /* ---------------- 1. one address per property ---------------- */

    public function redirect_and_buffer() {
        if (!$this->applies()) return;
        $property = SPM_OG_Tags::instance()->current_property();
        if (!$property) return; // unknown ref: leave it to the page

        $lang = class_exists('SPM_I18n') ? (SPM_I18n::instance()->current_lang() ?: 'en') : 'en';
        $canonical = SPM_OG_Tags::property_url($property, $lang);
        $target = $this->clean_url($canonical, (string) ($property['reference'] ?? ''));
        if ($target !== null) {
            $this->no_cookies();
            wp_safe_redirect($target, 301, 'Smart Property Manager');
            exit;
        }

        $this->cache_headers();
        $this->no_cookies();
        if ($this->cache_enabled() && $this->cacheable_request()) {
            $this->status = 'MISS';
            ob_start([$this, 'store']);
        }
    }

    /**
     * The address to redirect to, or null when the request already is the
     * clean address. The path is only replaced when the canonical path still
     * names this property, so a redirect can never point at another page.
     */
    private function clean_url($canonical, $reference) {
        $req_path = (string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH);
        $can_path = (string) parse_url($canonical, PHP_URL_PATH);
        parse_str((string) ($_SERVER['QUERY_STRING'] ?? ''), $query);

        $keep = [];
        $dropped = false;
        foreach ($query as $k => $v) {
            if ($this->is_tracking($k) || in_array($k, self::NEEDED, true) || in_array($k, (array) apply_filters('spm_detail_allowed_params', []), true)) {
                $keep[$k] = $v;
            } else {
                $dropped = true;
            }
        }

        $move = $can_path !== '' && rawurldecode($req_path) !== rawurldecode($can_path)
            && $reference !== '' && stripos(rawurldecode($can_path), $reference) !== false;
        if (!$dropped && !$move) return null;

        // Same scheme and host as the canonical (the site's own), never the request's Host.
        $origin = (string) parse_url($canonical, PHP_URL_SCHEME) . '://' . (string) parse_url($canonical, PHP_URL_HOST);
        $port = parse_url($canonical, PHP_URL_PORT);
        if ($port) $origin .= ':' . $port;
        $base = $origin . ($move ? $can_path : $req_path);
        return $keep ? add_query_arg(array_map('rawurlencode', $this->flatten($keep)), $base) : $base;
    }

    private function flatten($params) {
        $out = [];
        foreach ($params as $k => $v) $out[$k] = is_array($v) ? (string) reset($v) : (string) $v;
        return $out;
    }

    private function is_tracking($key) {
        return strpos($key, 'utm_') === 0 || in_array($key, self::TRACKING, true);
    }

    /* ---------------- 2. cacheable responses ---------------- */

    public function cache_headers() {
        if (headers_sent()) return;
        // Browsers keep it 5 minutes; a server or CDN cache up to an hour.
        header('Cache-Control: ' . apply_filters('spm_detail_cache_control', 'public, max-age=300, s-maxage=3600'));
        header_remove('Pragma');
        header_remove('Expires');
    }

    private function no_cookies() {
        if (!headers_sent()) header_remove('Set-Cookie');
    }

    /* ---------------- 3. HTML cache ---------------- */

    public function serve_cached() {
        if (!$this->applies() || !$this->cache_enabled() || !$this->cacheable_request()) return;
        $file = $this->file();
        if (!$file || !is_readable($file) || (time() - (int) @filemtime($file)) > self::TTL) return;
        $html = @file_get_contents($file);
        if ($html === false || $html === '') return;

        $this->status = 'HIT';
        if (!headers_sent()) {
            $this->no_cookies();
            header('Content-Type: text/html; charset=' . get_option('blog_charset', 'UTF-8'));
            $this->cache_headers();
            $this->timing_headers();
        }
        echo $html;
        exit;
    }

    /** Output-buffer callback: save the finished page, then send it unchanged. */
    public function store($html, $phase = PHP_OUTPUT_HANDLER_FINAL) {
        $this->no_cookies();
        $this->timing_headers();
        // Only a whole page in one piece (something that flushed early leaves a fragment).
        if (!($phase & PHP_OUTPUT_HANDLER_START) || !($phase & PHP_OUTPUT_HANDLER_FINAL)) return $html;
        if (defined('DONOTCACHEPAGE') && DONOTCACHEPAGE) return $html;
        if (http_response_code() !== 200 || stripos($html, '<html') === false || stripos($html, '</html>') === false) return $html;
        $file = $this->file();
        if (!$file) return $html;
        $dir = dirname($file);
        if (!is_dir($dir) && !wp_mkdir_p($dir)) return $html;
        $this->prune_old_versions();
        $tmp = $file . '.' . wp_generate_password(6, false) . '.tmp';
        if (@file_put_contents($tmp, $html . "\n<!-- SPM page cache " . gmdate('c') . " -->") !== false) {
            @rename($tmp, $file);
        } else {
            @unlink($tmp);
        }
        return $html;
    }

    private function timing_headers() {
        if (headers_sent()) return;
        header('X-SPM-Cache: ' . $this->status);
        $start = (float) ($_SERVER['REQUEST_TIME_FLOAT'] ?? microtime(true));
        header('Server-Timing: php;dur=' . round((microtime(true) - $start) * 1000) . ';desc="' . $this->status . '"', false);
    }

    /** uploads/spm-cache/pages/v<syncVersion>/<md5 of address>.html */
    private function file() {
        $root = self::root();
        if (!$root) return null;
        parse_str((string) ($_SERVER['QUERY_STRING'] ?? ''), $query);
        $needed = array_intersect_key($query, array_flip(self::NEEDED));
        ksort($needed);
        $key = implode('|', [
            strtolower((string) ($_SERVER['HTTP_HOST'] ?? '')),
            rawurldecode((string) parse_url((string) ($_SERVER['REQUEST_URI'] ?? ''), PHP_URL_PATH)),
            http_build_query($needed),
            wp_is_mobile() ? 'm' : 'd',
            (string) get_option('spm_widget_version', ''),
            defined('SPM_VERSION') ? SPM_VERSION : '',
        ]);
        return $root . '/v' . SPM_Data_Sync::current_version() . '/' . md5($key) . '.html';
    }

    private static function root() {
        $up = wp_upload_dir(null, false);
        if (!empty($up['error']) || empty($up['basedir'])) return null;
        return trailingslashit($up['basedir']) . self::DIR;
    }

    /** Folders of older data versions go as soon as a new version writes a page. */
    private function prune_old_versions() {
        $root = self::root();
        $current = 'v' . SPM_Data_Sync::current_version();
        foreach ((array) glob($root . '/v*', GLOB_ONLYDIR) as $dir) {
            if ($dir && basename($dir) !== $current) self::remove_dir($dir);
        }
    }

    /** Delete every saved page (settings, theme or menu changes; Clear cache). */
    public static function clear() {
        $root = self::root();
        $n = 0;
        if ($root && is_dir($root)) {
            foreach ((array) glob($root . '/v*', GLOB_ONLYDIR) as $dir) {
                if ($dir) $n += self::remove_dir($dir);
            }
        }
        return $n;
    }

    private static function remove_dir($dir) {
        $n = 0;
        foreach ((array) glob($dir . '/*') as $f) {
            if ($f && is_file($f) && @unlink($f)) $n++;
        }
        @rmdir($dir);
        return $n;
    }

    public function on_save_post($post_id, $post) {
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
        if ($post && in_array($post->post_status, ['publish', 'private', 'trash'], true)) self::clear();
    }

    /* ---------------- when it applies ---------------- */

    /** A visitor's GET/HEAD of a property page. */
    private function applies() {
        if (!SPM_Rewrite::is_property_detail()) return false;
        $method = strtoupper((string) ($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if ($method !== 'GET' && $method !== 'HEAD') return false;
        if (is_user_logged_in() || is_preview() || is_customize_preview()) return false;
        if (defined('DOING_AJAX') || defined('REST_REQUEST') || defined('WP_CLI')) return false;
        return true;
    }

    private function cache_enabled() {
        $on = !defined('SPM_PAGE_CACHE') || SPM_PAGE_CACHE;
        return (bool) apply_filters('spm_page_cache_enabled', $on);
    }

    /** Only tracking / needed parameters, and no cookie that personalises pages. */
    private function cacheable_request() {
        parse_str((string) ($_SERVER['QUERY_STRING'] ?? ''), $query);
        foreach (array_keys($query) as $k) {
            if (!$this->is_tracking($k) && !in_array($k, self::NEEDED, true)) return false;
        }
        foreach (array_keys($_COOKIE) as $c) {
            if (preg_match('/^(wordpress_logged_in_|wp-postpass_|comment_author_|woocommerce_items_in_cart|wp_woocommerce_session_)/', $c)) return false;
        }
        return true;
    }
}
