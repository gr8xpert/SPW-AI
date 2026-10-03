<?php
if (!defined('ABSPATH')) exit;

/**
 * Each listings page's own first search, saved as a small file so the page
 * shows its cards without waiting for the API (since 2.9).
 *
 * The site-wide bundle (SPM_Data_Sync) only holds the unfiltered first page.
 * A page whose block says "for sale, cheapest first" opens with a different
 * search, so its visitors waited for the API. The plugin can't work that
 * search out itself without repeating the widget's filter rules, so the
 * widget tells it: after its first search on a page it POSTs the search key
 * (the API query string, sorted — searchKey in the widget) to
 *
 *   /wp-json/spm/v1/page-search   { page, lang, key }
 *
 * only when this page has no saved search or a different one. The plugin
 * checks the key, remembers it per page and language, and writes
 *
 *   uploads/spm-data/page-<lang>-<md5(key)>.json = { key, lang, syncVersion, results, facets }
 *
 * The page then gets the file's URL in RealtySoftConfig.pageResults (and a
 * preload). Files are rebuilt with the bundles whenever the API's syncVersion
 * moves. Nothing about visitors is sent or stored.
 */
class SPM_Page_Results {
    const OPTION      = 'spm_page_searches';
    const MAX_ENTRIES = 100;
    // New searches accepted per hour, site-wide: the endpoint is public.
    const MAX_NEW_PER_HOUR = 30;

    // Every parameter the widget's searchParams() can send, minus free-text
    // `query` and the map's `bounds` (never a page's opening search).
    const PARAMS = [
        'listingType', 'locationId', 'locationIds', 'propertyTypeId', 'propertyTypeIds',
        'minPrice', 'maxPrice', 'minBedrooms', 'maxBedrooms', 'minBathrooms', 'maxBathrooms',
        'minBuildSize', 'maxBuildSize', 'minPlotSize', 'maxPlotSize', 'minTerraceSize', 'maxTerraceSize',
        'reference', 'isFeatured', 'isOwnProperty', 'sortBy', 'page', 'limit', 'lat', 'lng', 'radius', 'features',
    ];
    // Left out of the dropdown counts, as the widget's getFacets does.
    const NOT_FOR_FACETS = ['page', 'limit', 'sortBy', 'bounds'];

