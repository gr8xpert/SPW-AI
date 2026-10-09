<?php
if (!defined('ABSPATH')) exit;

/**
 * Old Smart Property Widget (RealtySoft V3) HTML → SPM blocks.
 *
 * V3 found its parts by class, id and data-rs-* attributes; SPM reads only
 * data-spm-*. Each opening tag that V3 would have used is rewritten in place
 * (its other classes and attributes, and anything inside it, stay), so page
 * builder markup around it is untouched:
 *
 *   <div class="rs-listing-template-07" data-rs-location="72" data-rs-limit="6"></div>
 *   → <div class="spm-block" data-spm-widget="listing-template-13" data-spm-location="5216585" data-spm-limit="6"></div>
 *
 * The old loader/config scripts pasted into pages are removed; the SPM plugin
 * adds its own.
 */
class SPMC_Spw {
    // V3 listing design → the SPM design ported from it. Others follow the
    // design picked in the SPM dashboard.
    const LISTING_DESIGNS = ['01' => 'listing-template-12', '07' => 'listing-template-13', '08' => 'listing-template-14', '09' => 'listing-template-15', '10' => 'listing-template-16', '11' => 'listing-template-17'];

    // V3 component class → SPM block. '' = no SPM equivalent (reported).
    const COMPONENTS = [
        'rs_location' => 'location', 'rs_property_type' => 'property_type', 'rs_listing_type' => 'listing_type',
        'rs_bedrooms' => 'bedrooms', 'rs_bathrooms' => 'bathrooms', 'rs_price' => 'price',
        'rs_built_area' => 'built_area', 'rs_plot_size' => 'plot_size', 'rs_features' => 'features',
        'rs_ref' => 'reference', 'rs_reference' => 'reference', 'rs_search_button' => 'search_button',
        'rs_reset_button' => 'reset_button', 'rs_ai_search_toggle' => 'ai_search', 'rs_sort_filter' => 'sort',
        'rs_property_grid' => 'property_grid', 'rs_results_count' => 'results_count', 'rs_pagination' => 'pagination',
        'rs_active_filters' => 'active_filters', 'rs_sort' => 'sort', 'rs_view_toggle' => 'view_toggle',
        'rs_map_view' => 'map_view',
        'rs_wishlist_header' => 'wishlist_header', 'rs_wishlist_actions' => 'wishlist_actions',
        'rs_wishlist_sort' => 'wishlist_sort', 'rs_wishlist_empty' => 'wishlist_empty', 'rs_wishlist_grid' => 'wishlist_grid',
        'rs_wishlist_compare_btn' => 'wishlist_compare_btn', 'rs_wishlist_modals' => 'wishlist_modals',
        'rs_wishlist_counter' => 'wishlist_counter', 'rs_wishlist_shared_banner' => '', 'rs_wishlist_button' => '',
        'rs_language_selector' => 'language_selector', 'rs_currency_selector' => 'currency_selector',
        'rs_share_buttons' => 'share_buttons', 'rs_mortgage_calculator' => 'mortgage_calculator',
        'rs_detail_back' => 'detail_back', 'rs_detail_gallery' => 'detail_gallery', 'rs_detail_title' => 'detail_title',
        'rs_detail_price' => 'detail_price', 'rs_detail_ref' => 'detail_ref', 'rs_detail_location' => 'detail_location',
        'rs_detail_address' => 'detail_address', 'rs_detail_type' => 'detail_type', 'rs_detail_status' => 'detail_status',
        'rs_detail_beds' => 'detail_beds', 'rs_detail_baths' => 'detail_baths', 'rs_detail_built' => 'detail_built',
        'rs_detail_plot' => 'detail_plot', 'rs_detail_terrace' => 'detail_terrace', 'rs_detail_garden' => 'detail_garden',
        'rs_detail_year' => 'detail_year', 'rs_detail_floor' => 'detail_floor', 'rs_detail_orientation' => 'detail_orientation',
        'rs_detail_parking' => 'detail_parking', 'rs_detail_energy_rating' => 'detail_energy_rating',
        'rs_detail_energy' => 'detail_energy_rating', 'rs_detail_community_fees' => 'detail_community_fees',
        'rs_detail_description' => 'detail_description', 'rs_detail_features' => 'detail_features',
        'rs_detail_specs' => 'detail_specs', 'rs_detail_info_table' => 'detail_specs', 'rs_detail_sizes' => 'detail_specs',
        'rs_detail_resources' => 'detail_resources', 'rs_detail_video_embed' => 'detail_video_embed',
        'rs_detail_video_link' => 'detail_video_link', 'rs_detail_tour_link' => 'detail_tour_link',
        'rs_detail_tour_embed' => 'detail_tour_embed', 'rs_detail_pdf' => 'detail_pdf', 'rs_detail_pdf_link' => 'detail_pdf',
        'rs_detail_map' => 'detail_map', 'rs_detail_related' => 'detail_related', 'rs_detail_agent' => 'detail_agent',
        'rs_detail_inquiry_form' => 'detail_inquiry_form', 'rs_detail_wishlist' => 'detail_wishlist',
        'rs_detail_share' => 'detail_share',
    ];

