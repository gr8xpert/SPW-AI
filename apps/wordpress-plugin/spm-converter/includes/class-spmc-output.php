<?php
if (!defined('ABSPATH')) exit;

/**
 * Old filters → SPM block attributes (data-spm-*), the same for both old
 * systems. Callers first put what the old code says into one plain shape:
 *
 *   location, type, features  old IDs (lists)
 *   for                       listing type, old or new spelling
 *   beds, baths, price, built, plot   [min, max]
 *   ref, sort, limit, columns, interval, variation
 *   featured, own, own_first, standalone, fixed, autoplay   true when set
 */
class SPMC_Output {
    const LISTING_TYPES = [
        'resale' => 'sale', 'sale' => 'sale', 'for-sale' => 'sale', 'buy' => 'sale',
        'development' => 'new-development', 'new-development' => 'new-development',
        'offplan' => 'new-development', 'off-plan' => 'new-development', 'new-build' => 'new-development',
        'long-rental' => 'rent', 'long-term' => 'rent', 'rent' => 'rent', 'rental' => 'rent', 'for-rent' => 'rent',
        'short-rental' => 'holiday', 'short-term' => 'holiday', 'holiday' => 'holiday', 'holiday-rent' => 'holiday',
    ];

    // Old sort names (V1/V3 CRM fields, Inmotech) → the words SPM documents.
    const SORTS = [
        'create-date-desc' => 'newest', 'newest' => 'newest', 'latest' => 'newest',
        'create-date' => 'oldest', 'create-date-asc' => 'oldest', 'oldest' => 'oldest',
        'last-date-desc' => 'updated', 'write-date-desc' => 'updated', 'updated' => 'updated',
        'last-date' => 'write_date', 'write-date' => 'write_date', 'last-date-asc' => 'write_date', 'write-date-asc' => 'write_date',
        'list-price' => 'price_asc', 'list-price-asc' => 'price_asc', 'price-asc' => 'price_asc', 'price' => 'price_asc',
        'list-price-desc' => 'price_desc', 'price-desc' => 'price_desc',
        'is-featured-desc' => 'featured', 'featured' => 'featured',
        'location-id' => 'location', 'location' => 'location',
        'ownfirst' => 'own', 'own-first' => 'own',
    ];

    /** @return array<string,string> data-spm-* name (without prefix) => value */
    public static function attrs(array $f, SPMC_Report $r, $allowFilters = true) {
        $out = [];
        if (!$allowFilters) {
            // SPM search forms take no preset filters; the page's results
            // block gets them instead (see spmc_carry).
            $own = ['variation', 'columns', 'autoplay', 'interval', 'limit', 'standalone'];
            $rest = array_diff_key(array_filter($f, [__CLASS__, 'present']), array_flip($own));
            if ($rest) {
                $carried = self::attrs($rest, $r, true);
                if ($carried) $r->carry[] = ['attrs' => $carried, 'change' => count($r->changes)];
            }
            $f = array_intersect_key($f, array_flip(['variation', 'columns']));
        }

        foreach (['location' => 'location', 'type' => 'type', 'features' => 'feature'] as $field => $kind) {
            if (empty($f[$field])) continue;
            $ids = self::map_ids($kind, (array) $f[$field], $r);
            if ($ids) $out[$field] = implode(',', $ids);
        }

        if (!empty($f['for'])) {
            $all = array_filter(array_map('trim', explode(',', (string) $f['for'])));
            $mapped = [];
            foreach ($all as $v) {
                $m = self::LISTING_TYPES[SPMC_Lists::key($v)] ?? '';
                if ($m) $mapped[$m] = true;
                else $r->note(sprintf('Listing type "%s" is unknown — dropped.', $v));
            }
            $mapped = array_keys($mapped);
            if ($mapped) $out['for'] = $mapped[0];
            if (count($mapped) > 1) {
                $r->note(sprintf('SPM shows one listing type per block — kept "%s", dropped %s.', $mapped[0], implode(', ', array_slice($mapped, 1))));
            }
        }

        self::range($out, $f, 'beds', 'beds', 'max-bedrooms');
        self::range($out, $f, 'baths', 'baths', 'max-bathrooms');
        if (!empty($f['price'][0])) $out['over'] = (string) (int) $f['price'][0];
        if (!empty($f['price'][1])) $out['under'] = (string) (int) $f['price'][1];
        if (!empty($f['built'][0])) $out['min-build-size'] = (string) (int) $f['built'][0];
        if (!empty($f['built'][1])) $out['max-build-size'] = (string) (int) $f['built'][1];
        if (!empty($f['plot'][0])) $out['min-plot-size'] = (string) (int) $f['plot'][0];
        if (!empty($f['plot'][1])) $out['max-plot-size'] = (string) (int) $f['plot'][1];

        if (!empty($f['ref'])) $out['ref'] = implode(',', array_filter(preg_split('/[\s,;]+/', (string) $f['ref'])));
        if (!empty($f['featured'])) $out['featured'] = 'yes';
        if (!empty($f['own'])) $out['own'] = 'yes';

        $sort = '';
        if (!empty($f['sort'])) {
            $sort = self::SORTS[SPMC_Lists::key($f['sort'])] ?? '';
            if ($sort === '') $r->note(sprintf('Sort "%s" is unknown — the client\'s default order is used.', $f['sort']));
        }
        if (!empty($f['own_first'])) {
            if ($sort && $sort !== 'own') $r->note(sprintf('Old code asked for own listings first AND sort "%s"; SPM does one order — kept own first.', $sort));
            $sort = 'own';
        }
        if ($sort === 'own') $out['own-first'] = 'yes';
        elseif ($sort) $out['sort'] = $sort;

        foreach (['limit', 'columns', 'interval', 'variation'] as $n) {
            if (!empty($f[$n]) && (int) $f[$n] > 0) $out[$n] = (string) (int) $f[$n];
        }
        if (!empty($f['autoplay'])) $out['autoplay'] = 'yes';
        if (!empty($f['standalone'])) $out['standalone'] = 'yes';
        if (!empty($f['fixed'])) $out['fixed'] = 'yes';
        return $out;
    }

