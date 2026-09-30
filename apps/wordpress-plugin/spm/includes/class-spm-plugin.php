<?php
if (!defined('ABSPATH')) exit;

/**
 * Plugin core. Wires up the modules, owns the settings shape, and emits the
 * minimal RealtySoftConfig the widget needs to bootstrap.
 *
 * V2.2 reduces the plugin's responsibility to four things:
 *   1. Auth      — the tenant API key
 *   2. Routing   — per-language slugs for listing / detail / wishlist pages
 *   3. Data sync — local JSON cache for dropdown lookups
 *   4. Loader    — enqueue the widget bundle + inject the bare auth config
 *
 * Currency, theme, listing types, features, analytics, custom CSS, etc. are
 * sourced from the tenant's dashboard config on the API side — the widget
 * pulls them itself, so they no longer live in WP options.
 */
class SPM_Plugin {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        SPM_Settings::instance();
        SPM_I18n::instance();
        SPM_Rewrite::instance();
        SPM_OG_Tags::instance();
        SPM_Data_Sync::instance();
        SPM_Cache_Exclusions::instance();
        SPM_Sitemap::instance();
        SPM_Shortcode::instance();
        SPM_Health::instance();
        if (is_admin()) SPM_Setup_Wizard::instance();

        // Rewrite flush requested by a settings save (see SPM_Settings::sanitize).
        // Runs after SPM_Rewrite::add_rules (init, 10) so the flush writes the
        // rules for the slugs that were just saved.
        add_action('init', [self::class, 'maybe_flush_rewrites'], 20);
        // Older installs scheduled the lookup-data sync daily; it now runs hourly.
        add_action('init', [self::class, 'ensure_sync_schedule']);

