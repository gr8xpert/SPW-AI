<?php
if (!defined('ABSPATH')) exit;

/**
 * Old ID → SPM ID for locations, property types and features.
 *
 * Old codes hold the IDs of the old system (Inmotech and SPW share them: both
 * read the agency's CRM), and SPM numbers its lists itself, so an ID can't be
 * copied across. Each old ID is matched by name — and, when SPM has the name
 * more than once (an area and a town both called "Marbella"), by its parent's
 * name too. What can't be matched for sure is left for the admin to pick on
 * the converter page (stored in spmc_id_map, which always wins).
 *
 * Old lists come from the old SPW plugin's local copy (uploads/spw-data/) when
 * it is there, else from the old widget server by the site's domain. SPM lists
 * come from the SPM plugin's own copy, else from the SPM API with its key.
 */
class SPMC_Lists {
    const KINDS = ['location', 'type', 'feature'];

    private static $old = [];
    private static $new = [];
    private static $keys = [];

    /* ------------------------------------------------------------ matching */

    /**
     * @return array{id:int, how:string, candidates:int[]}
     *   how: map (picked by the admin), skip (admin left it out), name,
     *   parent, close (near-miss name), none (no match), many (several SPM
     *   entries, see candidates), nolist (no old list).
     */
    public static function match($kind, $oldId) {
        $oldId = (int) $oldId;
        $picked = self::picked($kind);
        if (isset($picked[$oldId])) {
            // -1: the admin chose to leave this filter out.
            if ((int) $picked[$oldId] === -1) return ['id' => 0, 'how' => 'skip', 'candidates' => []];
            return ['id' => (int) $picked[$oldId], 'how' => 'map', 'candidates' => []];
        }

        $old = self::old_rows($kind);
        if (!$old) return ['id' => 0, 'how' => 'nolist', 'candidates' => []];
        $row = $old[$oldId] ?? null;
        if (!$row) return ['id' => 0, 'how' => 'none', 'candidates' => []];

        $found = self::by_name($kind)[self::key($row['name'])] ?? [];
        if (count($found) === 1) return ['id' => $found[0], 'how' => 'name', 'candidates' => []];
        if (!$found) {
            // Nearly the same name ("Apartments" / "Apartment", a typo):
            // used, but shown to the admin to check.
            $close = self::closest($kind, $row['name']);
            return $close
                ? ['id' => $close, 'how' => 'close', 'candidates' => []]
                : ['id' => 0, 'how' => 'none', 'candidates' => []];
        }

        // Same name more than once: keep the ones whose parent has the old
        // parent's name.
        $parent = $row['parent'] && isset($old[$row['parent']]) ? self::key($old[$row['parent']]['name']) : '';
        if ($parent !== '') {
            $new = self::new_rows($kind);
            $same = array_values(array_filter($found, function ($id) use ($new, $parent) {
                $p = $new[$id]['parent'] ?? 0;
                return $p && isset($new[$p]) && in_array($parent, $new[$p]['keys'], true);
            }));
            if (count($same) === 1) return ['id' => $same[0], 'how' => 'parent', 'candidates' => []];
        }
        return ['id' => 0, 'how' => 'many', 'candidates' => $found];
    }

    /** Admin's own picks: kind => [old id => SPM id]. */
    public static function picked($kind = null) {
        $all = get_option('spmc_id_map', []);
        if (!is_array($all)) $all = [];
        return $kind === null ? $all : (array) ($all[$kind] ?? []);
    }

    public static function save_picks($kind, array $pairs) {
        $all = self::picked();
        $mine = (array) ($all[$kind] ?? []);
        foreach ($pairs as $old => $new) {
            $old = (int) $old;
            $new = (int) $new;
            if ($old <= 0) continue;
            if ($new > 0 || $new === -1) $mine[$old] = $new;
            else unset($mine[$old]);
        }
        $all[$kind] = $mine;
        update_option('spmc_id_map', $all, false);
    }

    /** "Marbella (in Málaga)" for the tables. */
    public static function label($side, $kind, $id) {
        $rows = $side === 'old' ? self::old_rows($kind) : self::new_rows($kind);
        $row = $rows[(int) $id] ?? null;
        if (!$row) return '';
        $parent = $row['parent'] && isset($rows[$row['parent']]) ? $rows[$row['parent']]['name'] : '';
        return $parent !== '' ? sprintf('%s (in %s)', $row['name'], $parent) : $row['name'];
    }

