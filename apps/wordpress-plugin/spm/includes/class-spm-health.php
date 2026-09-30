<?php
if (!defined('ABSPATH')) exit;

/**
 * Site health for the SPM integration: one list of plain-language checks
 * with a one-click fix where the plugin can fix it itself. Shown on
 * SPM → Site Health, summarised on the settings screen and at the end of the
 * setup wizard, and added to WordPress's own Tools → Site Health.
 *
 * Each check: {id, label, status: good|recommended|critical, message, fix?}
 * where fix = {action: <ajax action>|null, url: <link>|null, label}.
 */
class SPM_Health {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_ajax_spm_health_fix', [$this, 'ajax_fix']);
        add_filter('site_status_tests', [$this, 'core_tests']);
    }

    /** Known caching / optimisation plugins: constant or class => name. */
    private function cache_plugins() {
        $found = [];
        $known = [
            'WP_ROCKET_VERSION'     => 'WP Rocket',
            'LSCWP_V'               => 'LiteSpeed Cache',
            'W3TC'                  => 'W3 Total Cache',
            'WPFC_WP_CONTENT_URL'   => 'WP Fastest Cache',
            'AUTOPTIMIZE_PLUGIN_VERSION' => 'Autoptimize',
            'FLYING_PRESS_VERSION'  => 'FlyingPress',
            'SiteGround_Optimizer\\VERSION' => 'SiteGround Optimizer',
        ];
        foreach ($known as $const => $name) {
            if (defined($const)) $found[] = $name;
        }
        if (function_exists('wp_cache_clear_cache') || defined('WPCACHEHOME')) $found[] = 'WP Super Cache';
        return array_values(array_unique($found));
    }

    /** @return array list of checks */
    public function checks($live = true) {
        $out = [];
        $opts = get_option(SPM_OPTION, SPM_Plugin::default_settings());
        $wizard = admin_url('admin.php?page=spm-setup');

        // 1. Connection
        if (empty($opts['api_key'])) {
            $out[] = $this->item('connection', 'Connection to SPM', 'critical',
                'No API key yet, so no properties can be shown.', null, $wizard, 'Run setup');
        } elseif ($live) {
            $t0 = microtime(true);
            $r = SPM_API_Client::test_connection();
            $ms = (int) round((microtime(true) - $t0) * 1000);
            if (is_wp_error($r)) {
                $out[] = $this->item('connection', 'Connection to SPM', 'critical', $r->get_error_message(), null, $wizard, 'Check API key');
            } else {
                $out[] = $this->item('connection', 'Connection to SPM', $ms > 3000 ? 'recommended' : 'good',
                    $ms > 3000 ? "Connected, but slow ({$ms} ms). Your host may be slow to reach the internet." : "Connected ({$ms} ms).");
            }
        }

        // 2. Widget script reachable from this server
        if ($live) {
            $loader = defined('SPM_LOADER_URL') ? SPM_LOADER_URL : SPM_LOADER_DEFAULT;
            $resp = wp_remote_head($loader, ['timeout' => 10]);
            $code = is_wp_error($resp) ? 0 : (int) wp_remote_retrieve_response_code($resp);
            $out[] = $code === 200
                ? $this->item('script', 'Property widget script', 'good', 'The widget script is available.')
                : $this->item('script', 'Property widget script', 'critical',
                    'The widget script could not be loaded (' . ($code ?: 'no response') . '). Visitors may see empty pages. Contact SPM support.');
        }

        // 3. Permalinks (property URLs need pretty permalinks)
        if (!get_option('permalink_structure')) {
            $out[] = $this->item('permalinks', 'Permalinks', 'critical',
                'Permalinks are set to "Plain", so property pages can\'t open. Choose "Post name".', null, admin_url('options-permalink.php'), 'Open Permalinks');
        } else {
            $out[] = $this->item('permalinks', 'Permalinks', 'good', 'Pretty permalinks are on.');
        }

        // 4. Pages
        $default_lang = SPM_I18n::instance()->default_lang_code();
        $missing = [];
        $legacy = [];
        foreach (['listings' => 'Properties', 'detail' => 'Property detail', 'wishlist' => 'Wishlist'] as $type => $label) {
            $id = (int) ($opts[$type . '_page_id'] ?? 0);
            $status = $id ? get_post_status($id) : false;
            if ($status !== 'publish') {
                $missing[] = $label . ($status ? " ({$status})" : '');
                continue;
            }
            $post = get_post($id);
            if ($type !== 'wishlist' && SPM_Page_Generator::content_state($type, $post->post_content) === 'legacy') $legacy[] = $label;
        }
        if ($missing) {
            $out[] = $this->item('pages', 'Property pages', 'critical',
                'Missing or not published: ' . implode(', ', $missing) . '.', 'spm_create_pages', null, 'Fix pages');
        } else {
            $out[] = $this->item('pages', 'Property pages', 'good', 'Properties, property detail and wishlist pages are published.');
        }
        if ($legacy) {
            $out[] = $this->item('design', 'Design from your dashboard', 'recommended',
                implode(', ', $legacy) . ' still use a fixed design. Switch them so the design you pick in the SPM dashboard (Website Design) applies automatically.',
                'spm_upgrade_pages', null, 'Switch pages');
        }

        // 5. Languages (Polylang / WPML: every language needs its pages)
        $info = SPM_I18n::instance()->detect();
        if (in_array($info['plugin'], ['polylang', 'wpml'], true)) {
            $gaps = [];
            foreach (SPM_I18n::instance()->all_language_codes() as $lang) {
                foreach (['listings', 'detail', 'wishlist'] as $type) {
                    $id = (int) ($opts[$type . '_page_id'] ?? 0);
                    if ($id && !SPM_Page_Generator::translation_of($info['plugin'], $id, $lang)) {
                        $gaps[$lang] = true;
                    }
                }
            }
            if ($gaps) {
                $out[] = $this->item('languages', 'Translated pages', 'recommended',
                    'No property pages yet in: ' . implode(', ', array_keys($gaps)) . '.', 'spm_create_pages', null, 'Create translations');
            } else {
                $out[] = $this->item('languages', 'Translated pages', 'good',
                    'Every language (' . implode(', ', array_merge([$default_lang], SPM_I18n::instance()->all_language_codes())) . ') has its property pages.');
            }
        }

        // 6. Property URL routing
        if (get_option('permalink_structure')) {
            $rules = (array) get_option('rewrite_rules', []);
            $slug = SPM_Plugin::slug('detail', $default_lang);
            $has = false;
            foreach (array_keys($rules) as $pattern) {
                if (strpos($pattern, '^' . preg_quote($slug, '#') . '/') === 0) { $has = true; break; }
            }
            $out[] = $has
                ? $this->item('routing', 'Property addresses', 'good', "Property pages open at /{$slug}/…")
                : $this->item('routing', 'Property addresses', 'critical', "Property pages at /{$slug}/… would show \"Page not found\".", 'spm_flush_rewrites', null, 'Fix addresses');
        }

        // 7. Data sync
        $status = SPM_Data_Sync::instance()->get_status();
        $missing_files = [];
        foreach ($status['files'] as $file => $f) {
            if (empty($f['exists'])) $missing_files[] = $file;
        }
        $age = $status['last_sync'] ? time() - $status['last_sync'] : null;
        if ($missing_files) {
            $out[] = $this->item('sync', 'Search lists (locations, types, features)', 'recommended',
                'Not downloaded yet for: ' . implode(', ', $missing_files) . '. Search still works, but pages load slower.', 'spm_sync_data', null, 'Sync now');
        } elseif ($age !== null && $age > 2 * DAY_IN_SECONDS) {
            $out[] = $this->item('sync', 'Search lists (locations, types, features)', 'recommended',
                'Last updated ' . human_time_diff($status['last_sync']) . ' ago. Automatic updates may not be running.', 'spm_sync_data', null, 'Sync now');
        } else {
            $out[] = $this->item('sync', 'Search lists (locations, types, features)', 'good',
                'Up to date' . ($status['last_sync'] ? ' (' . human_time_diff($status['last_sync']) . ' ago)' : '') . '.');
        }

        // 8. Storage for the cached lists
        $up = wp_upload_dir();
        $dir = trailingslashit($up['basedir']);
        if (!wp_is_writable($dir)) {
            $out[] = $this->item('storage', 'Uploads folder', 'critical', 'WordPress can\'t write to the uploads folder, so search lists can\'t be saved. Ask your host to fix folder permissions.');
        }

        // 9. Background tasks
        if (defined('DISABLE_WP_CRON') && DISABLE_WP_CRON) {
            $out[] = $this->item('cron', 'Automatic updates', 'recommended',
                'WordPress background tasks are switched off (DISABLE_WP_CRON). Make sure your host runs wp-cron.php, or search lists won\'t update by themselves.');
        } elseif (!wp_next_scheduled('spm_daily_sync')) {
            SPM_Plugin::ensure_sync_schedule();
            $out[] = $this->item('cron', 'Automatic updates', 'good', 'Hourly update was not scheduled; it is now.');
        } else {
            $out[] = $this->item('cron', 'Automatic updates', 'good', 'Search lists are checked for changes every hour.');
        }

        // 10. Caching plugins
        $cache = $this->cache_plugins();
        if ($cache) {
            $out[] = $this->item('cache', 'Caching plugins', 'good',
                implode(', ', $cache) . ' detected. SPM already told it not to delay or combine the property script. If a change doesn\'t show, clear that plugin\'s cache.');
        }

        // 11. Brand colour / design cached from the dashboard
        $site = SPM_Plugin::site_config();
        if (!empty($site['fetchedAt'])) {
            $color = $site['primaryColor'] ?? '';
            $out[] = $this->item('brand', 'Brand colour', 'good',
                $color ? "Using your dashboard colour {$color}." : 'Using the default colour. Set yours in the SPM dashboard → Website Design.');
        }

        // 12. Versions
        global $wp_version;
        if (version_compare(PHP_VERSION, '7.4', '<') || version_compare($wp_version, '6.0', '<')) {
            $out[] = $this->item('versions', 'PHP and WordPress', 'critical', 'SPM needs PHP 7.4+ and WordPress 6.0+. This site runs PHP ' . PHP_VERSION . ' and WordPress ' . $wp_version . '.');
        }

        return $out;
    }

    private function item($id, $label, $status, $message, $action = null, $url = null, $fix_label = null) {
        $row = ['id' => $id, 'label' => $label, 'status' => $status, 'message' => $message];
        if ($action || $url) $row['fix'] = ['action' => $action, 'url' => $url, 'label' => $fix_label ?: 'Fix'];
        return $row;
    }

    /** @return array{critical:int,recommended:int,good:int} */
    public static function summary($checks) {
        $s = ['critical' => 0, 'recommended' => 0, 'good' => 0];
        foreach ($checks as $c) $s[$c['status']]++;
        return $s;
    }

    public function ajax_fix() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $fix = sanitize_key($_POST['fix'] ?? '');
        switch ($fix) {
            case 'spm_create_pages':
                wp_send_json_success(['results' => SPM_Page_Generator::create_pages(['types' => ['listings', 'detail', 'wishlist'], 'publish' => true])]);
            case 'spm_upgrade_pages':
                wp_send_json_success(['results' => SPM_Page_Generator::create_pages(['types' => ['listings', 'detail', 'wishlist'], 'upgrade' => true])]);
            case 'spm_flush_rewrites':
                SPM_Rewrite::add_rules();
                flush_rewrite_rules();
                wp_send_json_success(['flushed' => true]);
            case 'spm_sync_data':
                wp_send_json_success(['results' => SPM_Data_Sync::instance()->sync_all(true)]);
        }
        wp_send_json_error('unknown fix');
    }

    /** Adds the important checks to Tools → Site Health. */
    public function core_tests($tests) {
        $tests['direct']['spm_integration'] = [
            'label' => 'Smart Property Manager',
            'test'  => function () {
                $checks = $this->checks(false);
                $bad = array_filter($checks, function ($c) { return $c['status'] !== 'good'; });
                $critical = array_filter($bad, function ($c) { return $c['status'] === 'critical'; });
                $items = '';
                foreach ($bad as $c) $items .= '<li><strong>' . esc_html($c['label']) . ':</strong> ' . esc_html($c['message']) . '</li>';
                return [
                    'label'       => $bad ? 'Smart Property Manager needs attention' : 'Smart Property Manager is set up correctly',
                    'status'      => $critical ? 'critical' : ($bad ? 'recommended' : 'good'),
                    'badge'       => ['label' => 'Properties', 'color' => 'blue'],
                    'description' => $bad ? '<ul>' . $items . '</ul>' : '<p>Pages, addresses and search lists are in order.</p>',
                    'actions'     => '<a href="' . esc_url(admin_url('admin.php?page=spm-health')) . '">Open SPM Site Health</a>',
                    'test'        => 'spm_integration',
                ];
            },
        ];
        return $tests;
    }
}