    // Attributes V3 only used for its own layout; dropped without a note.
    const QUIET = ['placeholder', 'label', 'component', 'role', 'locked', 'lazy', 'show-icon', 'max-length', 'max-images'];

    public static function convert($text, SPMC_Report $r) {
        if (!preg_match('/rs[_-]|data-rs-|property-detail-container|realtysoft|smartpropertywidget/i', $text)) return $text;
        if (get_option('spmc_strip_scripts', '1') === '1') $text = self::strip_scripts($text, $r);

        // An opening tag (quoted values may hold ">"), plus its closing tag
        // when nothing but space is between them (an empty V3 placeholder).
        $re = '/<([a-z][a-z0-9]*)\b((?:[^>"\']|"[^"]*"|\'[^\']*\')*?)(\/?)>(\s*<\/\1\s*>)?/i';
        $out = preg_replace_callback($re, function ($m) use ($r) {
            return self::tag($m, $r);
        }, $text);
        return $out === null ? $text : $out;
    }

    private static function tag(array $m, SPMC_Report $r) {
        $attrsRaw = $m[2];
        if (!preg_match('/\b(class|id)\s*=\s*["\'][^"\']*(rs[_-]|property-detail-container)|data-rs-/i', $attrsRaw)) return $m[0];

        $tagName = $m[1];
        $close = $m[4] ?? '';
        $empty = $m[3] === '/' || $close !== '';
        $attrs = self::parse_attrs($attrsRaw);
        $classes = preg_split('/\s+/', trim($attrs['class'] ?? ''), -1, PREG_SPLIT_NO_EMPTY);
        $id = trim($attrs['id'] ?? '');
        [$f, $leftover] = self::filters($attrs);

        $widget = '';
        $allowFilters = true;
        $drop = [];   // V3 classes that go
        $dropId = false;

        foreach ($classes as $c) {
            if ($c === 'rs_property_carousel') {
                $n = (int) ($f['template'] ?? 0) ?: (int) ($f['variation'] ?? 0) ?: 1;
                $widget = 'carousel-template-' . sprintf('%02d', max(1, min(6, $n)));
                unset($f['template'], $f['variation'], $f['standalone']); // carousels run their own search
                $drop[] = $c;
            } elseif (preg_match('/^rs-search-template-(\d{2})$/', $c, $mm) && $empty) {
                $widget = self::design('search', $mm[1], 'search-template-' . $mm[1]);
                $allowFilters = false;
                $drop[] = $c;
            } elseif (preg_match('/^rs-listing-template-(\d{2})$/', $c, $mm) && $empty) {
                $widget = self::design('listing', $mm[1], self::LISTING_DESIGNS[$mm[1]] ?? 'site-listing');
                $drop[] = $c;
            } elseif (preg_match('/^rs-map-search-template-\d{2}$/', $c) && $empty) {
                $widget = 'site-map';
                $drop[] = $c;
            } elseif ($c === 'property-detail-container') {
                $widget = 'site-detail';
                $allowFilters = false;
                $drop[] = $c;
            } elseif ($c === 'rs_wishlist_list') {
                $widget = 'site-wishlist';
                $allowFilters = false;
                $drop[] = $c;
            } elseif (in_array($c, ['rs-standalone-search', 'rs-search-standalone'], true) && $empty) {
                $widget = 'site-search';
                $allowFilters = false;
                $drop[] = $c;
            } elseif (isset(self::COMPONENTS[$c]) && !$widget) {
                $drop[] = $c;
                if (self::COMPONENTS[$c] === '') {
                    $r->note(sprintf('"%s" has no SPM block — left as it was.', $c));
                    $drop = array_diff($drop, [$c]);
                    continue;
                }
                // SPM's price field holds min and max; V3 had one box each.
                if ($c === 'rs_price' && strtolower($attrs['data-rs-type'] ?? '') === 'max') {
                    if ($empty) {
                        $r->change('SPW', $m[0], '');
                        return '';
                    }
                }
                $widget = self::COMPONENTS[$c];
                $allowFilters = false;
            } elseif (preg_match('/^rs_(detail_|card)/', $c) && !$widget) {
                $r->note(sprintf('"%s" has no SPM block — left as it was.', $c));
            }
        }

        if (!$widget && $id !== '') {
            if ($id === 'property-detail-container') {
                $widget = 'site-detail';
                $allowFilters = false;
            } elseif ($id === 'rs_wishlist') {
                $widget = 'site-wishlist';
                $allowFilters = false;
            } elseif ($id === 'rs_search' && $empty) {
                $widget = 'site-search';
                $allowFilters = false;
            } elseif (preg_match('/^rs_listing(_\d+)?$/', $id) && $empty) {
                $widget = 'site-listing';
            }
            if ($widget) $dropId = true;
        }

        if (!$widget) {
            // A wrapper V3 read filters from (#rs_search / #rs_listing with
            // its own fields inside): SPM has no such wrapper.
            $named = array_keys(array_filter(array_diff_key($f, ['variation' => 1]), ['SPMC_Output', 'present']));
            // Its filters go to the page's results block, like a search form's.
            if ($named) SPMC_Output::attrs($f, $r, false);
            if ($named || $r->has_notes()) {
                $r->change('SPW', $m[0], $m[0]);
            } else {
                $r->discard_notes();
            }
            return $m[0];
        }

        foreach ($leftover as $name) {
            if (!in_array($name, self::QUIET, true)) $r->note(sprintf('data-rs-%s has no SPM equivalent — dropped.', $name));
        }
        unset($f['template']);
        SPMC_Output::page_size($f, $widget, $r);
        $spm = SPMC_Output::attrs($f, $r, $allowFilters);

        // Rebuild the tag: other classes and attributes stay.
        $keepClasses = array_values(array_diff($classes, $drop));
        array_unshift($keepClasses, 'spm-block');
        $html = '<' . $tagName . ' class="' . esc_attr(implode(' ', array_unique($keepClasses))) . '"';
        foreach ($attrs as $name => $value) {
            if ($name === 'class' || strpos($name, 'data-rs-') === 0) continue;
            if ($name === 'id' && $dropId) continue;
            $html .= $value === null ? ' ' . $name : ' ' . $name . '="' . esc_attr($value) . '"';
        }
        $html .= SPMC_Output::attr_string($widget, $spm) . '>';
        // A self-closed <div/> becomes a proper pair.
        if ($m[3] === '/') $close = '</' . $tagName . '>';
        $new = $html . $close;
        $r->change('SPW', $m[0], $new);
        return $new;
    }

