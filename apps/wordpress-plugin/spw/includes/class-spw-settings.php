<?php
if (!defined('ABSPATH')) exit;

/**
 * Admin settings page + AJAX endpoints for the sync controls.
 * Settings shape is intentionally small: api_key, three slug maps, and the
 * auto-generated page IDs (which the UI doesn't expose but we preserve on save).
 */
class SPW_Settings {
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
        add_action('wp_ajax_spw_test_connection', [$this, 'ajax_test']);
        add_action('wp_ajax_spw_sync_data', [$this, 'ajax_sync']);
        add_action('wp_ajax_spw_clear_cache', [$this, 'ajax_clear']);
        add_action('wp_ajax_spw_create_pages', [$this, 'ajax_create_pages']);
    }

    public function menu() {
        $this->hooks['settings'] = add_menu_page(
            'Smart Property Manager',
            'SPM',
            'manage_options',
            'spw-settings',
            [$this, 'render_page'],
            'dashicons-admin-multisite',
            58
        );
        // Rename the first auto-submenu so users see "Settings" not "SPW"
        // when the Filter IDs item appears next to it.
        add_submenu_page(
            'spw-settings',
            'Settings',
            'Settings',
            'manage_options',
            'spw-settings',
            [$this, 'render_page']
        );
        $this->hooks['pages'] = add_submenu_page(
            'spw-settings',
            'Pages',
            'Pages',
            'manage_options',
            'spw-pages',
            [$this, 'render_pages_page']
        );
        $this->hooks['filter_ids'] = add_submenu_page(
            'spw-settings',
            'Filter IDs Reference',
            'Filter IDs',
            'manage_options',
            'spw-filter-ids',
            [$this, 'render_filter_ids_page']
        );
    }

    public function register() {
        register_setting('spw_settings_group', SPW_OPTION, [
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
        $existing = get_option(SPW_OPTION, []);
        if (!is_array($existing)) $existing = [];
        $defaults = SPW_Plugin::default_settings();
        $clean    = array_merge($defaults, $existing);

        if (array_key_exists('api_key', (array)$input)) {
            $clean['api_key'] = sanitize_text_field($input['api_key']);
        }

        if (array_key_exists('page_titles', (array)$input)) {
            $titles_in = (array)$input['page_titles'];
            $clean['page_titles'] = [];
            foreach (['listings', 'detail', 'wishlist'] as $t) {
                $val = sanitize_text_field($titles_in[$t] ?? '');
                $clean['page_titles'][$t] = $val !== '' ? $val : $defaults['page_titles'][$t];
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
            // Detail-page rewrites are slug-keyed, so any change to the
            // detail slug map invalidates the registered rules.
            if (($existing['slugs_detail'] ?? []) != $clean['slugs_detail']) {
                SPW_Rewrite::add_rules();
                flush_rewrite_rules();
                SPW_Sitemap::flush();
            }
        }

        // Auto-generated page IDs are owned by the generator, not the UI.
        $clean['detail_page_id']   = (int)($existing['detail_page_id']   ?? 0);
        $clean['listings_page_id'] = (int)($existing['listings_page_id'] ?? 0);
        $clean['wishlist_page_id'] = (int)($existing['wishlist_page_id'] ?? 0);

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
        $is_settings   = ($hook === ($this->hooks['settings']   ?? '') || $hook === 'toplevel_page_spw-settings');
        $is_pages      = ($hook === ($this->hooks['pages']      ?? '') || strpos($hook, 'spw-pages') !== false);
        $is_filter_ids = ($hook === ($this->hooks['filter_ids'] ?? '') || strpos($hook, 'spw-filter-ids') !== false);

        if (!$is_settings && !$is_pages && !$is_filter_ids) return;

        wp_enqueue_style('spw-admin', SPW_URL . 'admin/assets/admin.css', [], SPW_VERSION);
        wp_enqueue_script('spw-admin', SPW_URL . 'admin/assets/admin.js', ['jquery'], SPW_VERSION, true);
        wp_localize_script('spw-admin', 'SPW_ADMIN', [
            'nonce'   => wp_create_nonce('spw_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ]);

        if ($is_filter_ids) {
            wp_enqueue_script('spw-filter-ids', SPW_URL . 'admin/assets/filter-ids.js', ['jquery'], SPW_VERSION, true);
        }
    }

    public function render_page() {
        if (!current_user_can('manage_options')) return;
        include SPW_DIR . 'admin/views/settings-page.php';
    }

    public function render_pages_page() {
        if (!current_user_can('manage_options')) return;
        include SPW_DIR . 'admin/views/pages-page.php';
    }

    public function render_filter_ids_page() {
        if (!current_user_can('manage_options')) return;
        include SPW_DIR . 'admin/views/filter-ids-page.php';
    }

    // ─── AJAX ─────────────────────────────────────────────────────

    public function ajax_test() {
        check_ajax_referer('spw_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $r = SPW_API_Client::test_connection();
        if (is_wp_error($r)) wp_send_json_error($r->get_error_message());
        wp_send_json_success('Connected. API key is valid.');
    }

    public function ajax_sync() {
        check_ajax_referer('spw_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $results = SPW_Data_Sync::instance()->sync_all(true);
        wp_send_json_success([
            'results' => $results,
            'status'  => SPW_Data_Sync::instance()->get_status(),
        ]);
    }

    public function ajax_clear() {
        check_ajax_referer('spw_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $n = SPW_Data_Sync::instance()->clear_cache();
        wp_send_json_success(['cleared' => $n, 'status' => SPW_Data_Sync::instance()->get_status()]);
    }

    public function ajax_create_pages() {
        check_ajax_referer('spw_admin', 'nonce');
        if (!current_user_can('manage_options')) wp_send_json_error('forbidden');
        $results = SPW_Page_Generator::create_pages();
        wp_send_json_success(['results' => $results]);
    }
}