    /**
     * Old per-page counts on a page's main results: in SPM a limit makes a
     * block a short list without paging, so it is left out there (SPM pages
     * by the dashboard's results-per-page). Short lists keep it.
     */
    public static function page_size(array &$f, $widget, SPMC_Report $r) {
        $results = $widget === 'site-listing' || strpos($widget, 'listing-template-') === 0;
        if (!$results || empty($f['limit']) || !empty($f['standalone']) || !empty($f['ref'])) return;
        $r->note(sprintf('%d per page left out — in SPM that would turn off paging; results follow the per-page number set in the SPM dashboard.', (int) $f['limit']));
        unset($f['limit']);
    }

    /** ' data-spm-widget="x" data-spm-a="b"' */
    public static function attr_string($widget, array $attrs) {
        $s = ' data-spm-widget="' . esc_attr($widget) . '"';
        foreach ($attrs as $k => $v) $s .= ' data-spm-' . $k . '="' . esc_attr($v) . '"';
        return $s;
    }

    public static function div($widget, array $attrs) {
        return '<div class="spm-block"' . self::attr_string($widget, $attrs) . '></div>';
    }

    /** Old IDs → SPM IDs; unmatched ones are reported and left out. */
    private static function map_ids($kind, array $old, SPMC_Report $r) {
        $out = [];
        $miss = [];
        foreach ($old as $v) {
            foreach (preg_split('/[\s,;|]+/', (string) $v) as $id) {
                if (!ctype_digit($id) || (int) $id === 0) {
                    if (trim($id) !== '') $miss[] = $id;
                    continue;
                }
                $id = (int) $id;
                $r->used[$kind][$id] = true;
                $m = SPMC_Lists::match($kind, $id);
                if ($m['id']) $out[$m['id']] = true;
                elseif ($m['how'] !== 'skip') {
                    $r->unmatched[$kind][$id] = true;
                    $miss[] = $id;
                }
            }
        }
        if ($miss) {
            $r->note(sprintf('Old %s %s: not matched yet — left out unless you pick it under "Needs your help".', $kind, implode(', ', $miss)));
        }
        return array_keys($out);
    }

    private static function range(array &$out, array $f, $field, $attr, $maxAttr) {
        $min = (int) ($f[$field][0] ?? 0);
        $max = (int) ($f[$field][1] ?? 0);
        if ($min && $max) $out[$attr] = $min . '-' . $max;
        elseif ($min) $out[$attr] = (string) $min;
        elseif ($max) $out[$maxAttr] = (string) $max;
    }

    // Names an old value may use for the three ID lists and the listing type,
    // after name() — the old widget's, Inmotech's and the SPM API's spellings.
    const NESTED = [
        'location' => 'location', 'locations' => 'location', 'location-id' => 'location', 'location-ids' => 'location',
        'area' => 'location', 'town' => 'location',
        'type' => 'type', 'types' => 'type', 'type-id' => 'type', 'type-ids' => 'type', 'property-type' => 'type',
        'property-types' => 'type', 'property-type-id' => 'type', 'property-type-ids' => 'type',
        'features' => 'features', 'feature' => 'features', 'feature-id' => 'features', 'feature-ids' => 'features',
        'for' => 'for', 'listing-type' => 'for', 'listing-types' => 'for',
    ];

    /**
     * A filter value that names other filters inside it: a typo on the old
     * site (data-rs-location="features=163"), several filters run together
     * ("72&features=163") or a pasted search address ("?locationId=72&type=5").
     * Before 1.0.3 such a value went whole into the attribute it was written
     * on, matched nothing, and the block lost both filters.
     *
     * @return array<string, string[]> name => values, in order; '' holds the
     *   values that belong to the attribute itself. A value without "=" comes
     *   back as ['' => [value]].
     */
    public static function pairs($value) {
        $value = trim(str_ireplace('&amp;', '&', (string) $value));
        if (strpos($value, '=') === false) return ['' => [$value]];
        $q = strpos($value, '?');
        if ($q !== false) $value = substr($value, $q + 1);
        $out = [];
        $name = '';
        foreach (preg_split('/[&;,\s]+/', $value, -1, PREG_SPLIT_NO_EMPTY) as $tok) {
            $tok = rawurldecode($tok);
            if (strpos($tok, '=') !== false) {
                [$k, $tok] = explode('=', $tok, 2);
                $name = self::name($k);
            }
            $tok = trim($tok, "\"' ");
            if ($tok === '') continue;
            $out[$name][] = $tok;
        }
        return $out;
    }

    /** "propertyTypeIds" / "property_type_ids" / "features[]" → "property-type-ids" / "features". */
    public static function name($raw) {
        $k = preg_replace('/\[\]$/', '', trim((string) $raw));
        $k = preg_replace('/([a-z0-9])([A-Z])/', '$1-$2', $k);
        $k = strtolower(str_replace('_', '-', $k));
        return preg_replace('/^data-(?:rs|spm)-/', '', $k);
    }

    public static function present($v) {
        return !($v === null || $v === '' || $v === false || $v === [] || $v === [0, 0]);
    }
}
