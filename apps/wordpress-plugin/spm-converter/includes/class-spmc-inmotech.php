<?php
if (!defined('ABSPATH')) exit;

/**
 * Inmotech shortcodes → SPM blocks.
 *
 *   [2020puertobanus filter="type=2,3,4 location=72 perpage=12 listing_type=resale ownfirst=1"]
 *   → <div class="spm-block" data-spm-widget="site-listing" data-spm-type="…" …></div>
 *
 * Every tag gets a sensible SPM block without any setup (results pages follow
 * the design picked in the SPM dashboard); the admin can point a tag at
 * another block on the converter page (spmc_tag_targets).
 */
class SPMC_Inmotech {
    const LISTING_TAGS = [
        '2020manilva', '2020ibiza', '2020estepona', '2020sotogrande', '2020elviria',
        '2020madrid', '2020marbella', '2020extra', '2020costablanca', '2020puertobanus',
        '2020homepro', '2020cordoba', '2020inmolink', '2020quintestate', '2020alicante',
        '2020malaga', '2020almeria', '2020agentpro', '2020cdsproperty', '2020valencia', '2020barcelona',
    ];
    const SHORT_LIST_TAGS = ['footer_prop', 'ft_prop_style1', 'ft_prop_style2', 'ft_prop_style3'];
    const SLIDER_TAGS = ['property_slider_style01', 'property_slider_style02', 'property_slider_style03'];
    const SEARCH_TAGS = [
        'horizontal_search', 'inmotech_search', 'tab_search', 'one_line_search',
        'valencia_search', 'agentpro_search', 'inmolink_search', 'homepro_search',
        'vertical_search', 'vertical_expand_search', 'kyero_search',
    ];

    public static function tags() {
        return array_merge(self::LISTING_TAGS, self::SHORT_LIST_TAGS, self::SLIDER_TAGS, self::SEARCH_TAGS);
    }

    /** The SPM block a tag becomes unless the admin chose another. */
    public static function default_target($tag) {
        if (in_array($tag, self::SEARCH_TAGS, true)) return 'site-search';
        if (in_array($tag, self::SLIDER_TAGS, true)) return 'carousel-template-' . substr($tag, -2);
        return 'site-listing';
    }

    public static function target($tag) {
        $chosen = (array) get_option('spmc_tag_targets', []);
        $t = isset($chosen[$tag]) ? (string) $chosen[$tag] : '';
        return preg_match('/^[a-z][a-z0-9_-]{1,60}$/', $t) ? $t : self::default_target($tag);
    }

    public static function convert($text, SPMC_Report $r) {
        if (strpos($text, '[') === false) return $text;
        $tags = self::tags();
        usort($tags, function ($a, $b) { return strlen($b) - strlen($a); });
        $names = implode('|', array_map('preg_quote', $tags));
        // [tag attrs] with an optional [/tag] right after; quoted values may hold ].
        $re = '/\[(' . $names . ')(?![\w-])((?:[^\]"\']|"[^"]*"|\'[^\']*\')*)\](?:\s*\[\/\1\])?/i';
        return preg_replace_callback($re, function ($m) use ($r) {
            return self::one(strtolower($m[1]), $m[0], $m[2], $r);
        }, $text);
    }

    private static function one($tag, $original, $rawAttrs, SPMC_Report $r) {
        $r->tags[$tag] = true;
        $params = self::params($rawAttrs);
        $widget = self::target($tag);
        $f = self::filters($params, $r);

        if (in_array($tag, self::SHORT_LIST_TAGS, true)) {
            // Footer / sidebar lists: a few listings of their own.
            $f['standalone'] = true;
            if (empty($f['limit'])) $f['limit'] = 3;
        }
        SPMC_Output::page_size($f, $widget, $r);
        $isSearch = strpos($widget, 'search') !== false;
        $attrs = SPMC_Output::attrs($f, $r, !$isSearch);
        $new = SPMC_Output::div($widget, $attrs);
        $r->change('Inmotech', $original, $new);
        return $new;
    }

    /** filter="a=1 b=2,3" plus plain attributes; later wins. */
    private static function params($rawAttrs) {
        $raw = html_entity_decode((string) $rawAttrs, ENT_QUOTES, 'UTF-8');
        $atts = shortcode_parse_atts(trim($raw));
        if (!is_array($atts)) $atts = [];
        $out = [];
        foreach ($atts as $k => $v) {
            if (is_int($k)) continue; // flag with no value
            $k = strtolower((string) $k);
            if ($k === 'filter') {
                if (preg_match_all('/([a-z_][a-z0-9_]*)\s*=\s*("[^"]*"|\'[^\']*\'|[^\s]+)/i', (string) $v, $mm, PREG_SET_ORDER)) {
                    foreach ($mm as $p) $out[strtolower($p[1])] = trim($p[2], "\"' ");
                }
                continue;
            }
            $out[$k] = trim((string) $v);
        }
        return $out;
    }

    private static function filters(array $p, SPMC_Report $r) {
        $yes = function ($v) { return in_array(strtolower(trim((string) $v)), ['1', 'true', 'yes', 'on'], true); };
        $f = [];
        foreach ($p as $k => $v) {
            switch ($k) {
                case 'type': case 'property_type': $f['type'] = [$v]; break;
                case 'location': case 'locations': $f['location'] = [$v]; break;
                case 'features': case 'feature': $f['features'] = [$v]; break;
                case 'listing_type': $f['for'] = $v; break;
                case 'perpage': case 'per_page': case 'limit': $f['limit'] = (int) $v; break;
                case 'order': case 'sort': $f['sort'] = $v; break;
                case 'ownfirst': if ($yes($v)) $f['own_first'] = true; break;
                case 'own': case 'ownonly': if ($yes($v)) $f['own'] = true; break;
                case 'ref_no': case 'ref': $f['ref'] = $v; break;
                case 'shortlist': if ($yes($v)) $f['standalone'] = true; break;
                // Inmotech (like the old widget) marks featured listings as status=sale.
                case 'status':
                    if (strtolower($v) === 'sale') $f['featured'] = true;
                    else $r->note(sprintf('status="%s" has no SPM equivalent — dropped.', $v));
                    break;
                case 'list_price_min': $f['price'][0] = (int) $v; break;
                case 'list_price_max': $f['price'][1] = (int) $v; break;
                case 'beds_min': $f['beds'][0] = (int) $v; break;
                case 'beds_max': $f['beds'][1] = (int) $v; break;
                case 'baths_min': $f['baths'][0] = (int) $v; break;
                case 'baths_max': $f['baths'][1] = (int) $v; break;
                case 'built_min': $f['built'][0] = (int) $v; break;
                case 'built_max': $f['built'][1] = (int) $v; break;
                case 'plot_min': $f['plot'][0] = (int) $v; break;
                case 'plot_max': $f['plot'][1] = (int) $v; break;
                case 'columns': $f['columns'] = (int) $v; break;
                case 'template':
                    $r->note(sprintf('template="%s" is an Inmotech design — SPM uses the design picked in the SPM dashboard.', $v));
                    break;
                default:
                    if ($v !== '') $r->note(sprintf('%s="%s" has no SPM equivalent — dropped.', $k, $v));
            }
        }
        return $f;
    }
}