    /** Admin's choice for a V3 design number, else the default. */
    private static function design($kind, $nn, $default) {
        $chosen = (array) get_option('spmc_designs', []);
        $v = (string) ($chosen[$kind . '-' . $nn] ?? '');
        return preg_match('/^[a-z][a-z0-9_-]{1,60}$/', $v) ? $v : $default;
    }

    /** data-rs-* → the plain filter shape SPMC_Output takes. */
    private static function filters(array $attrs) {
        $f = [];
        $left = [];
        $yes = function ($v) { return $v === null || in_array(strtolower(trim((string) $v)), ['', '1', 'true', 'yes', 'on'], true); };
        foreach ($attrs as $name => $v) {
            if (strpos($name, 'data-rs-') !== 0) continue;
            $k = substr($name, 8);
            if (strpos($k, 'lock-') === 0) {
                $f['fixed'] = true;
                $k = substr($k, 5);
            }
            $v = $v === null ? '' : trim($v);
            switch ($k) {
                case 'location': $f['location'][] = $v; break;
                case 'property-type': case 'type-id': $f['type'][] = $v; break;
                case 'features': $f['features'][] = $v; break;
                case 'listing-type': $f['for'] = $v; break;
                case 'beds-min': case 'min-beds': $f['beds'][0] = (int) $v; break;
                case 'beds-max': case 'max-beds': $f['beds'][1] = (int) $v; break;
                case 'baths-min': $f['baths'][0] = (int) $v; break;
                case 'baths-max': $f['baths'][1] = (int) $v; break;
                case 'price-min': case 'min-price': $f['price'][0] = (int) $v; break;
                case 'price-max': case 'max-price': $f['price'][1] = (int) $v; break;
                case 'built-min': $f['built'][0] = (int) $v; break;
                case 'built-max': $f['built'][1] = (int) $v; break;
                case 'plot-min': $f['plot'][0] = (int) $v; break;
                case 'plot-max': $f['plot'][1] = (int) $v; break;
                case 'ref': $f['ref'] = $v; break;
                case 'featured': if ($yes($v)) $f['featured'] = true; break;
                case 'own': if ($yes($v)) $f['own'] = true; break;
                case 'own-first': if ($yes($v)) $f['own_first'] = true; break;
                case 'standalone': if ($yes($v)) $f['standalone'] = true; break;
                case 'autoplay': if ($yes($v)) $f['autoplay'] = true; break;
                case 'sort': case 'order': $f['sort'] = $v; break;
                case 'limit': $f['limit'] = (int) $v; break;
                case 'columns': $f['columns'] = (int) $v; break;
                case 'interval': $f['interval'] = (int) $v; break;
                case 'variation': $f['variation'] = (int) $v; break;
                case 'template': $f['template'] = (int) $v; break;
                case 'type': break; // rs_price min/max, handled by the caller
                default: $left[] = $k;
            }
        }
        return [$f, $left];
    }