    public static function counts() {
        $out = [];
        foreach (self::KINDS as $kind) {
            $out[$kind] = ['old' => count(self::old_rows($kind)), 'new' => count(self::new_rows($kind))];
        }
        $out['old_source'] = get_transient('spmc_old_source') ?: self::local_old_source();
        return $out;
    }

    /** All SPM rows of a kind, for the "pick one" lists: id => label. */
    public static function choices($kind) {
        $out = [];
        foreach (array_keys(self::new_rows($kind)) as $id) $out[$id] = self::label('new', $kind, $id);
        asort($out, SORT_NATURAL | SORT_FLAG_CASE);
        return $out;
    }

    public static function forget() {
        foreach (self::KINDS as $kind) delete_transient('spmc_old_' . $kind);
        delete_transient('spmc_old_source');
        self::$old = self::$new = self::$keys = [];
    }

    /* ------------------------------------------------------------ old side */

    /** id => [name, parent] */
    public static function old_rows($kind) {
        if (isset(self::$old[$kind])) return self::$old[$kind];
        $rows = self::local_old($kind);
        if (!$rows) {
            $cached = get_transient('spmc_old_' . $kind);
            if (is_array($cached)) {
                $rows = $cached;
            } else {
                $rows = self::remote_old($kind);
                // An empty answer is cached briefly, so a page load doesn't
                // wait on a server that has no list for this site.
                set_transient('spmc_old_' . $kind, $rows, $rows ? DAY_IN_SECONDS : 10 * MINUTE_IN_SECONDS);
            }
        }
        return self::$old[$kind] = $rows;
    }

    /** The old SPW plugin's copy in uploads/spw-data/. */
    private static function local_old($kind) {
        $dir = trailingslashit(wp_upload_dir()['basedir']) . 'spw-data/';
        $patterns = [
            'location' => ['locations.json'],
            'type'     => ['property-types-en_US.json', 'property-types-en_GB.json', 'property-types.json', 'property-types-*.json'],
            'feature'  => ['features-en_US.json', 'features-en_GB.json', 'features.json', 'features-*.json'],
        ][$kind];
        foreach ($patterns as $p) {
            foreach ((array) glob($dir . $p) as $file) {
                $rows = self::rows_from(json_decode((string) @file_get_contents($file), true), 'old');
                if ($rows) return $rows;
            }
        }
        return [];
    }

    private static function local_old_source() {
        $dir = trailingslashit(wp_upload_dir()['basedir']) . 'spw-data/';
        return file_exists($dir . 'locations.json') ? 'this site (old SPW plugin files)' : '';
    }

    public static function old_domain() {
        $saved = trim((string) get_option('spmc_old_domain', ''));
        if ($saved !== '') return $saved;
        return (string) wp_parse_url(home_url(), PHP_URL_HOST);
    }

    /** The old widget server, which knows the client by domain. */
    private static function remote_old($kind) {
        $endpoints = [
            'location' => ['v2/location', 'v1/location'],
            'type'     => ['v1/property_types'],
            'feature'  => ['v1/property_features'],
        ][$kind];
        $domain = self::old_domain();
        $domains = array_unique([$domain, preg_replace('/^www\./', '', $domain), 'www.' . preg_replace('/^www\./', '', $domain)]);
        foreach ($domains as $d) {
            foreach ($endpoints as $endpoint) {
                $url = add_query_arg([
                    '_endpoint' => $endpoint,
                    '_domain'   => $d,
                    '_lang'     => 'en_US',
                    'page'      => 1,
                    'limit'     => 5000,
                ], SPMC_V3_PROXY);
                $resp = wp_remote_get($url, ['timeout' => 25, 'headers' => ['Accept' => 'application/json']]);
                if (is_wp_error($resp) || wp_remote_retrieve_response_code($resp) !== 200) continue;
                $rows = self::rows_from(json_decode(wp_remote_retrieve_body($resp), true), 'old');
                if ($rows) {
                    set_transient('spmc_old_source', 'old widget server (' . $d . ')', DAY_IN_SECONDS);
                    return $rows;
                }
            }
        }
        return [];
    }

