<?php
if (!defined('ABSPATH')) exit;

/**
 * Translation plugin compatibility. Detects the active translation plugin
 * (Polylang, WPML, TranslatePress, Weglot, GTranslate) and exposes a single
 * interface so the rest of SPW can stay plugin-agnostic.
 *
 * V1 lesson (TROUBLESHOOTING Issue #2): Static $language_map lookup broke for
 * unsupported codes and SSR used config language instead of per-page locale.
 * V2 always defers to get_locale() with plugin hints layered on top.
 */
class SPW_I18n {
    private static $instance = null;
    private $info = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_head', [$this, 'render_hreflang'], 2);
    }

    /**
     * @return array {
     *   plugin:          string   one of polylang|wpml|translatepress|weglot|gtranslate|none
     *   current_lang:    string   short code (e.g. 'es')
     *   current_locale:  string   full locale (e.g. 'es_ES')
     *   default_lang:    string
     *   default_locale:  string
     *   language_prefix: string   '' for default, '/es' otherwise
     *   all_languages:   array    list of {code, locale, url?, name?}
     * }
     */
    public function detect() {
        if ($this->info !== null) return $this->info;

        $info = [
            'plugin'          => 'none',
            'current_lang'    => '',
            'current_locale'  => get_locale(),
            'default_lang'    => '',
            'default_locale'  => '',
            'language_prefix' => '',
            'all_languages'   => [],
        ];

        // 1. Polylang
        if (function_exists('pll_current_language')) {
            $info['plugin']         = 'polylang';
            $info['current_lang']   = pll_current_language('slug') ?: $this->short_from_locale($info['current_locale']);
            $info['current_locale'] = pll_current_language('locale') ?: $info['current_locale'];
            if (function_exists('pll_default_language')) {
                $info['default_lang']   = pll_default_language('slug') ?: '';
                $info['default_locale'] = pll_default_language('locale') ?: '';
            }
            if (function_exists('pll_languages_list')) {
                $slugs   = pll_languages_list(['fields' => 'slug']) ?: [];
                $locales = pll_languages_list(['fields' => 'locale']) ?: [];
                foreach ($slugs as $i => $slug) {
                    $info['all_languages'][] = [
                        'code'   => $slug,
                        'locale' => $locales[$i] ?? '',
                    ];
                }
            }
        }
        // 2. WPML
        elseif (defined('ICL_LANGUAGE_CODE')) {
            $info['plugin']       = 'wpml';
            $info['current_lang'] = ICL_LANGUAGE_CODE;
            $info['default_lang'] = apply_filters('wpml_default_language', null) ?: '';
            $langs = apply_filters('wpml_active_languages', null, ['skip_missing' => 0]);
            if (is_array($langs)) {
                foreach ($langs as $code => $l) {
                    $info['all_languages'][] = [
                        'code'   => $code,
                        'locale' => $l['default_locale'] ?? '',
                        'url'    => $l['url'] ?? '',
                        'name'   => $l['translated_name'] ?? ($l['native_name'] ?? ''),
                    ];
                    if ($code === $info['default_lang']) $info['default_locale'] = $l['default_locale'] ?? '';
                }
            }
        }
        // 3. TranslatePress
        elseif (class_exists('TRP_Translate_Press')) {
            $info['plugin'] = 'translatepress';
            global $TRP_LANGUAGE;
            $info['current_locale'] = $TRP_LANGUAGE ?: $info['current_locale'];
            $info['current_lang']   = $this->short_from_locale($info['current_locale']);
            $trp = get_option('trp_settings');
            if (is_array($trp)) {
                $info['default_locale'] = $trp['default-language'] ?? '';
                $info['default_lang']   = $this->short_from_locale($info['default_locale']);
                foreach ((array)($trp['translation-languages'] ?? []) as $loc) {
                    $info['all_languages'][] = ['code' => $this->short_from_locale($loc), 'locale' => $loc];
                }
            }
        }
        // 4. Weglot
        elseif (function_exists('weglot_get_current_language')) {
            $info['plugin']       = 'weglot';
            $info['current_lang'] = weglot_get_current_language();
            $info['default_lang'] = function_exists('weglot_get_original_language') ? weglot_get_original_language() : '';
            if (function_exists('weglot_get_destination_languages')) {
                foreach ((array) weglot_get_destination_languages() as $code) {
                    $info['all_languages'][] = ['code' => is_string($code) ? $code : ($code['language_to'] ?? '')];
                }
            }
        }
        // 5. GTranslate (URL-prefix detection)
        elseif (class_exists('GTranslate')) {
            $info['plugin'] = 'gtranslate';
            $path = isset($_SERVER['REQUEST_URI']) ? trim((string) $_SERVER['REQUEST_URI'], '/') : '';
            if (preg_match('#^([a-z]{2})(?:/|$)#i', $path, $m)) {
                $info['current_lang'] = strtolower($m[1]);
            }
        }

        if (!$info['current_lang']) {
            $info['current_lang'] = $this->short_from_locale($info['current_locale']);
        }
        if ($info['current_lang'] && $info['default_lang'] && $info['current_lang'] !== $info['default_lang']) {
            $info['language_prefix'] = '/' . $info['current_lang'];
        }

        $this->info = $info;
        return $info;
    }

    /** All known non-default language codes — used by rewrite rules. */
    public function all_language_codes() {
        $i = $this->detect();
        $codes = [];
        foreach ($i['all_languages'] as $l) {
            if (empty($l['code'])) continue;
            if ($l['code'] === $i['default_lang']) continue;
            $codes[] = $l['code'];
        }
        return array_values(array_unique($codes));
    }

    public function current_locale() {
        return $this->detect()['current_locale'];
    }

    public function current_lang() {
        return $this->detect()['current_lang'];
    }

    public function language_prefix() {
        return $this->detect()['language_prefix'];
    }

    /** Default language code reported by the active translation plugin, or 'en'. */
    public function default_lang_code() {
        return $this->detect()['default_lang'] ?: 'en';
    }

    /** Build a localized URL for a property detail page. */
    public function detail_url($ref, $title_slug = '') {
        $lang = $this->current_lang() ?: 'en';
        $slug = SPW_Plugin::slug('detail', $lang);
        $path = $title_slug ? $title_slug . '_' . $ref : $ref;
        return home_url($this->language_prefix() . '/' . $slug . '/' . $path);
    }

    /**
     * Emit <link rel="alternate" hreflang="..."> tags on property detail pages
     * so Google can serve the right language version in search results.
     */
    public function render_hreflang() {
        if (!SPW_Rewrite::is_property_detail()) return;
        $ref = SPW_Rewrite::current_ref();
        if (!$ref) return;
        $info = $this->detect();
        if ($info['plugin'] === 'none' || empty($info['all_languages'])) return;

        $title_slug = SPW_Rewrite::current_title_slug();
        $path = $title_slug ? $title_slug . '_' . $ref : $ref;

        echo "\n<!-- SPW hreflang -->\n";
        foreach ($info['all_languages'] as $l) {
            $code = $l['code'] ?? '';
            if (!$code) continue;
            $prefix = ($code === $info['default_lang']) ? '' : '/' . $code;
            $slug   = SPW_Plugin::slug('detail', $code);
            $url    = home_url($prefix . '/' . $slug . '/' . $path);
            printf('<link rel="alternate" hreflang="%s" href="%s" />' . "\n",
                esc_attr($code), esc_url($url));
        }
        if ($info['default_lang']) {
            $slug = SPW_Plugin::slug('detail', $info['default_lang']);
            $url  = home_url('/' . $slug . '/' . $path);
            printf('<link rel="alternate" hreflang="x-default" href="%s" />' . "\n", esc_url($url));
        }
    }

    private function short_from_locale($locale) {
        if (!$locale) return '';
        $parts = preg_split('/[_-]/', $locale);
        return strtolower($parts[0] ?? '');
    }
}
