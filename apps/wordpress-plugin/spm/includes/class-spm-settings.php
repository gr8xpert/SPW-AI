<?php
if (!defined('ABSPATH')) exit;

/**
 * Admin settings page + AJAX endpoints for the sync controls.
 * Settings shape is intentionally small: api_key, three slug maps, and the
 * auto-generated page IDs (which the UI doesn't expose but we preserve on save).
 */
class SPM_Settings {
    private static $instance = null;
    private $hooks = [];
    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'menu']);
        add_action('admin_init', [$this, 'register']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
        add_action('wp_ajax_spm_test_connection', [$this, 'ajax_test']);
        add_action('wp_ajax_spm_sync_data', [$this, 'ajax_sync']);
        add_action('wp_ajax_spm_clear_cache', [$this, 'ajax_clear']);
        add_action('wp_ajax_spm_create_pages', [$this, 'ajax_create_pages']);
    }

    public function menu() {
        $this->hooks['settings'] = add_menu_page(
            'Smart Property Manager',
            'SPM',
            'manage_options',
            'spm-settings',
            [$this, 'render_page'],
            'dashicons-admin-multisite',
            58
        );
        // Rename the first auto-submenu so users see "Settings" not "SPM"
        // when the Filter IDs item appears next to it.
        add_submenu_page(
            'spm-settings',
            'Settings',
            'Settings',
            'manage_options',
            'spm-settings',
            [$this, 'render_page']
        );
        $this->hooks['pages'] = add_submenu_page(
            'spm-settings',
            'Pages',
            'Pages',
            'manage_options',
            'spm-pages',
            [$this, 'render_pages_page']
        );
        $this->hooks['blocks'] = add_submenu_page(
            'spm-settings',
            'Blocks',
            'Blocks',
            'manage_options',
            'spm-blocks',
            [$this, 'render_blocks_page']
        );
        // The id reference belongs with the blocks it is used in, so it is
        // shown at the foot of that page rather than as a menu item of its
        // own. Registered without a parent so old bookmarks still open.
        $this->hooks['filter_ids'] = add_submenu_page(
            null,
            'Filter IDs Reference',
            'Filter IDs',
            'manage_options',
            'spm-filter-ids',
            [$this, 'render_filter_ids_page']
        );
    }

    public function register() {
        register_setting('spm_settings_group', SPM_OPTION, [
            'sanitize_callback' => [$this, 'sanitize'],
        ]);
    }

    /**
     * Partial-update sanitizer. Each admin form only POSTs the keys it owns
     * (api_key + slug_rows on Settings; page_titles on Pages). Any key absent
     * from $input is preserved from the existing option so one form never
     * wipes another's data.
     */
    public function sanitize($input) {
        $existing = get_option(SPM_OPTION, []);
        if (!is_array($existing)) $existing = [];
        $defaults = SPM_Plugin::default_settings();
        $clean    = array_merge($defaults, $existing);

        if (array_key_exists('api_key', (array)$input)) {
            $clean['api_key'] = sanitize_text_field($input['api_key']);
        }

        if (array_key_exists('page_titles', (array)$input)) {
            $titles_in = (array)$input['page_titles'];
            $clean['page_titles'] = [];
            foreach (['listings', 'detail', 'wishlist', 'map'] as $t) {
                $val = sanitize_text_field($titles_in[$t] ?? '');
                if ($val === '') $val = $defaults['page_titles'][$t] ?? '';
                if ($val !== '') $clean['page_titles'][$t] = $val;
            }
        }

        if (array_key_exists('slug_rows', (array)$input)) {
            $rows = $this->sanitize_slug_rows($input['slug_rows']);
            foreach (['listings', 'detail', 'wishlist'] as $type) {
                $map = [];
                foreach ($rows as $r) {
                    if (!empty($r[$type])) $map[$r['lang']] = $r[$type];
                }
                if (empty($map['en'])) {
                    $map = ['en' => $defaults['slugs_' . $type]['en']] + $map;
                }
                $clean['slugs_' . $type] = $map;
            }
            // Detail-page rewrites are slug-keyed, so a changed detail slug
            // invalidates the registered rules. Flushing here would rebuild
            // them from the OLD option (this runs before the save), leaving
            // the new slug 404 until Permalinks was re-saved by hand — so ask
            // for a flush on the next request instead, after the save.
            if (($existing['slugs_detail'] ?? []) != $clean['slugs_detail']) {
                update_option('spm_flush_rewrites', 1);
                SPM_Sitemap::flush();
            }
        }

        // Ready-made per-type maps (lang => slug), as saved by the setup wizard.
        foreach (['listings', 'detail', 'wishlist'] as $type) {
            $k = 'slugs_' . $type;
            if (!array_key_exists($k, (array)$input) || array_key_exists('slug_rows', (array)$input)) continue;
            $map = [];
            foreach ((array)$input[$k] as $lang => $slug) {
                $lang = strtolower(sanitize_key($lang));
                $slug = sanitize_title($slug);
                if ($lang && $slug) $map[$lang] = $slug;
            }
            if (empty($map['en'])) $map = ['en' => $defaults[$k]['en']] + $map;
            if ($type === 'detail' && ($existing['slugs_detail'] ?? []) != $map) {
                update_option('spm_flush_rewrites', 1);
            }
            $clean[$k] = $map;
        }

        // Search tab pages: tab_slugs[lang][type] = slug → slugs_<type> maps.
        // Empty = that tab has no page of its own (no English fallback added).
        if (array_key_exists('tab_slugs', (array)$input)) {
            foreach (SPM_Plugin::TAB_TYPES as $type) {
                $map = [];
                foreach ((array)$input['tab_slugs'] as $lang => $slugs) {
                    $lang = strtolower(sanitize_key($lang));
                    $slug = sanitize_title(((array)$slugs)[$type] ?? '');
                    if ($lang && $slug) $map[$lang] = $slug;
                }
                $clean['slugs_' . $type] = $map;
            }
        }

        if (array_key_exists('page_titles_i18n', (array)$input)) {
            $clean['page_titles_i18n'] = [];
            foreach ((array)$input['page_titles_i18n'] as $lang => $titles) {
                $lang = strtolower(sanitize_key($lang));
                if (!$lang || !is_array($titles)) continue;
                foreach (['listings', 'detail', 'wishlist', 'map'] as $t) {
                    $val = sanitize_text_field($titles[$t] ?? '');
                    if ($val !== '') $clean['page_titles_i18n'][$lang][$t] = $val;
                }
            }
        }

        // Auto-generated page IDs are owned by the generator, not the UI:
        // settings forms never post them, so they're kept — unless the
        // generator itself is saving new ones.
        foreach (['detail_page_id', 'listings_page_id', 'wishlist_page_id', 'map_page_id'] as $k) {
            $clean[$k] = array_key_exists($k, (array)$input) ? (int)$input[$k] : (int)($existing[$k] ?? 0);
        }

        return $clean;
    }

    /**
     * Normalize the row-oriented form submission:
     *   slug_rows[lang][i]     = 'en'
     *   slug_rows[listings][i] = 'properties'
     *   slug_rows[detail][i]   = 'property'
     *   slug_rows[wishlist][i] = 'wishlist'
     * to a list of associative rows. Drops rows with no lang code and
     * deduplicates lang codes (first occurrence wins).
     */
    private function sanitize_slug_rows($raw) {
        if (!is_array($raw) || empty($raw['lang']) || !is_array($raw['lang'])) {
            return [];
        }
        $out = [];
        $seen = [];
        $count = count($raw['lang']);
        for ($i = 0; $i < $count; $i++) {
            $lang = strtolower(sanitize_key($raw['lang'][$i] ?? ''));
            if (!$lang || isset($seen[$lang])) continue;
            $seen[$lang] = true;
            $out[] = [
                'lang'     => $lang,
                'listings' => sanitize_title($raw['listings'][$i] ?? ''),
                'detail'   => sanitize_title($raw['detail'][$i]   ?? ''),
                'wishlist' => sanitize_title($raw['wishlist'][$i] ?? ''),
            ];
        }
        return $out;
    }

    public function enqueue($hook) {
        $is_settings   = ($hook === ($this->hooks['settings']   ?? '') || $hook === 'toplevel_page_spm-settings');
        $is_pages      = ($hook === ($this->hooks['pages']      ?? '') || strpos($hook, 'spm-pages') !== false);
        $is_filter_ids = ($hook === ($this->hooks['filter_ids'] ?? '') || strpos($hook, 'spm-filter-ids') !== false);
        $is_blocks     = ($hook === ($this->hooks['blocks'] ?? '') || strpos($hook, 'spm-blocks') !== false);

        if (!$is_settings && !$is_pages && !$is_filter_ids && !$is_blocks) return;

        wp_enqueue_style('spm-admin', SPM_URL . 'admin/assets/admin.css', [], SPM_VERSION);
        wp_enqueue_script('spm-admin', SPM_URL . 'admin/assets/admin.js', ['jquery'], SPM_VERSION, true);
        wp_localize_script('spm-admin', 'SPM_ADMIN', [
            'nonce'   => wp_create_nonce('spm_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ]);

        if ($is_filter_ids) {
            wp_enqueue_script('spm-filter-ids', SPM_URL . 'admin/assets/filter-ids.js', ['jquery'], SPM_VERSION, true);
        }
    }

    public function render_page() {
        if (!current_user_can('manage_options')) return;
        include SPM_DIR . 'admin/views/settings-page.php';
    }

    public function render_pages_page() {
        if (!current_user_can('manage_options')) return;
        include SPM_DIR . 'admin/views/pages-page.php';
    }

    public function render_blocks_page() {
        if (!current_user_can('manage_options')) return;
        include SPM_DIR . 'admin/views/blocks-page.php';
    }

    public function render_filter_ids_page() {
        if (!current_user_can('manage_options')) return;
        include SPM_DIR . 'admin/views/filter-ids-page.php';
    }

    // ─── AJAX ─────────────────────────────────────────────────────

    public function ajax_test() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $r = SPM_API_Client::test_connection();
        if (is_wp_error($r)) wp_send_json_error($r->get_error_message());
        wp_send_json_success('Connected. API key is valid.');
    }

    public function ajax_sync() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $results = SPM_Data_Sync::instance()->sync_all(true);
        wp_send_json_success([
            'results' => $results,
            'status'  => SPM_Data_Sync::instance()->get_status(),
        ]);
    }

    public function ajax_clear() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $n = SPM_Data_Sync::instance()->clear_cache();
        wp_send_json_success(['cleared' => $n, 'status' => SPM_Data_Sync::instance()->get_status()]);
    }

    public function ajax_create_pages() {
        check_ajax_referer('spm_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $types = ['listings', 'detail', 'wishlist'];
        if ((int) SPM_Plugin::get('map_page_id')) $types[] = 'map';
        $results = SPM_Page_Generator::create_pages(['types' => $types]);
        wp_send_json_success(['results' => $results]);
    }
}
