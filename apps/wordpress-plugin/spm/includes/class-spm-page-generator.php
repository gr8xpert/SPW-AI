<?php
if (!defined('ABSPATH')) exit;

/**
 * Creates the widget host pages: Listings, Property Detail, Wishlist and an
 * optional Map Search page. Run from the setup wizard and the Pages screen,
 * never on activation (installs often have hand-built pages already).
 *
 * Pages hold `site-*` widget blocks (`<div data-spm-widget="site-listing">`),
 * which render whichever template the client picked in the SPM dashboard
 * (Website Design), so changing the design there needs no page edits.
 *
 * Multilingual sites: with Polylang or WPML every language gets its own
 * translated page (title + slug from the wizard), linked as translations of
 * the default-language page. TranslatePress, Weglot and GTranslate translate
 * a single page on the fly, so they get one page.
 *
 * The Detail page is virtual in practice — SPM_Rewrite routes
 * `/{slug}/{ref}` to it — but it's a real page so it has an edit link and
 * carries the OG / loading-overlay hooks.
 */
class SPM_Page_Generator {
    const TYPES = ['listings', 'detail', 'wishlist', 'map'];

    /** Page body for a type: dashboard-controlled `site-*` blocks. */
    public static function content($type) {
        $blocks = [
            'listings' => ['site-search', 'site-listing'],
            'detail'   => ['site-detail'],
            'wishlist' => ['wishlist_header', 'wishlist_actions', 'wishlist_grid', 'wishlist_empty'],
            'map'      => ['site-map'],
        ];
        $html = [];
        foreach ($blocks[$type] ?? [] as $w) {
            $html[] = '<div data-spm-widget="' . esc_attr($w) . '"></div>';
        }
        return "<!-- wp:html -->\n" . implode("\n\n", $html) . "\n<!-- /wp:html -->";
    }

    /** Bodies older plugin versions wrote; such untouched pages may be upgraded. */
    private static function legacy_contents($type) {
        $legacy = [
            'listings' => "<!-- wp:html -->\n<div data-spm-widget=\"search-template-01\"></div>\n\n<div data-spm-widget=\"listing-template-01\"></div>\n<!-- /wp:html -->",
            'detail'   => "<!-- wp:html -->\n<div data-spm-widget=\"detail-template-01\"></div>\n<!-- /wp:html -->",
        ];
        return isset($legacy[$type]) ? [$legacy[$type]] : [];
    }

    /**
     * How a page's body relates to what the generator writes:
     *   current    — uses the dashboard-controlled blocks
     *   legacy     — an untouched page from an older version (safe to upgrade)
     *   customised — edited by the admin; never touched
     */
    public static function content_state($type, $content) {
        $c = trim(str_replace("\r\n", "\n", (string) $content));
        if ($c === trim(self::content($type))) return 'current';
        foreach (self::legacy_contents($type) as $old) {
            if ($c === trim($old)) return 'legacy';
        }
        if ($type !== 'wishlist' && strpos($c, 'data-spm-widget="site-') !== false) return 'current';
        return 'customised';
    }

    private static function option_key($type) {
        return $type . '_page_id';
    }

    private static function page_slug($type, $lang) {
        switch ($type) {
            case 'detail':
                // The page itself must not sit on the detail slug, which the
                // rewrite uses for /{slug}/{ref} property URLs.
                return SPM_Plugin::slug('detail', $lang) . '-detail';
            case 'map':
                return sanitize_title(SPM_Plugin::page_title('map', $lang));
            default:
                return SPM_Plugin::slug($type, $lang);
        }
    }

    /**
     * @param array $args {
     *   types:   string[]  page types to ensure (default listings, detail, wishlist)
     *   upgrade: bool      switch untouched older pages to the dashboard-controlled blocks
     *   publish: bool      publish our pages that were left as draft / private
     * }
     * A page in the bin counts as missing and is created again.
     * @return array list of {type, lang, status: created|exists|updated|customised|failed, id?, title, url?, error?}
     */
    public static function create_pages($args = []) {
        $types = array_values(array_intersect(self::TYPES, (array) ($args['types'] ?? ['listings', 'detail', 'wishlist'])));
        $upgrade = !empty($args['upgrade']);
        $publish = !empty($args['publish']);
        $opts = get_option(SPM_OPTION, SPM_Plugin::default_settings());
        if (!is_array($opts)) $opts = SPM_Plugin::default_settings();

        $i18n = SPM_I18n::instance()->detect();
        $plugin = $i18n['plugin'];
        $default_lang = SPM_I18n::instance()->default_lang_code();
        $other_langs = in_array($plugin, ['polylang', 'wpml'], true) ? SPM_I18n::instance()->all_language_codes() : [];

        $results = [];
        foreach ($types as $type) {
            $key = self::option_key($type);
            $id = (int) ($opts[$key] ?? 0);
            if (!self::usable($id)) {
                $id = self::insert($type, $default_lang, $plugin, $results);
                if (!$id) continue;
                $opts[$key] = $id;
                update_option(SPM_OPTION, $opts);
            } else {
                $results[] = self::existing($type, $default_lang, $id, $upgrade, $publish);
            }
            self::set_language($plugin, $id, $default_lang);

            foreach ($other_langs as $lang) {
                $tid = self::translation_of($plugin, $id, $lang);
                if ($tid) {
                    $results[] = self::existing($type, $lang, $tid, $upgrade, $publish);
                    continue;
                }
                $tid = self::insert($type, $lang, $plugin, $results);
                if ($tid) self::link_translation($plugin, $id, $default_lang, $tid, $lang);
            }
        }
        return $results;
    }

