<?php
if (!defined('ABSPATH')) exit;

/**
 * Server-side Open Graph + Twitter Card + Schema.org RealEstateListing
 * injection for property detail pages. This is what makes link previews
 * on WhatsApp/Facebook/Twitter/LinkedIn show the property image and title
 * instead of generic site metadata — social scrapers don't execute JS.
 *
 * Cached in a transient per ref (12h) to avoid hammering the API.
 */
class SPW_OG_Tags {
    const TRANSIENT_PREFIX = 'spw_og_';
    const TTL = 12 * HOUR_IN_SECONDS;

    private static $instance = null;
    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // Priority 1 = before Yoast/Rank Math/AIOSEO so we can override.
        add_action('wp_head', [$this, 'render'], 1);
        // Remove conflicting OG output from common SEO plugins on property pages.
        add_action('wp_head', [$this, 'suppress_seo_plugins'], 2);
    }

    public function render() {
        if (!SPW_Rewrite::is_property_detail()) return;
        $property = null;
        foreach (SPW_Rewrite::ref_candidates() as $ref) {
            $property = $this->fetch($ref);
            if ($property) break;
        }
        if (!$property) return;

        $lang  = class_exists('SPW_I18n') ? (SPW_I18n::instance()->current_lang() ?: 'en') : 'en';
        $title = $this->i18n_value($property['title'] ?? '', $lang);
        $desc  = $this->clip($this->i18n_value($property['description'] ?? '', $lang), 300);
        $image = $this->first_image($property);
        $url   = home_url(add_query_arg(null, null));
        $price = $property['price']        ?? null;
        $cur   = $property['currency']     ?? 'EUR';
        $locale = class_exists('SPW_I18n') ? SPW_I18n::instance()->current_locale() : get_locale();

        ?>
<!-- Smart Property Widget OG tags -->
<meta property="og:type" content="website" />
<meta property="og:locale" content="<?php echo esc_attr($locale); ?>" />
<meta property="og:title" content="<?php echo esc_attr($title); ?>" />
<meta property="og:description" content="<?php echo esc_attr($desc); ?>" />
<meta property="og:url" content="<?php echo esc_url($url); ?>" />
<?php if ($image): ?>
<meta property="og:image" content="<?php echo esc_url($image); ?>" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<?php endif; ?>
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="<?php echo esc_attr($title); ?>" />
<meta name="twitter:description" content="<?php echo esc_attr($desc); ?>" />
<?php if ($image): ?>
<meta name="twitter:image" content="<?php echo esc_url($image); ?>" />
<?php endif; ?>
<script type="application/ld+json"><?php echo wp_json_encode($this->schema_jsonld($property, $url, $image, $price, $cur), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
<?php
        // Override the document title too
        add_filter('pre_get_document_title', function ($t) use ($title) {
            return $title ? $title . ' | ' . get_bloginfo('name') : $t;
        }, 99);
    }

    public function suppress_seo_plugins() {
        if (!SPW_Rewrite::is_property_detail()) return;
        // Yoast — let it emit but we go first; for full suppression on detail pages, uncomment:
        // remove_all_actions('wpseo_head');
    }

    private function fetch($ref) {
        $lang = class_exists('SPW_I18n') ? (SPW_I18n::instance()->current_lang() ?: 'en') : 'en';
        $key = self::TRANSIENT_PREFIX . md5($ref . '|' . $lang);
        $cached = get_transient($key);
        if ($cached !== false) return $cached;

        $r = SPW_API_Client::get('api/v1/properties/' . rawurlencode($ref), ['lang' => $lang]);
        if (is_wp_error($r)) {
            set_transient($key, [], 5 * MINUTE_IN_SECONDS);
            return null;
        }
        $data = $r['data'] ?? $r;
        if (!is_array($data) || empty($data)) return null;

        set_transient($key, $data, self::TTL);
        return $data;
    }

    private function first_image($p) {
        if (!empty($p['mainImage'])) return $p['mainImage'];
        if (!empty($p['images']) && is_array($p['images'])) {
            $first = $p['images'][0];
            if (is_string($first)) return $first;
            if (is_array($first)) return $first['url'] ?? $first['src'] ?? '';
        }
        return '';
    }

    private function clip($text, $len) {
        $text = wp_strip_all_tags((string)$text);
        if (mb_strlen($text) <= $len) return $text;
        return mb_substr($text, 0, $len - 1) . '…';
    }

    private function schema_jsonld($p, $url, $image, $price, $cur) {
        $lang = class_exists('SPW_I18n') ? (SPW_I18n::instance()->current_lang() ?: 'en') : 'en';
        $node = [
            '@context'    => 'https://schema.org',
            '@type'       => 'Product',
            'name'        => $this->i18n_value($p['title'] ?? '', $lang),
            'description' => $this->clip($this->i18n_value($p['description'] ?? '', $lang), 500),
            'url'         => $url,
            'sku'         => $p['reference'] ?? '',
        ];
        if ($image) $node['image'] = $image;
        if ($price !== null && $price !== '') {
            $node['offers'] = [
                '@type'         => 'Offer',
                'price'         => (string)$price,
                'priceCurrency' => $cur,
                'availability'  => 'https://schema.org/InStock',
                'url'           => $url,
            ];
        }
        return $node;
    }

    /** Invalidate a single ref in every language (e.g. when widget pushes updated data). */
    public static function bust_cache($ref) {
        $langs = SPW_Data_Sync::instance()->languages();
        foreach ($langs as $lang) {
            delete_transient(self::TRANSIENT_PREFIX . md5($ref . '|' . $lang));
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
