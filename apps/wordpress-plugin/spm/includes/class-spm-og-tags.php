<?php
if (!defined('ABSPATH')) exit;

/**
 * Server-side SEO for property pages, from the property's SEO section in the
 * SPM dashboard (filled by the agent or by AI):
 *   <title>              Meta Title        (else "Title | Site name")
 *   meta description     Meta Description  (else the start of the description)
 *   meta keywords        Meta Keywords     (only when set)
 *   canonical            the property's own address (never the plain detail page)
 *   Open Graph / Twitter the same title, description and first photo
 *   JSON-LD              the agent's custom schema, else one built from the listing
 * The on-page heading uses Page Title (widget side).
 *
 * Search engines and link previews (WhatsApp, Facebook) read these from the
 * HTML, so they're written here rather than by the widget. On property pages
 * the matching output of WordPress itself, Yoast SEO and Rank Math is turned
 * off, so there is exactly one title, description and canonical.
 *
 * The property is fetched once per ref + language and cached for 12 hours.
 */
class SPM_OG_Tags {
    const TRANSIENT_PREFIX = 'spm_og_';
    const TTL = 12 * HOUR_IN_SECONDS;

    private static $instance = null;
    /** @var array|null the page's property (resolved in prepare()) */
    private $property = null;
    private $seo = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // After SPM_Rewrite::route_to_detail (priority 0), before any output.
        add_action('template_redirect', [$this, 'prepare'], 5);
        add_action('wp_head', [$this, 'render'], 1);
    }

    /** Fetch the property and register the title / SEO-plugin overrides. */
    public function prepare() {
        if (!SPM_Rewrite::is_property_detail()) return;
        foreach (SPM_Rewrite::ref_candidates() as $ref) {
            $this->property = $this->fetch($ref, $this->lang());
            if ($this->property) break;
        }
        if (!$this->property) return;
        $this->seo = $this->seo_values($this->property);
        $seo = $this->seo;

        add_filter('pre_get_document_title', function () use ($seo) { return $seo['title']; }, 999);
        // WordPress core would point the canonical at the plain detail page.
        remove_action('wp_head', 'rel_canonical');

        // Yoast SEO
        add_filter('wpseo_title', function () use ($seo) { return $seo['title']; }, 999);
        add_filter('wpseo_frontend_presenters', [$this, 'drop_yoast_presenters'], 999);
        add_filter('wpseo_json_ld_output', '__return_false', 999);
        // Rank Math
        add_filter('rank_math/frontend/title', function () use ($seo) { return $seo['title']; }, 999);
        add_filter('rank_math/frontend/description', '__return_false', 999);
        add_filter('rank_math/frontend/canonical', '__return_false', 999);
        add_filter('rank_math/json_ld', '__return_empty_array', 999);
        add_action('rank_math/head', function () {
            remove_all_actions('rank_math/opengraph/facebook');
            remove_all_actions('rank_math/opengraph/twitter');
        }, 0);
        // All in One SEO
        add_filter('aioseo_disable', '__return_true', 999);
    }

    /** Yoast: keep its robots / verification output, drop what we write ourselves. */
    public function drop_yoast_presenters($presenters) {
        return array_values(array_filter((array) $presenters, function ($p) {
            $cls = is_object($p) ? get_class($p) : '';
            foreach (['Title_Presenter', 'Meta_Description_Presenter', 'Canonical_Presenter', 'Open_Graph', 'Twitter', 'Schema_Presenter'] as $drop) {
                if (strpos($cls, $drop) !== false) return false;
            }
            return true;
        }));
    }

    public function render() {
        if (!$this->property || !$this->seo) return;
        $p = $this->property;
        $s = $this->seo;
        $locale = class_exists('SPM_I18n') ? SPM_I18n::instance()->current_locale() : get_locale();
        ?>
<!-- Smart Property Manager SEO -->
<meta name="spm-seo" content="server" />
<meta name="description" content="<?php echo esc_attr($s['description']); ?>" />
<?php if ($s['keywords'] !== ''): ?>
<meta name="keywords" content="<?php echo esc_attr($s['keywords']); ?>" />
<?php endif; ?>
<link rel="canonical" href="<?php echo esc_url($s['canonical']); ?>" />
<meta property="og:type" content="website" />
<meta property="og:locale" content="<?php echo esc_attr($locale); ?>" />
<meta property="og:site_name" content="<?php echo esc_attr(get_bloginfo('name')); ?>" />
<meta property="og:title" content="<?php echo esc_attr($s['title']); ?>" />
<meta property="og:description" content="<?php echo esc_attr($s['description']); ?>" />
<meta property="og:url" content="<?php echo esc_url($s['canonical']); ?>" />
<?php if ($s['image']): ?>
<meta property="og:image" content="<?php echo esc_url($s['image']); ?>" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<?php endif; ?>
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="<?php echo esc_attr($s['title']); ?>" />
<meta name="twitter:description" content="<?php echo esc_attr($s['description']); ?>" />
<?php if ($s['image']): ?>
<meta name="twitter:image" content="<?php echo esc_url($s['image']); ?>" />
<?php endif; ?>
<script type="application/ld+json" data-spm-schema="server"><?php echo $this->schema_json($p, $s); ?></script>
<?php
    }

    /** Title, description, keywords, canonical and image for the page, SEO fields first. */
    private function seo_values($p) {
        $lang = $this->lang();
        $title = trim($this->i18n_value($p['title'] ?? '', $lang));
        $meta_title = trim($this->i18n_value($p['metaTitle'] ?? '', $lang));
        $meta_desc = trim($this->i18n_value($p['metaDescription'] ?? '', $lang));
        $site = get_bloginfo('name');
        return [
            // An agent's Meta Title is the whole title, as they wrote it.
            'title'       => $meta_title !== '' ? $meta_title : ($title !== '' ? $title . ($site ? ' | ' . $site : '') : $site),
            'description' => $this->clip($meta_desc !== '' ? $meta_desc : $this->i18n_value($p['description'] ?? '', $lang), 300),
            'keywords'    => trim(wp_strip_all_tags($this->i18n_value($p['metaKeywords'] ?? '', $lang))),
            'canonical'   => self::property_url($p, $lang),
            'image'       => $this->first_image($p),
        ];
    }

    /**
     * The property's address in a language: the segment the API computed
     * (slug format + the property's own slug), under that language's detail slug.
     */
    public static function property_url($p, $lang) {
        $segment = (string) ($p['urlSegment'] ?? '');
        if ($segment === '') {
            $raw = rawurldecode((string) get_query_var('spm_ref'));
            $segment = $raw !== '' ? $raw : (string) ($p['reference'] ?? '');
        }
        $i18n = SPM_I18n::instance();
        $default = $i18n->default_lang_code();
        $prefix = ($i18n->detect()['plugin'] !== 'none' && $lang !== $default) ? '/' . $lang : '';
        // No trailing slash: exactly the address the widget links to and the sitemap lists.
        return home_url($prefix . '/' . SPM_Plugin::slug('detail', $lang) . '/' . rawurlencode($segment));
    }

    /** The property in a language (cached), or null. Used for hreflang too. */
    public function fetch($ref, $lang) {
        // The version is part of the key: an edit in the dashboard bumps it,
        // so a changed title or SEO field shows within minutes, not 12 hours.
        $key = self::TRANSIENT_PREFIX . md5($ref . '|' . $lang . '|' . SPM_Data_Sync::current_version());
        $cached = get_transient($key);
        if ($cached !== false) return $cached ?: null;

        $r = SPM_API_Client::get('api/v1/properties/' . rawurlencode($ref), ['lang' => $lang]);
        if (is_wp_error($r)) {
            set_transient($key, [], 5 * MINUTE_IN_SECONDS);
            return null;
        }
        $data = $r['data'] ?? $r;
        if (!is_array($data) || empty($data)) return null;

        set_transient($key, $data, self::TTL);
        return $data;
    }

    /** The page's property, once prepare() has run. */
    public function current_property() {
        return $this->property;
    }

    private function lang() {
        return class_exists('SPM_I18n') ? (SPM_I18n::instance()->current_lang() ?: 'en') : 'en';
    }

    private function first_image($p) {
        if (!empty($p['mainImage'])) return $p['mainImage'];
        if (!empty($p['images']) && is_array($p['images'])) {
            $images = $p['images'];
            usort($images, function ($a, $b) {
                return (is_array($a) ? (int) ($a['order'] ?? 0) : 0) <=> (is_array($b) ? (int) ($b['order'] ?? 0) : 0);
            });
            $first = $images[0];
            if (is_string($first)) return $first;
            if (is_array($first)) return $first['url'] ?? $first['src'] ?? '';
        }
        return '';
    }

    private function clip($text, $len) {
        $text = trim(preg_replace('/\s+/', ' ', wp_strip_all_tags((string) $text)));
        if (mb_strlen($text) <= $len) return $text;
        return rtrim(mb_substr($text, 0, $len - 1)) . '…';
    }

    /**
     * The agent's custom JSON-LD when it is valid JSON (re-encoded, so it can't
     * break out of the script tag), else a RealEstateListing built from the listing.
     */
    private function schema_json($p, $s) {
        $flags = JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP;
        $custom = isset($p['seoSchemaJson']) && is_string($p['seoSchemaJson']) ? json_decode($p['seoSchemaJson'], true) : null;
        if (is_array($custom) && $custom) return wp_json_encode($custom, $flags);

        $lang = $this->lang();
        $node = [
            '@context'    => 'https://schema.org',
            '@type'       => 'RealEstateListing',
            'name'        => $this->i18n_value($p['title'] ?? '', $lang),
            'description' => $s['description'],
            'url'         => $s['canonical'],
            'identifier'  => $p['reference'] ?? '',
        ];
        if ($s['image']) $node['image'] = $s['image'];
        if (!empty($p['updatedAt'])) $node['dateModified'] = $p['updatedAt'];
        $price = $p['price'] ?? null;
        if ($price !== null && $price !== '' && empty($p['priceOnRequest'])) {
            $node['offers'] = [
                '@type'         => 'Offer',
                'price'         => (string) $price,
                'priceCurrency' => $p['currency'] ?? 'EUR',
                'availability'  => 'https://schema.org/InStock',
                'url'           => $s['canonical'],
            ];
        }
        return wp_json_encode($node, $flags);
    }

    /** Invalidate a single ref in every language (e.g. when widget pushes updated data). */
    public static function bust_cache($ref) {
        $langs = SPM_Data_Sync::instance()->languages();
        $version = SPM_Data_Sync::current_version();
        foreach ($langs as $lang) {
            delete_transient(self::TRANSIENT_PREFIX . md5($ref . '|' . $lang . '|' . $version));
        }
    }

    /**
     * Resolve a value that may be either a plain string (post i18n-interceptor)
     * or an i18n map (raw entity / legacy transient / older API build).
     * Order: requested lang → base lang → 'en' → first non-empty.
     */
    private function i18n_value($value, $lang) {
        if (is_string($value)) return $value;
        if (!is_array($value)) return '';
        $base = strtolower(explode('-', $lang)[0]);
        foreach ([$lang, $base, 'en'] as $k) {
            if (isset($value[$k]) && is_string($value[$k]) && $value[$k] !== '') return $value[$k];
        }
        foreach ($value as $v) {
            if (is_string($v) && $v !== '') return $v;
        }
        return '';
    }
}