        add_action('wp_head', [$this, 'inject_config'], 1);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_loader']);
        add_action('wp_body_open', [$this, 'inject_loading_overlay']);
    }

    public static function activate() {
        if (!get_option(SPM_OPTION)) {
            update_option(SPM_OPTION, self::default_settings());
        }
        // Open the setup wizard on the next admin page view (not yet connected).
        if (!self::get('api_key')) update_option('spm_setup_redirect', 1, false);
        SPM_Rewrite::add_rules();
        flush_rewrite_rules();

        // Page creation is intentionally NOT run here — admins trigger it from
        // the settings page via the "Create Pages" button. Avoids surprising
        // posts on activation when an install already has hand-built pages.

        self::ensure_sync_schedule();
    }

    public static function maybe_flush_rewrites() {
        if (!get_option('spm_flush_rewrites')) return;
        delete_option('spm_flush_rewrites');
        flush_rewrite_rules();
    }

    /**
     * Lookup data (locations, types, features, labels) is re-checked hourly.
     * A check is one small sync-meta call; lists are only re-downloaded when
     * the tenant's syncVersion moved (feed import, dashboard edit, cache clear).
     */
    public static function ensure_sync_schedule() {
        $event = function_exists('wp_get_scheduled_event') ? wp_get_scheduled_event('spm_daily_sync') : null;
        if ($event && $event->schedule === 'hourly') return;
        wp_clear_scheduled_hook('spm_daily_sync');
        wp_schedule_event(time() + 60, 'hourly', 'spm_daily_sync');
    }

    /**
     * Public URL of a generated page (listings / wishlist) in the current
     * language. Uses the page's translation when WPML or Polylang provides one,
     * else the configured slug under the language prefix.
     */
    public static function page_url($type) {
        $id = (int) self::get($type . '_page_id');
        $lang = class_exists('SPM_I18n') ? (SPM_I18n::instance()->current_lang() ?: 'en') : 'en';
        if ($id && get_post_status($id) === 'publish') {
            $translated = $id;
            if (function_exists('pll_get_post')) {
                $translated = (int) (pll_get_post($id, $lang) ?: $id);
            } else {
                $translated = (int) apply_filters('wpml_object_id', $id, 'page', true, $lang);
            }
            $url = get_permalink($translated ?: $id);
            if ($url) return $url;
        }
        $prefix = class_exists('SPM_I18n') ? SPM_I18n::instance()->language_prefix() : '';
        return home_url(trailingslashit(($prefix ? $prefix . '/' : '') . self::slug($type, $lang)));
    }

    public static function deactivate() {
        flush_rewrite_rules();
        wp_clear_scheduled_hook('spm_daily_sync');
    }

    /**
     * Settings shape — kept intentionally tiny.
     *
     * Per-language slug maps drive URL construction across rewrites, OG tags,
     * sitemap, and hreflang. Each map is `lang_code => slug`. The `en` entry
     * is the fallback whenever the active language has no slug configured.
     */
    public static function default_settings() {
        return [
            'api_key'        => '',
            'slugs_listings' => ['en' => 'properties'],
            'slugs_detail'   => ['en' => 'property'],
            'slugs_wishlist' => ['en' => 'wishlist'],
            // Titles used by SPM_Page_Generator on "Create Missing Pages".
            // Editable in the settings UI so admins can match their site copy.
            'page_titles'    => [
                'listings' => 'Properties',
                'detail'   => 'Property Detail',
                'wishlist' => 'Wishlist',
            ],
            // Titles for the other languages of a multilingual site: lang => type => title.
            'page_titles_i18n' => [],
            // Auto-generated page IDs (default language) — managed by SPM_Page_Generator, not the UI.
            'detail_page_id'   => 0,
            'listings_page_id' => 0,
            'wishlist_page_id' => 0,
            'map_page_id'      => 0,
        ];
    }

    /**
     * Page title for a type in a language: the admin's title for that
     * language, else the built-in translation, else English.
     */
    public static function page_title($type, $lang = null) {
        $default_lang = class_exists('SPM_I18n') ? SPM_I18n::instance()->default_lang_code() : 'en';
        $lang = $lang ?: $default_lang;
        $i18n = (array) self::get('page_titles_i18n', []);
        $title = trim((string) ($i18n[$lang][$type] ?? ''));
        if ($title === '' && $lang === $default_lang) {
            $titles = (array) self::get('page_titles', []);
            $title = trim((string) ($titles[$type] ?? ''));
        }
        if ($title !== '') return $title;
        $defaults = SPM_Page_Defaults::titles($lang);
        return $defaults[$type] ?? ucfirst($type);
    }

    /** Dashboard settings cached by the data sync (brand colour, chosen templates). */
    public static function site_config() {
        $c = get_option('spm_site_config', []);
        return is_array($c) ? $c : [];
    }

    public static function get($key, $default = null) {
        $opts = get_option(SPM_OPTION, self::default_settings());
        return $opts[$key] ?? $default;
    }

    /**
     * Resolve the configured slug for a page type in a given language.
     * Falls back: requested lang → 'en' → hard default.
     */
    public static function slug($type, $lang = null) {
        $defaults = ['listings' => 'properties', 'detail' => 'property', 'wishlist' => 'wishlist'];
        $map = (array) self::get('slugs_' . $type, []);
        $lang = $lang ?: (class_exists('SPM_I18n') ? SPM_I18n::instance()->current_lang() : 'en');
        if ($lang && !empty($map[$lang])) return $map[$lang];
        if (!empty($map['en'])) return $map['en'];
        return $defaults[$type] ?? $type;
    }

    public function enqueue_loader() {
        $loader = defined('SPM_LOADER_URL') ? SPM_LOADER_URL : SPM_LOADER_DEFAULT;
        // ?ver = the deployed widget's version (from the API), so every widget
        // release is a new URL for browsers and the CDN — no purge needed.
        $ver = (string) get_option('spm_widget_version', '');
        wp_enqueue_script('spm-widget', $loader, [], $ver !== '' ? $ver : SPM_VERSION, true);
    }

    /**
     * Bare-minimum RealtySoftConfig. The widget pulls tenant prefs (theme,
     * currency, feature toggles, listing types) from the API using the key.
     * We only forward what WordPress knows that the API doesn't:
     *   - api_key + base url           (auth)
     *   - language + locale + prefix   (per-page locale from translation plugin)
     *   - propertyPageSlug             (lang-prefixed slug widget uses for property links)
     *   - dataBundleUrl                (per-language lookup cache, see SPM_Data_Sync)
     */
    public function inject_config() {
        $api_key = self::get('api_key');
        if (!$api_key) return;

        $i18n = SPM_I18n::instance();
        $lang   = $i18n->current_lang() ?: 'en';
        $locale = $i18n->current_locale();
        $prefix = $i18n->language_prefix();
        $api_url = defined('SPM_API_URL') ? SPM_API_URL : SPM_API_DEFAULT;

        $detail_slug = ltrim(($prefix ? $prefix . '/' : '') . self::slug('detail', $lang), '/');

        $config = [
            'apiUrl'           => $api_url,
            'apiKey'           => $api_key,
            'language'         => $lang,
            'locale'           => $locale,
            'languagePrefix'   => $prefix,
            'propertyPageSlug' => $detail_slug,
            // Where a search box on any other page (e.g. the homepage) sends
            // the visitor, and where the detail page's Back button and the
            // wishlist counter link to.
            'resultsPage'      => self::page_url('listings'),
            'wishlistPage'     => self::page_url('wishlist'),
        ];

        // Locations / types / features / labels for this language in one
        // cached file, so the widget skips four API calls per page view.
        // First paint in the dashboard's brand colour instead of the default
        // blue; the widget still applies the live dashboard value.
        $brand = self::site_config()['primaryColor'] ?? '';
        if (is_string($brand) && preg_match('/^#[0-9a-f]{6}$/i', $brand)) $config['brandColor'] = $brand;

        $sync = SPM_Data_Sync::instance();
        $bundle_url = $sync->bundle_url($lang);
        if ($bundle_url) $config['dataBundleUrl'] = $bundle_url;
        $sync->maybe_schedule_refresh();

        // The widget script sits at the end of the page, so the browser would
        // only start on it (and on the data file and the API) once the whole
        // page had arrived. These start all three now, in parallel with the
        // rest of the page. Each URL must match the one used later exactly.
        $api_origin = preg_replace('#^(https?://[^/]+).*$#i', '$1', $api_url);
        $ver = (string) get_option('spm_widget_version', '');
        $loader = defined('SPM_LOADER_URL') ? SPM_LOADER_URL : SPM_LOADER_DEFAULT;
        $loader_src = add_query_arg('ver', $ver !== '' ? $ver : SPM_VERSION, $loader);

        ?>
<!-- Smart Property Widget v<?php echo esc_attr(SPM_VERSION); ?> -->
<link rel="preconnect" href="<?php echo esc_url($api_origin); ?>" crossorigin>
<link rel="preload" href="<?php echo esc_url($loader_src); ?>" as="script">
<?php if ($bundle_url) : ?>
<link rel="preload" href="<?php echo esc_url($bundle_url); ?>" as="fetch" crossorigin="anonymous">
<?php endif; ?>
<script>window.RealtySoftConfig = <?php echo wp_json_encode($config); ?>;</script>
<?php
    }

    /**
     * Loading overlay on detail pages — hidden by widget once Preact hydrates.
     */
    public function inject_loading_overlay() {
        if (!SPM_Rewrite::is_property_detail()) return;
        $brand = self::site_config()['primaryColor'] ?? '';
        $spinner = (is_string($brand) && preg_match('/^#[0-9a-f]{6}$/i', $brand)) ? $brand : '#0066cc';
        ?>
<div id="spm-loading-overlay" style="position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;transition:opacity .3s">
  <div style="width:48px;height:48px;border:4px solid #e5e5e5;border-top-color:<?php echo esc_attr($spinner); ?>;border-radius:50%;animation:spm-spin 1s linear infinite"></div>
</div>
<style>@keyframes spm-spin{to{transform:rotate(360deg)}}</style>
<script>(function(){function h(){var e=document.getElementById('spm-loading-overlay');if(e){e.style.opacity=0;setTimeout(function(){e.remove()},300)}}document.addEventListener('spm:ready',h);document.addEventListener('spw:ready',h)})();</script>
<?php
    }
}