    /** name => value (null for a bare attribute), names lower-cased. */
    private static function parse_attrs($raw) {
        $out = [];
        preg_match_all('/([^\s=\/"\'<>]+)(?:\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s"\'>]+)))?/', $raw, $mm, PREG_SET_ORDER);
        foreach ($mm as $a) {
            $name = strtolower($a[1]);
            if (!isset($a[2]) || $a[2] === '') {
                $out[$name] = null;
                continue;
            }
            $q = $a[2][0];
            $value = $q === '"' ? $a[3] : ($q === "'" ? $a[4] : $a[5]);
            $out[$name] = html_entity_decode((string) $value, ENT_QUOTES, 'UTF-8');
        }
        return $out;
    }

    /** The old loader, its CSS and window.RealtySoftConfig blocks. */
    private static function strip_scripts($text, SPMC_Report $r) {
        $patterns = [
            '/<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*(?:realtysoft|smartpropertywidget\.com)[^"\']*["\'][^>]*>\s*<\/script>/i',
            '/<link\b[^>]*\bhref\s*=\s*["\'][^"\']*(?:realtysoft|smartpropertywidget\.com)[^"\']*["\'][^>]*\/?>/i',
            '/<script\b[^>]*>(?:(?!<\/script>).)*?(?:RealtySoftConfig|__rsPrefetch|realtysoft-loader)(?:(?!<\/script>).)*<\/script>/is',
        ];
        foreach ($patterns as $p) {
            $text = preg_replace_callback($p, function ($m) use ($r) {
                $r->note('Old widget script removed — the SPM plugin loads SPM on every page.');
                $r->change('SPW', $m[0], '');
                return '';
            }, $text);
        }
        return $text;
    }
}