    private static $instance = null;
    private $dir;
    private $url;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        $up = wp_upload_dir();
        $this->dir = trailingslashit($up['basedir']) . 'spm-data/';
        $this->url = trailingslashit($up['baseurl']) . 'spm-data/';
        add_action('rest_api_init', [$this, 'register_route']);
        add_action('spm_build_page_results', [$this, 'build_entry']);
    }

    public function register_route() {
        register_rest_route('spm/v1', '/page-search', [
            'methods'             => 'POST',
            'callback'            => [$this, 'handle_report'],
            // Public by design: it only ever stores a search key that passes
            // the checks below, for a published page, within the hourly cap.
            'permission_callback' => '__return_true',
        ]);
    }

    /**
     * The key as the widget writes it, or null if it isn't one: only known
     * parameters, plain values, a first page of at most 48, and written
     * exactly as the widget would (sorted, encoded the same way).
     */
    public static function canonical_key($key) {
        if (!is_string($key) || $key === '' || strlen($key) > 1000) return null;
        $params = [];
        foreach (explode('&', $key) as $pair) {
            $parts = explode('=', $pair, 2);
            if (count($parts) !== 2) return null;
            $name = urldecode($parts[0]);
            $value = urldecode($parts[1]);
            if (!in_array($name, self::PARAMS, true) || isset($params[$name])) return null;
            if (!preg_match('/^[A-Za-z0-9_.,\-]{1,64}$/', $value)) return null;
            $params[$name] = $value;
        }
        if (($params['page'] ?? '') !== '1') return null;
        $limit = (int) ($params['limit'] ?? 0);
        if ($limit < 1 || $limit > 48 || (string) $limit !== ($params['limit'] ?? '')) return null;
        ksort($params, SORT_STRING);
        $rebuilt = http_build_query($params, '', '&', PHP_QUERY_RFC1738);
        return $rebuilt === $key ? $key : null;
    }

    private function entries() {
        $e = get_option(self::OPTION, []);
        return is_array($e) ? $e : [];
    }

    private function file_for($key, $lang) {
        return 'page-' . sanitize_key($lang) . '-' . md5($key) . '.json';
    }

    public function handle_report(WP_REST_Request $request) {
        $page = (int) $request->get_param('page');
        $lang = strtolower(sanitize_key((string) $request->get_param('lang')));
        $key  = self::canonical_key($request->get_param('key'));

        $post = $page > 0 ? get_post($page) : null;
        if (!$post || $post->post_status !== 'publish' || !is_post_type_viewable($post->post_type)) {
            return new WP_REST_Response(['ok' => false, 'error' => 'page'], 400);
        }
        if (!in_array($lang, SPM_Data_Sync::instance()->languages(), true)) {
            return new WP_REST_Response(['ok' => false, 'error' => 'lang'], 400);
        }
        if ($key === null) return new WP_REST_Response(['ok' => false, 'error' => 'key'], 400);

        $id = $page . '|' . $lang;
        $entries = $this->entries();
        if (($entries[$id]['key'] ?? null) === $key) return new WP_REST_Response(['ok' => true, 'unchanged' => true], 200);

        $count = (int) get_transient('spm_page_search_new');
        if ($count >= self::MAX_NEW_PER_HOUR) return new WP_REST_Response(['ok' => false, 'error' => 'busy'], 429);
        set_transient('spm_page_search_new', $count + 1, HOUR_IN_SECONDS);

        $entries[$id] = ['key' => $key, 'file' => $this->file_for($key, $lang), 'v' => null, 'at' => time()];
        // Oldest first out when full.
        if (count($entries) > self::MAX_ENTRIES) {
            uasort($entries, function ($a, $b) { return ($a['at'] ?? 0) <=> ($b['at'] ?? 0); });
            $entries = array_slice($entries, -self::MAX_ENTRIES, null, true);
        }
        update_option(self::OPTION, $entries, false);
        $this->remove_unused_files($entries);
        // Built in the background (WP-Cron), never during a visitor's request.
        wp_schedule_single_event(time(), 'spm_build_page_results', [$id]);
        return new WP_REST_Response(['ok' => true, 'saved' => true], 202);
    }

    /** Write one page's file. Keeps the last good file if the API fails. */
    public function build_entry($id, $sync_version = null) {
        $entries = $this->entries();
        $e = $entries[$id] ?? null;
        if (!$e || !is_dir($this->dir) || !wp_is_writable($this->dir)) return false;
        list(, $lang) = array_pad(explode('|', $id, 2), 2, 'en');

        parse_str($e['key'], $params);
        // The search endpoints take the language from Accept-Language (a
        // ?lang= parameter is rejected), the same as a visitor's browser.
        $headers = ['Accept-Language' => $lang];
        $r = SPM_API_Client::get('api/v1/properties', $params, 15, $headers);
        if (is_wp_error($r) || !is_array($r) || !isset($r['data']) || !is_array($r['data']) || !isset($r['meta'])) return false;

        $facet_params = array_diff_key($params, array_flip(self::NOT_FOR_FACETS));
        $f = SPM_API_Client::get('api/v1/properties/facets', $facet_params, 15, $headers);
        $facets = (!is_wp_error($f) && is_array($f)) ? ($f['data'] ?? $f) : null;

        $file = [
            'key'         => $e['key'],
            'lang'        => $lang,
            'syncVersion' => $sync_version ?? SPM_Data_Sync::current_version(),
            'results'     => ['data' => $r['data'], 'meta' => $r['meta']],
        ];
        if (is_array($facets)) $file['facets'] = $facets;

        $path = $this->dir . $e['file'];
        $tmp = $path . '.tmp';
        $written = @file_put_contents($tmp, wp_json_encode($file, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        if ($written === false || !@rename($tmp, $path)) {
            @unlink($tmp);
            return false;
        }
        $entries = $this->entries();
        if (isset($entries[$id]) && $entries[$id]['key'] === $e['key']) {
            $entries[$id]['v'] = $file['syncVersion'];
            update_option(self::OPTION, $entries, false);
        }
        return true;
    }

    /** Called by the bundle sync: rebuild the files whose data moved on. */
    public function refresh_all($remote_v, $force = false) {
        // API unreachable: keep what's there rather than fail each rebuild.
        if ($remote_v === null && !$force) return;
        foreach ($this->entries() as $id => $e) {
            $stale = $force || ($e['v'] ?? null) !== $remote_v || !file_exists($this->dir . $e['file']);
            if ($stale) $this->build_entry($id, $remote_v);
        }
    }

    /** RealtySoftConfig.pageResults for the page being shown, or null. */
    public function for_page($page_id, $lang) {
        $e = $this->entries()[(int) $page_id . '|' . $lang] ?? null;
        if (!$e) return null;
        $path = $this->dir . $e['file'];
        if (!file_exists($path)) return null;
        return ['key' => $e['key'], 'url' => $this->url . $e['file'] . '?v=' . filemtime($path)];
    }

    private function remove_unused_files($entries) {
        $keep = array_flip(array_map(function ($e) { return $e['file']; }, $entries));
        foreach ((array) glob($this->dir . 'page-*.json') as $p) {
            if ($p && !isset($keep[basename($p)])) @unlink($p);
        }
    }

    /** Delete the files; the searches stay known and are rebuilt on the next sync. */
    public function clear() {
        $n = 0;
        foreach ((array) glob($this->dir . 'page-*.json') as $p) {
            if ($p && @unlink($p)) $n++;
        }
        $entries = $this->entries();
        foreach ($entries as $id => $e) $entries[$id]['v'] = null;
        update_option(self::OPTION, $entries, false);
        return $n;
    }

    /** Forget everything (plugin uninstall). */
    public function forget() {
        $this->clear();
        delete_option(self::OPTION);
    }
}
