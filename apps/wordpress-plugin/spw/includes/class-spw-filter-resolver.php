<?php
if (!defined('ABSPATH')) exit;

/**
 * Turns what a shortcode says into the ids the widget filters by.
 *
 * IDs are the reliable way, because a name can exist more than once — an area,
 * a municipality and a town can all be called "Marbella". Copy ids from
 * SPM → Filter IDs.
 *
 * A name is accepted only when it matches exactly ONE entry in the client's
 * own list. When it matches several, nothing is guessed: the filter is
 * dropped and the editor is told which ids to choose from.
 *
 * Lists come from the cache the plugin already keeps for the search dropdowns
 * (uploads/spw-data/bundle-<lang>.json), so there is no extra API call.
 */
class SPW_Filter_Resolver {
    private static $maps = [];
    private static $rows = [];

    /**
     * @return array{id:int, error:string} id 0 with a reason when it can't be
     *         resolved to exactly one entry.
     */
    public static function resolve($kind, $value) {
        $value = trim((string) $value);
        if ($value === '') return ['id' => 0, 'error' => ''];

        if (ctype_digit($value)) {
            $id = (int) $value;
            $rows = self::rows($kind);
            // An id that isn't in the client's list would silently show nothing.
            if ($rows && !isset($rows[$id])) {
                return ['id' => 0, 'error' => sprintf('%s ID %d is not in your list', $kind, $id)];
            }
            return ['id' => $id, 'error' => ''];
        }

        $matches = self::map($kind)[self::normalise($value)] ?? [];
        if (count($matches) === 1) return ['id' => (int) $matches[0], 'error' => ''];
        if (!$matches) {
            return ['id' => 0, 'error' => sprintf('no %s called "%s"', $kind, $value)];
        }
        $labels = array_map(function ($id) use ($kind) { return self::label($kind, $id); }, $matches);
        return [
            'id' => 0,
            'error' => sprintf('"%s" matches %d entries — use the ID: %s', $value, count($matches), implode(', ', $labels)),
        ];
    }

    /** Just the id (0 when it can't be resolved). */
    public static function id($kind, $value) {
        return self::resolve($kind, $value)['id'];
    }

    /** "12, pool, 44" → "12,31,44"; second return value holds any problems. */
    public static function ids($kind, $value) {
        $ids = [];
        $errors = [];
        foreach (explode(',', (string) $value) as $part) {
            if (trim($part) === '') continue;
            $r = self::resolve($kind, $part);
            if ($r['id']) $ids[] = $r['id'];
            elseif ($r['error']) $errors[] = $r['error'];
        }
        return [implode(',', array_unique($ids)), $errors];
    }

    /** "Marbella (town in Malaga) = 1" — so the editor can pick the right id. */
    private static function label($kind, $id) {
        $rows = self::rows($kind);
        $row = $rows[$id] ?? null;
        if (!$row) return (string) $id;
        $what = [];
        if (!empty($row['level'])) $what[] = $row['level'];
        if (!empty($row['category'])) $what[] = $row['category'];
        $parentId = (int) ($row['parentId'] ?? 0);
        if ($parentId && isset($rows[$parentId])) $what[] = 'in ' . self::plain($rows[$parentId]['name'] ?? '');
        return sprintf('%d (%s)', $id, $what ? implode(', ', $what) : self::plain($row['name'] ?? ''));
    }

    /** id => row, for one list. */
    private static function rows($kind) {
        if (isset(self::$rows[$kind])) return self::$rows[$kind];
        $file = ['location' => 'locations', 'property type' => 'types', 'feature' => 'features'][$kind] ?? null;
        $rows = [];
        if ($file && class_exists('SPW_Data_Sync')) {
            foreach ((array) SPW_Data_Sync::instance()->read_list($file) as $row) {
                if (is_array($row) && !empty($row['id'])) $rows[(int) $row['id']] = $row;
            }
        }
        self::$rows[$kind] = $rows;
        return $rows;
    }

    /** normalised name => [ids] */
    private static function map($kind) {
        if (isset(self::$maps[$kind])) return self::$maps[$kind];
        $map = [];
        foreach (self::rows($kind) as $id => $row) {
            foreach ([$row['name'] ?? '', $row['slug'] ?? ''] as $label) {
                $key = self::normalise(self::plain($label));
                if ($key === '') continue;
                if (!isset($map[$key])) $map[$key] = [];
                if (!in_array($id, $map[$key], true)) $map[$key][] = $id;
            }
        }
        self::$maps[$kind] = $map;
        return $map;
    }

    /** Names may arrive as a plain string or as a per-language map. */
    private static function plain($value) {
        if (is_array($value)) {
            $value = $value['en'] ?? reset($value);
        }
        return is_string($value) ? $value : '';
    }

    private static function normalise($value) {
        $value = remove_accents((string) $value);
        return preg_replace('/[^a-z0-9]+/', '-', strtolower(trim($value)));
    }
}
