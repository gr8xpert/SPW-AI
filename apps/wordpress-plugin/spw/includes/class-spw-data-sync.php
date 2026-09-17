<?php
if (!defined('ABSPATH')) exit;

/**
 * Caches the static lookup data every widget page needs — locations, property
 * types, features and UI labels — in /wp-content/uploads/spw-data/, one file
 * per site language:
 *
 *   bundle-en.json = { lang, syncVersion, syncedAt, locations, types, features, labels }
 *
 * The widget gets the URL for the page's language (SPW_Plugin::inject_config →
 * RealtySoftConfig.dataBundleUrl) and loads all four lists in ONE cacheable
 * request instead of four API round-trips per page view. Names are translated
 * server-side, so every language has its own file.
 *
 * Freshness: the API's single tenant-wide `syncVersion` (bumped by feed
 * imports, dashboard edits and cache clears) is compared with the version each
 * file was built from; only stale languages are re-downloaded. Checks run
 * hourly via WP-Cron, and a page view schedules a background check when the
 * last one is over 10 minutes old — never blocking the page itself.
 */
class SPW_Data_Sync {
    const CHECK_INTERVAL = 10 * MINUTE_IN_SECONDS;

    private static $instance = null;
    private $cache_dir;
    private $cache_url;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        $up = wp_upload_dir();
        $this->cache_dir = trailingslashit($up['basedir']) . 'spw-data/';
        $this->cache_url = trailingslashit($up['baseurl']) . 'spw-data/';
        add_action('spw_daily_sync', [$this, 'sync_all']);
    }

    /** Bundle key → public API endpoint. */
    private function endpoints() {
        return [
            'locations' => 'api/v1/locations',
            'types'     => 'api/v1/property-types',
            'features'  => 'api/v1/features',
            'labels'    => 'api/v1/labels',
        ];
    }

    /** Every language the site serves: default first, then the others. */
    public function languages() {
        if (!class_exists('SPW_I18n')) return ['en'];
        $i18n = SPW_I18n::instance();
        $langs = array_merge([$i18n->default_lang_code() ?: 'en'], $i18n->all_language_codes());
        $langs = array_map(function ($l) { return strtolower(sanitize_key($l)); }, $langs);
        return array_values(array_unique(array_filter($langs)));
    }

    private function bundle_file($lang) {
        return 'bundle-' . strtolower(sanitize_key($lang)) . '.json';
    }

    private function ensure_dir() {
        if (!file_exists($this->cache_dir)) {
            wp_mkdir_p($this->cache_dir);
            @file_put_contents($this->cache_dir . 'index.php', "<?php // Silence is golden\n");
        }
        // Bundle URLs carry ?v=<mtime>, so browsers may cache them for a year:
        // a rebuilt bundle gets a new URL. Guarded so Apache without
        // mod_headers ignores it (nginx ignores .htaccess entirely).
        $htaccess = $this->cache_dir . '.htaccess';
        if (is_dir($this->cache_dir) && !file_exists($htaccess)) {
            @file_put_contents($htaccess, implode("\n", [
                '<IfModule mod_headers.c>',
                '  <FilesMatch "^bundle-.*\.json$">',
                '    Header set Cache-Control "public, max-age=31536000, immutable"',
                '  </FilesMatch>',
                '</IfModule>',
                '',
            ]));
        }
        return is_dir($this->cache_dir) && wp_is_writable($this->cache_dir);
    }

    /**
     * Refresh the language bundles. Without $force, a bundle is only rebuilt
     * when the API's syncVersion differs from the one it was built from.
     */
    public function sync_all($force = false) {
        update_option('spw_last_check', time(), false);

        if (!$this->ensure_dir()) {
            return ['error' => 'Cache directory not writable: ' . $this->cache_dir];
        }

        $remote_v = $this->fetch_sync_version();
        $versions_local = get_option('spw_data_versions', []);
        if (!is_array($versions_local)) $versions_local = [];
        $results = [];

        foreach ($this->languages() as $lang) {
            $file = $this->bundle_file($lang);
            $local_v = $versions_local[$file] ?? null;

            if (!$force && $remote_v !== null && $local_v === $remote_v && file_exists($this->cache_dir . $file)) {
                $results[$file] = ['success' => true, 'skipped' => true, 'reason' => 'cache fresh'];
                continue;
            }

            $bundle = [
                'lang'        => $lang,
                'syncVersion' => $remote_v ?? 0,
                'syncedAt'    => time(),
            ];
            $failure = null;
            foreach ($this->endpoints() as $key => $endpoint) {
                $r = SPW_API_Client::get($endpoint, ['lang' => $lang]);
                if (is_wp_error($r)) {
                    $data = $r->get_error_data();
                    $failure = [
                        'success' => false,
                        'error'   => $r->get_error_message(),
                        'status'  => is_array($data) ? ($data['status'] ?? 0) : 0,
                        'details' => $key . ': ' . (is_array($data) ? (string)($data['raw'] ?? '') : ''),
                    ];
                    break;
                }
                $bundle[$key] = $r['data'] ?? $r;
            }

            // Keep the last good bundle rather than replacing it with a partial one.
            if ($failure) {
                $results[$file] = $failure;
                continue;
            }

            // Write to a temp file and rename, so a page never reads a half-written bundle.
            $tmp = $this->cache_dir . $file . '.tmp';
            $written = @file_put_contents(
                $tmp,
                wp_json_encode($bundle, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );
            if ($written === false || !@rename($tmp, $this->cache_dir . $file)) {
                @unlink($tmp);
                $results[$file] = ['success' => false, 'error' => 'write failed'];
                continue;
            }

            $results[$file] = ['success' => true, 'count' => $this->bundle_count($bundle)];
            if ($remote_v !== null) $versions_local[$file] = $remote_v;
        }

        update_option('spw_data_versions', $versions_local, false);
        update_option('spw_last_sync', time(), false);
        update_option('spw_last_sync_results', $results, false);
        return $results;
    }

    /**
     * Called on front-end page views. Schedules a background check (WP-Cron
     * runs it asynchronously) when the last one is older than CHECK_INTERVAL,
     * so a feed import or dashboard edit reaches the bundles within minutes.
     */
    public function maybe_schedule_refresh() {
        $last = (int) get_option('spw_last_check', 0);
        if (time() - $last < self::CHECK_INTERVAL) return;
        if (wp_next_scheduled('spw_daily_sync', [false])) return;
        // Stamp first so concurrent page views don't all schedule one.
        update_option('spw_last_check', time(), false);
        wp_schedule_single_event(time(), 'spw_daily_sync', [false]);
    }

    public function get_last_results() {
        return get_option('spw_last_sync_results', []);
    }

    private function fetch_sync_version() {
        $r = SPW_API_Client::get('api/v1/sync-meta');
        if (is_wp_error($r)) return null;
        $data = $r['data'] ?? $r;
        return (is_array($data) && isset($data['syncVersion'])) ? (int) $data['syncVersion'] : null;
    }

    private function bundle_count($bundle) {
        $n = 0;
        foreach (['locations', 'types', 'features'] as $k) {
            if (isset($bundle[$k]) && is_array($bundle[$k])) $n += count($bundle[$k]);
        }
        return $n;
    }

    private function read_bundle($lang) {
        $p = $this->cache_dir . $this->bundle_file($lang);
        if (!file_exists($p)) return null;
        $j = json_decode(file_get_contents($p), true);
        return is_array($j) ? $j : null;
    }

    /** Bundle URL for a language (cache-busted by mtime), or null if not synced yet. */
    public function bundle_url($lang) {
        $file = $this->bundle_file($lang ?: 'en');
        $path = $this->cache_dir . $file;
        if (!file_exists($path)) return null;
        return $this->cache_url . $file . '?v=' . filemtime($path);
    }

    /** One cached list (locations|types|features|labels) in the default language, for admin screens. */
    public function read_list($key) {
        $langs = $this->languages();
        $bundle = $this->read_bundle($langs[0] ?? 'en');
        return ($bundle && isset($bundle[$key]) && is_array($bundle[$key])) ? $bundle[$key] : null;
    }

    public function get_status() {
        $status = [
            'last_sync'           => (int) get_option('spw_last_sync', 0),
            'last_sync_formatted' => get_option('spw_last_sync') ? date_i18n('Y-m-d H:i:s', (int) get_option('spw_last_sync')) : 'Never',
            'files' => [],
        ];
        foreach ($this->languages() as $lang) {
            $file = $this->bundle_file($lang);
            $p = $this->cache_dir . $file;
            $bundle = $this->read_bundle($lang);
            if ($bundle) {
                $status['files'][$file] = [
                    'exists'   => true,
                    'count'    => $this->bundle_count($bundle),
                    'size'     => filesize($p),
                    'modified' => filemtime($p),
                ];
            } else {
                $status['files'][$file] = ['exists' => false];
            }
        }
        return $status;
    }

    public function clear_cache() {
        $n = 0;
        // Current per-language bundles plus the per-list files older versions wrote.
        $paths = array_merge(
            (array) glob($this->cache_dir . 'bundle-*.json'),
            array_map(function ($f) { return $this->cache_dir . $f; },
                ['locations.json', 'property-types.json', 'features.json', 'labels.json'])
        );
        foreach ($paths as $p) {
            if ($p && file_exists($p) && @unlink($p)) $n++;
        }
        delete_option('spw_last_sync');
        delete_option('spw_data_versions');
        delete_option('spw_last_check');
        return $n;
    }
}
