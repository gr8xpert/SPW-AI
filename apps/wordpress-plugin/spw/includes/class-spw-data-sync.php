<?php
if (!defined('ABSPATH')) exit;

/**
 * Caches static lookup data (locations, property types, features, labels) as
 * local JSON files in /wp-content/uploads/spw-data/. The widget reads these
 * via {locationsUrl, propertyTypesUrl, featuresUrl, labelsUrl} config so
 * dropdowns render instantly without an API roundtrip.
 *
 * Polls /api/v1/sync-meta first — only refetches lists whose version changed.
 * Daily cron (spw_daily_sync) + manual button in the admin.
 */
class SPW_Data_Sync {
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

    /** Map of cache filename → API endpoint. */
    private function endpoints() {
        return [
            'locations.json'      => 'api/v1/locations',
            'property-types.json' => 'api/v1/property-types',
            'features.json'       => 'api/v1/features',
            'labels.json'         => 'api/v1/labels',
        ];
    }

    private function ensure_dir() {
        if (!file_exists($this->cache_dir)) {
            wp_mkdir_p($this->cache_dir);
            @file_put_contents($this->cache_dir . 'index.php', "<?php // Silence is golden\n");
        }
        return is_dir($this->cache_dir) && wp_is_writable($this->cache_dir);
    }

    /**
     * Sync everything. If $force is false, checks /api/v1/sync-meta and only
     * refetches lists whose version changed since last sync.
     */
    public function sync_all($force = false) {
        if (!$this->ensure_dir()) {
            return ['error' => 'Cache directory not writable: ' . $this->cache_dir];
        }

        $versions_remote = $this->fetch_versions();
        $versions_local  = get_option('spw_data_versions', []);
        $results = [];

        foreach ($this->endpoints() as $file => $endpoint) {
            $key = $this->version_key($file);
            $remote_v = $versions_remote[$key] ?? null;
            $local_v  = $versions_local[$file] ?? null;

            if (!$force && $remote_v !== null && $remote_v === $local_v && file_exists($this->cache_dir . $file)) {
                $results[$file] = ['success' => true, 'skipped' => true, 'reason' => 'cache fresh'];
                continue;
            }

            // API resolves i18n name/title server-side via the requested lang.
            // Cron has no Accept-Language, so we MUST pass ?lang= explicitly,
            // otherwise the cache silently bakes whichever locale the server
            // defaults to. We use the translation plugin's default lang when
            // available; falls back to 'en'.
            $lang = (class_exists('SPW_I18n') ? SPW_I18n::instance()->default_lang_code() : 'en') ?: 'en';
            $r = SPW_API_Client::get($endpoint, ['limit' => 1000, 'lang' => $lang]);
            if (is_wp_error($r)) {
                $data = $r->get_error_data();
                $results[$file] = [
                    'success' => false,
                    'error'   => $r->get_error_message(),
                    'status'  => is_array($data) ? ($data['status'] ?? 0) : 0,
                    'details' => is_array($data) ? (string)($data['raw'] ?? '') : '',
                ];
                continue;
            }

            $payload = ['data' => $r['data'] ?? $r, 'lang' => $lang, 'syncedAt' => time()];
            $written = @file_put_contents(
                $this->cache_dir . $file,
                wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)
            );

            if ($written === false) {
                $results[$file] = ['success' => false, 'error' => 'write failed'];
                continue;
            }

            $count = is_array($payload['data']) ? count($payload['data']) : 0;
            $results[$file] = ['success' => true, 'count' => $count];
            if ($remote_v !== null) $versions_local[$file] = $remote_v;
        }

        update_option('spw_data_versions', $versions_local);
        update_option('spw_last_sync', time());
        update_option('spw_last_sync_results', $results);
        return $results;
    }

    public function get_last_results() {
        return get_option('spw_last_sync_results', []);
    }

    private function fetch_versions() {
        $r = SPW_API_Client::get('api/v1/sync-meta');
        if (is_wp_error($r)) return [];
        $data = $r['data'] ?? $r;
        return is_array($data) ? $data : [];
    }

    /** Map cache filename → sync-meta version key. Adjust if API names differ. */
    private function version_key($file) {
        return [
            'locations.json'      => 'locationsVersion',
            'property-types.json' => 'propertyTypesVersion',
            'features.json'       => 'featuresVersion',
            'labels.json'         => 'labelsVersion',
        ][$file] ?? null;
    }

    public function get_local_data_urls() {
        $urls = [];
        $map = [
            'locations.json'      => 'locationsUrl',
            'property-types.json' => 'propertyTypesUrl',
            'features.json'       => 'featuresUrl',
            'labels.json'         => 'labelsUrl',
        ];
        foreach ($map as $file => $key) {
            $path = $this->cache_dir . $file;
            if (file_exists($path)) {
                $urls[$key] = $this->cache_url . $file . '?v=' . filemtime($path);
            }
        }
        return $urls;
    }

    public function get_status() {
        $files = array_keys($this->endpoints());
        $status = [
            'last_sync'           => (int) get_option('spw_last_sync', 0),
            'last_sync_formatted' => get_option('spw_last_sync') ? date_i18n('Y-m-d H:i:s', (int) get_option('spw_last_sync')) : 'Never',
            'files' => [],
        ];
        foreach ($files as $f) {
            $p = $this->cache_dir . $f;
            if (file_exists($p)) {
                $data = json_decode(file_get_contents($p), true);
                $count = isset($data['data']) && is_array($data['data']) ? count($data['data']) : 0;
                $status['files'][$f] = [
                    'exists'   => true,
                    'count'    => $count,
                    'size'     => filesize($p),
                    'modified' => filemtime($p),
                ];
            } else {
                $status['files'][$f] = ['exists' => false];
            }
        }
        return $status;
    }

    public function clear_cache() {
        $n = 0;
        foreach (array_keys($this->endpoints()) as $f) {
            $p = $this->cache_dir . $f;
            if (file_exists($p) && @unlink($p)) $n++;
        }
        delete_option('spw_last_sync');
        delete_option('spw_data_versions');
        return $n;
    }
}
