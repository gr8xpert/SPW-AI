<?php
if (!defined('ABSPATH')) exit;

/**
 * Three-step setup for non-technical admins:
 *   1. Connect  — paste the API key, checked on the spot
 *   2. Pages    — one row per site language with suggested titles and web
 *                 addresses (translated for common languages), then the pages
 *                 are created, as linked translations on Polylang / WPML sites
 *   3. Finish   — search lists downloaded, site health shown, next steps
 *
 * Opens by itself after activation while no API key is set, and can be re-run
 * any time from SPM → Setup (existing pages are reused, never duplicated).
 */
class SPM_Setup_Wizard {
    const SLUG = 'spm-setup';
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'menu'], 20);
        add_action('admin_init', [$this, 'maybe_redirect_after_activation']);
        add_action('admin_notices', [$this, 'setup_notice']);
        add_action('admin_post_spm_wizard_connect', [$this, 'handle_connect']);
        add_action('admin_post_spm_wizard_pages', [$this, 'handle_pages']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue']);
    }

    public function menu() {
        // Setup has no menu item of its own: it is the same ground as
        // Settings, and two entries for one job is what made the menu long.
        // It stays a real page — activation opens it, and Settings has a
        // button to run it again.
        add_submenu_page(null, 'Setup', 'Setup', 'manage_options', self::SLUG, [$this, 'render']);
        add_submenu_page('spm-settings', 'Site Health', 'Site Health', 'manage_options', 'spm-health', [$this, 'render_health']);
    }

    public function enqueue($hook) {
        if (strpos($hook, self::SLUG) === false && strpos($hook, 'spm-health') === false) return;
        wp_enqueue_style('spm-admin', SPM_URL . 'admin/assets/admin.css', [], SPM_VERSION);
        wp_enqueue_script('spm-admin', SPM_URL . 'admin/assets/admin.js', ['jquery'], SPM_VERSION, true);
        wp_localize_script('spm-admin', 'SPM_ADMIN', [
            'nonce'   => wp_create_nonce('spm_admin'),
            'ajaxUrl' => admin_url('admin-ajax.php'),
        ]);
    }

    public static function url($step = null, $extra = []) {
        $args = array_merge(['page' => self::SLUG], $step ? ['step' => $step] : [], $extra);
        return add_query_arg($args, admin_url('admin.php'));
    }

    public static function is_connected() {
        return (string) SPM_Plugin::get('api_key', '') !== '';
    }

    public function maybe_redirect_after_activation() {
        if (!get_option('spm_setup_redirect')) return;
        delete_option('spm_setup_redirect');
        if (wp_doing_ajax() || is_network_admin() || isset($_GET['activate-multi']) || !current_user_can('manage_options')) return;
        if (self::is_connected()) return;
        wp_safe_redirect(self::url());
        exit;
    }

    public function setup_notice() {
        if (self::is_connected() || !current_user_can('manage_options')) return;
        $screen = function_exists('get_current_screen') ? get_current_screen() : null;
        if ($screen && strpos((string) $screen->id, self::SLUG) !== false) return;
        echo '<div class="notice notice-info"><p><strong>Smart Property Manager</strong> is almost ready. '
            . 'It takes about two minutes to connect your properties. '
            . '<a class="button button-primary" style="margin-left:8px" href="' . esc_url(self::url()) . '">Start setup</a></p></div>';
    }

    /** Languages the site serves, default first, with the plugin that provides them. */
    public static function site_languages() {
        $i18n = SPM_I18n::instance();
        $info = $i18n->detect();
        $default = $i18n->default_lang_code();
        $langs = array_values(array_unique(array_merge([$default], $i18n->all_language_codes())));
        $names = [];
        foreach ((array) $info['all_languages'] as $l) {
            if (!empty($l['code'])) $names[$l['code']] = $l['name'] ?? '';
        }
        return ['plugin' => $info['plugin'], 'default' => $default, 'languages' => $langs, 'names' => $names];
    }

    /**
     * Suggestions come from the language the pages are written in. A site
     * without a translation plugin stores its slugs under "en" (the fallback
     * key) but may well be in Spanish — suggest from the site's locale then.
     */
    public static function suggestion_lang($lang, $plugin) {
        if ($plugin === 'none') return strtolower(substr((string) get_locale(), 0, 2)) ?: 'en';
        return $lang;
    }

    // ─── Handlers ──────────────────────────────────────────────────

    public function handle_connect() {
        if (!current_user_can('manage_options')) wp_die('Forbidden');
        check_admin_referer('spm_wizard_connect');
        $key = sanitize_text_field(wp_unslash($_POST['api_key'] ?? ''));
        if ($key === '') {
            $this->back('connect', 'Paste the API key from your SPM dashboard first.');
        }
        $opts = get_option(SPM_OPTION, SPM_Plugin::default_settings());
        if (!is_array($opts)) $opts = SPM_Plugin::default_settings();
        $opts['api_key'] = $key;
        update_option(SPM_OPTION, $opts);

        $r = SPM_API_Client::test_connection();
        if (is_wp_error($r)) {
            $this->back('connect', $r->get_error_message());
        }
        SPM_Data_Sync::instance()->sync_site_config();
        wp_safe_redirect(self::url('pages'));
        exit;
    }

    public function handle_pages() {
        if (!current_user_can('manage_options')) wp_die('Forbidden');
        check_admin_referer('spm_wizard_pages');
        $site = self::site_languages();
        $rows = (array) ($_POST['lang'] ?? []);

        $opts = get_option(SPM_OPTION, SPM_Plugin::default_settings());
        if (!is_array($opts)) $opts = SPM_Plugin::default_settings();
        $slug_maps = ['listings' => [], 'detail' => [], 'wishlist' => []];
        $titles_i18n = (array) ($opts['page_titles_i18n'] ?? []);
        $default_titles = (array) ($opts['page_titles'] ?? []);
        $errors = [];

        foreach ($site['languages'] as $lang) {
            $row = (array) ($rows[$lang] ?? []);
            $suggest = SPM_Page_Defaults::slugs(self::suggestion_lang($lang, $site['plugin']));
            $slugs = [];
            foreach (['listings', 'detail', 'wishlist'] as $t) {
                $s = sanitize_title(wp_unslash($row['slug_' . $t] ?? ''));
                $slugs[$t] = $s !== '' ? $s : $suggest[$t];
                $slug_maps[$t][$lang] = $slugs[$t];
            }
            if (count(array_unique($slugs)) < 3) {
                $errors[] = strtoupper($lang) . ': the three web addresses must be different.';
            }
            $titles = [];
            foreach (['listings', 'detail', 'wishlist', 'map'] as $t) {
                $v = sanitize_text_field(wp_unslash($row['title_' . $t] ?? ''));
                if ($v !== '') $titles[$t] = $v;
            }
            if ($lang === $site['default']) {
                $default_titles = array_merge($default_titles, $titles);
            }
            $titles_i18n[$lang] = $titles;
        }
        if ($errors) $this->back('pages', implode(' ', $errors));

        // "en" is the fallback key for any language without its own row.
        foreach ($slug_maps as $t => $map) {
            if (!isset($map['en'])) $slug_maps[$t] = ['en' => $map[$site['default']]] + $map;
        }
        $detail_changed = ($opts['slugs_detail'] ?? []) != $slug_maps['detail'];
        $opts['slugs_listings'] = $slug_maps['listings'];
        $opts['slugs_detail'] = $slug_maps['detail'];
        $opts['slugs_wishlist'] = $slug_maps['wishlist'];
        $opts['page_titles'] = $default_titles;
        $opts['page_titles_i18n'] = $titles_i18n;
        update_option(SPM_OPTION, $opts);
        if ($detail_changed) {
            SPM_Sitemap::flush();
        }

        $types = ['listings', 'detail', 'wishlist'];
        // An existing map page is kept (and translated) even when the box is left unticked.
        if (!empty($_POST['create_map']) || (int) ($opts['map_page_id'] ?? 0)) $types[] = 'map';
        $results = SPM_Page_Generator::create_pages(['types' => $types, 'upgrade' => !empty($_POST['upgrade']), 'publish' => true]);

        // Property addresses for the (possibly new) slugs, and the search lists.
        SPM_Rewrite::add_rules();
        flush_rewrite_rules();
        $sync = SPM_Data_Sync::instance()->sync_all(true);
        update_option('spm_setup_done', time(), false);

        set_transient('spm_wizard_results_' . get_current_user_id(), ['pages' => $results, 'sync' => $sync], HOUR_IN_SECONDS);
        wp_safe_redirect(self::url('finish'));
        exit;
    }

    private function back($step, $message) {
        set_transient('spm_wizard_error_' . get_current_user_id(), $message, 5 * MINUTE_IN_SECONDS);
        wp_safe_redirect(self::url($step));
        exit;
    }

    public static function take_error() {
        $key = 'spm_wizard_error_' . get_current_user_id();
        $msg = get_transient($key);
        if ($msg) delete_transient($key);
        return $msg ?: '';
    }

    // ─── Screens ───────────────────────────────────────────────────

    public function render() {
        if (!current_user_can('manage_options')) return;
        $step = sanitize_key($_GET['step'] ?? '');
        if (!in_array($step, ['connect', 'pages', 'finish'], true)) $step = 'connect';
        if ($step !== 'connect' && !self::is_connected()) $step = 'connect';
        include SPM_DIR . 'admin/views/setup-wizard.php';
    }

    public function render_health() {
        if (!current_user_can('manage_options')) return;
        include SPM_DIR . 'admin/views/health-page.php';
    }
}