    /* ------------------------------------------------------------ SPM side */

    /** id => [name, parent, keys (every name it goes by)] */
    public static function new_rows($kind) {
        if (isset(self::$new[$kind])) return self::$new[$kind];
        $list = null;
        $file = ['location' => 'locations', 'type' => 'types', 'feature' => 'features'][$kind];
        if (class_exists('SPM_Data_Sync')) $list = SPM_Data_Sync::instance()->read_list($file);
        if (!$list && class_exists('SPM_API_Client')) {
            $path = ['location' => 'api/v1/locations', 'type' => 'api/v1/property-types', 'feature' => 'api/v1/features'][$kind];
            $resp = SPM_API_Client::get($path, [], 25);
            if (!is_wp_error($resp)) $list = $resp;
        }
        return self::$new[$kind] = self::rows_from($list, 'new');
    }

    public static function spm_ready() {
        return class_exists('SPM_Plugin') && SPM_Plugin::get('api_key');
    }

    /* ------------------------------------------------------------ helpers */

    /** Rows from any of the list shapes: [..], {data:[..]}, {data:{data:[..]}}. */
    private static function rows_from($json, $side) {
        if (!is_array($json)) return [];
        while (isset($json['data']) && is_array($json['data'])) $json = $json['data'];
        $rows = [];
        $walk = function ($items, $parentId) use (&$walk, &$rows, $side) {
            foreach ((array) $items as $item) {
                if (!is_array($item) || empty($item['id'])) continue;
                $id = (int) $item['id'];
                $parent = $item['parentId'] ?? ($item['parent_id'] ?? $parentId);
                if (is_array($parent)) $parent = $parent[0] ?? ($parent['id'] ?? 0); // Odoo [id, name]
                $names = self::names($item);
                $rows[$id] = [
                    'name'   => $names[0] ?? ('#' . $id),
                    'parent' => (int) $parent,
                    'keys'   => array_values(array_unique(array_filter(array_map([__CLASS__, 'key'], $names)))),
                ];
                if (!empty($item['children'])) $walk($item['children'], $id);
            }
        };
        $walk($json, 0);
        return $rows;
    }

    /** Every name a row goes by, display name first. */
    private static function names(array $item) {
        $out = [];
        foreach (['name', 'displayName', 'display_name', 'label', 'slug', 'key', 'aliases'] as $field) {
            $v = $item[$field] ?? null;
            if (is_string($v)) $out[] = $v;
            elseif (is_array($v)) {
                if (isset($v['en']) && is_string($v['en'])) $out[] = $v['en'];
                foreach ($v as $x) if (is_string($x)) $out[] = $x;
            }
        }
        return array_values(array_filter($out, function ($s) { return trim($s) !== ''; }));
    }

    /** normalised name => [SPM ids] */
    private static function by_name($kind) {
        if (isset(self::$keys[$kind])) return self::$keys[$kind];
        $map = [];
        foreach (self::new_rows($kind) as $id => $row) {
            foreach ($row['keys'] as $k) {
                if (!isset($map[$k])) $map[$k] = [];
                if (!in_array($id, $map[$k], true)) $map[$k][] = $id;
            }
        }
        return self::$keys[$kind] = $map;
    }

    /** The one SPM entry whose name is a near miss, or 0 (none, or a tie). */
    private static function closest($kind, $name) {
        $want = self::key($name);
        if (strlen($want) < 4) return 0;
        $stem = function ($k) { return preg_replace('/(es|s)$/', '', $k); };
        $best = [];
        $bestScore = PHP_INT_MAX;
        foreach (self::by_name($kind) as $k => $ids) {
            if (count($ids) !== 1) continue;
            $score = $stem($k) === $stem($want) ? 0 : levenshtein($k, $want);
            if ($score > max(1, (int) floor(strlen($want) / 6))) continue;
            if ($score < $bestScore) {
                $bestScore = $score;
                $best = [$ids[0]];
            } elseif ($score === $bestScore && !in_array($ids[0], $best, true)) {
                $best[] = $ids[0];
            }
        }
        return count($best) === 1 ? $best[0] : 0;
    }

    public static function key($value) {
        $value = remove_accents(html_entity_decode((string) $value, ENT_QUOTES, 'UTF-8'));
        return trim(preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($value))), '-');
    }
}