    private static function insert($type, $lang, $plugin, &$results) {
        $title = SPM_Plugin::page_title($type, $lang);
        $id = wp_insert_post([
            'post_title'     => $title,
            'post_name'      => self::page_slug($type, $lang),
            'post_content'   => self::content($type),
            'post_status'    => 'publish',
            'post_type'      => 'page',
            'comment_status' => 'closed',
            'ping_status'    => 'closed',
        ], true);
        if (is_wp_error($id) || !$id) {
            $results[] = [
                'type' => $type, 'lang' => $lang, 'status' => 'failed', 'title' => $title,
                'error' => is_wp_error($id) ? $id->get_error_message() : 'unknown',
            ];
            return 0;
        }
        $id = (int) $id;
        // Polylang / WPML give a new page the admin's current language on
        // insert, so the language is always set, not only when missing.
        self::set_language($plugin, $id, $lang, true);
        $results[] = ['type' => $type, 'lang' => $lang, 'status' => 'created', 'id' => $id, 'title' => $title, 'url' => get_permalink($id)];
        return $id;
    }

    /** An existing page we can keep using (anything but missing or in the bin). */
    private static function usable($id) {
        $status = $id ? get_post_status($id) : false;
        return $status && $status !== 'trash';
    }

    private static function existing($type, $lang, $id, $upgrade, $publish = false) {
        $post = get_post($id);
        $state = self::content_state($type, $post ? $post->post_content : '');
        $row = ['type' => $type, 'lang' => $lang, 'status' => 'exists', 'id' => (int) $id, 'title' => get_the_title($id), 'url' => get_permalink($id)];
        if ($publish && $post && $post->post_status !== 'publish') {
            $ok = wp_update_post(['ID' => $id, 'post_status' => 'publish'], true);
            if (!is_wp_error($ok)) $row['status'] = 'updated';
        }
        if ($state === 'legacy' && $upgrade) {
            $ok = wp_update_post(['ID' => $id, 'post_content' => self::content($type)], true);
            $row['status'] = is_wp_error($ok) ? 'failed' : 'updated';
            if (is_wp_error($ok)) $row['error'] = $ok->get_error_message();
        } elseif ($state === 'customised') {
            $row['status'] = 'customised';
        } elseif ($state === 'legacy') {
            $row['legacy'] = true;
        }
        return $row;
    }

    private static function set_language($plugin, $id, $lang, $force = false) {
        if ($plugin === 'polylang' && function_exists('pll_set_post_language')) {
            if ($force || !function_exists('pll_get_post_language') || !pll_get_post_language($id)) pll_set_post_language($id, $lang);
        } elseif ($plugin === 'wpml') {
            $details = apply_filters('wpml_element_language_details', null, ['element_id' => $id, 'element_type' => 'page']);
            if (empty($details->language_code) || ($force && $details->language_code !== $lang)) {
                do_action('wpml_set_element_language_details', [
                    'element_id'    => $id,
                    'element_type'  => 'post_page',
                    'trid'          => $details->trid ?? false,
                    'language_code' => $lang,
                ]);
            }
        }
    }

    /** The page's translation in $lang, or 0. */
    public static function translation_of($plugin, $id, $lang) {
        if ($plugin === 'polylang' && function_exists('pll_get_post')) {
            $tid = (int) pll_get_post($id, $lang);
        } elseif ($plugin === 'wpml') {
            $tid = (int) apply_filters('wpml_object_id', $id, 'page', false, $lang);
        } else {
            return 0;
        }
        return ($tid && $tid !== (int) $id && self::usable($tid)) ? $tid : 0;
    }

    private static function link_translation($plugin, $source_id, $source_lang, $tid, $lang) {
        if ($plugin === 'polylang' && function_exists('pll_save_post_translations')) {
            $group = function_exists('pll_get_post_translations') ? (array) pll_get_post_translations($source_id) : [];
            $group[$source_lang] = $source_id;
            $group[$lang] = $tid;
            pll_save_post_translations($group);
        } elseif ($plugin === 'wpml') {
            $trid = apply_filters('wpml_element_trid', null, $source_id, 'post_page');
            do_action('wpml_set_element_language_details', [
                'element_id'           => $tid,
                'element_type'         => 'post_page',
                'trid'                 => $trid,
                'language_code'        => $lang,
                'source_language_code' => $source_lang,
            ]);
        }
    }
}
