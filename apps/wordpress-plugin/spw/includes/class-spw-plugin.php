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
class SPW_Plugin {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        SPW_Settings::instance();
        SPW_I18n::instance();
        SPW_Rewrite::instance();
        SPW_OG_Tags::instance();
        SPW_Data_Sync::instance();
        SPW_Cache_Exclusions::instance();
        SPW_Sitemap::instance();

        // Rewrite flush requested by a settings save (see SPW_Settings::sanitize).
        // Runs after SPW_Rewrite::add_rules (init, 10) so the flush writes the
        // rules for the slugs that were just saved.
        add_action('init', [self::class, 'maybe_flush_rewrites'], 20);
        // Older installs scheduled the lookup-data sync daily; it now runs hourly.
        add_action('init', [self::class, 'ensure_sync_schedule']);

        add_action('wp_head', [$this, 'inject_config'], 1);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_loader']);
        add_action('wp_body_open', [$this, 'inject_loading_overlay']);
    }

    public static function activate() {
        if (!get_option(SPW_OPTION)) {
            update_option(SPW_OPTION, self::default_settings());
        }
        SPW_Rewrite::add_rules();
        flush_rewrite_rules();

        // Page creation is intentionally NOT run here — admins trigger it from
        // the settings page via the "Create Pages" button. Avoids surprising
        // posts on activation when an install already has hand-built pages.

        self::ensure_sync_schedule();
    }

    public static function maybe_flush_rewrites() {
        if (!get_option('spw_flush_rewrites')) return;
        delete_option('spw_flush_rewrites');
        flush_rewrite_rules();
    }

    /**
     * Lookup data (locations, types, features, labels) is re-checked hourly.
     * A check is one small sync-meta call; lists are only re-downloaded when
     * the tenant's syncVersion moved (feed import, dashboard edit, cache clear).
     */
    public static function ensure_sync_schedule() {
        $event = function_exists('wp_get_scheduled_event') ? wp_get_scheduled_event('spw_daily_sync') : null;
        if ($event && $event->schedule === 'hourly') return;
        wp_clear_scheduled_hook('spw_daily_sync');
        wp_schedule_event(time() + 60, 'hourly', 'spw_daily_sync');
    }

    /**
     * Public URL of a generated page (listings / wishlist) in the current
     * language. Uses the page's translation when WPML or Polylang provides one,
     * else the configured slug under the language prefix.
     */
    public static function page_url($type) {
        $id = (int) self::get($type . '_page_id');
        $lang = class_exists('SPW_I18n') ? (SPW_I18n::instance()->current_lang() ?: 'en') : 'en';
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
        $prefix = class_exists('SPW_I18n') ? SPW_I18n::instance()->language_prefix() : '';
        return home_url(trailingslashit(($prefix ? $prefix . '/' : '') . self::slug($type, $lang)));
    }

    public static function deactivate() {
        flush_rewrite_rules();
        wp_clear_scheduled_hook('spw_daily_sync');
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
            // Titles used by SPW_Page_Generator on "Create Missing Pages".
            // Editable in the settings UI so admins can match their site copy.
            'page_titles'    => [
                'listings' => 'Properties',
                'detail'   => 'Property Detail',
                'wishlist' => 'Wishlist',
            ],
            // Auto-generated page IDs — managed by SPW_Page_Generator, not the UI.
            'detail_page_id'   => 0,
            'listings_page_id' => 0,
            'wishlist_page_id' => 0,
        ];
    }

    /** Page title for a given type — falls back to defaults if blank. */
    public static function page_title($type) {
        $defaults = ['listings' => 'Properties', 'detail' => 'Property Detail', 'wishlist' => 'Wishlist'];
        $titles = (array) self::get('page_titles', []);
        $title = isset($titles[$type]) ? trim((string)$titles[$type]) : '';
        return $title !== '' ? $title : ($defaults[$type] ?? ucfirst($type));
    }

    public static function get($key, $default = null) {
        $opts = get_option(SPW_OPTION, self::default_settings());
        return $opts[$key] ?? $default;
    }

    /**
     * Resolve the configured slug for a page type in a given language.
     * Falls back: requested lang → 'en' → hard default.
     */
    public static function slug($type, $lang = null) {
        $defaults = ['listings' => 'properties', 'detail' => 'property', 'wishlist' => 'wishlist'];
        $map = (array) self::get('slugs_' . $type, []);
        $lang = $lang ?: (class_exists('SPW_I18n') ? SPW_I18n::instance()->current_lang() : 'en');
        if ($lang && !empty($map[$lang])) return $map[$lang];
        if (!empty($map['en'])) return $map['en'];
        return $defaults[$type] ?? $type;
    }

    public function enqueue_loader() {
        $loader = defined('SPW_LOADER_URL') ? SPW_LOADER_URL : SPW_LOADER_DEFAULT;
        wp_enqueue_script('spw-widget', $loader, [], SPW_VERSION, true);
    }

    /**
     * Bare-minimum RealtySoftConfig. The widget pulls tenant prefs (theme,
     * currency, feature toggles, listing types) from the API using the key.
     * We only forward what WordPress knows that the API doesn't:
     *   - api_key + base url           (auth)
     *   - language + locale + prefix   (per-page locale from translation plugin)
     *   - propertyPageSlug             (lang-prefixed slug widget uses for property links)
     *   - dataBundleUrl                (per-language lookup cache, see SPW_Data_Sync)
     */
    public function inject_config() {
        $api_key = self::get('api_key');
        if (!$api_key) return;

        $i18n = SPW_I18n::instance();
        $lang   = $i18n->current_lang() ?: 'en';
        $locale = $i18n->current_locale();
        $prefix = $i18n->language_prefix();
        $api_url = defined('SPW_API_URL') ? SPW_API_URL : SPW_API_DEFAULT;

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
        $sync = SPW_Data_Sync::instance();
        $bundle_url = $sync->bundle_url($lang);
        if ($bundle_url) $config['dataBundleUrl'] = $bundle_url;
        $sync->maybe_schedule_refresh();

        ?>
<!-- Smart Property Widget v<?php echo esc_attr(SPW_VERSION); ?> -->
<script>window.RealtySoftConfig = <?php echo wp_json_encode($config); ?>;</script>
<?php
    }

    /**
     * Loading overlay on detail pages — hidden by widget once Preact hydrates.
     */
    public function inject_loading_overlay() {
        if (!SPW_Rewrite::is_property_detail()) return;
        ?>
<div id="spw-loading-overlay" style="position:fixed;inset:0;background:#fff;display:flex;align-items:center;justify-content:center;z-index:99999;transition:opacity .3s">
  <div style="width:48px;height:48px;border:4px solid #e5e5e5;border-top-color:#0066cc;border-radius:50%;animation:spw-spin 1s linear infinite"></div>
</div>
<style>@keyframes spw-spin{to{transform:rotate(360deg)}}</style>
<script>document.addEventListener('spw:ready',()=>{var e=document.getElementById('spw-loading-overlay');if(e){e.style.opacity=0;setTimeout(()=>e.remove(),300)}});</script>
<?php
    }
}
