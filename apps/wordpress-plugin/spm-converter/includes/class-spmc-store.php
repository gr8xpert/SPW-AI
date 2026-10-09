<?php
if (!defined('ABSPATH')) exit;

/**
 * Where old codes live, and changing them safely.
 *
 * Looks in post content (classic editor, Gutenberg, Divi, WPBakery), page
 * builder data (Elementor's _elementor_data JSON, Beaver Builder), other post
 * meta, and widget options. Structured values are decoded, converted string
 * by string and encoded again — never edited as raw text, which would break
 * serialized lengths and wipe the whole option.
 *
 * Every write keeps the value from before, so a run can be undone; an undo
 * skips anything edited since, instead of overwriting newer work.
 */
class SPMC_Store {
    // Underscore meta is private, so only these builder fields are read.
    const BUILDER_META = ['_elementor_data', '_fl_builder_data', '_fl_builder_draft'];
    const SKIP_TYPES = ['revision', 'nav_menu_item', 'customize_changeset', 'oembed_cache', 'custom_css', 'wp_global_styles', 'user_request'];

    public static function table() {
        global $wpdb;
        return $wpdb->prefix . 'spmc_log';
    }

    public static function install() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        $t = self::table();
        dbDelta("CREATE TABLE $t (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            run_id varchar(40) NOT NULL,
            kind varchar(10) NOT NULL,
            object_id varchar(191) NOT NULL,
            label text NOT NULL,
            before_value longtext NOT NULL,
            after_value longtext NOT NULL,
            status varchar(20) NOT NULL DEFAULT 'done',
            created_at datetime NOT NULL,
            PRIMARY KEY  (id),
            KEY run_id (run_id)
        ) " . $wpdb->get_charset_collate() . ';');
        update_option('spmc_db_version', SPMC_DB_VERSION, false);
    }

    /* ------------------------------------------------------------ finding */

    /** Rows that may hold an old code: [kind, id, label]. */
    public static function candidates() {
        global $wpdb;
        $like = self::like_sql();
        $types = "'" . implode("','", array_map('esc_sql', self::SKIP_TYPES)) . "'";
        $out = [];

        $posts = $wpdb->get_results(
            "SELECT ID, post_title, post_type, post_status FROM {$wpdb->posts}
             WHERE post_type NOT IN ($types) AND post_status NOT IN ('trash','auto-draft','inherit')
               AND (" . $like('post_content') . ') ORDER BY ID LIMIT 5000'
        );
        foreach ($posts as $p) {
            $out[] = ['kind' => 'post', 'id' => (string) $p->ID, 'post' => (int) $p->ID, 'label' => self::post_label($p, 'content')];
        }

        $builder = "'" . implode("','", self::BUILDER_META) . "'";
        $metas = $wpdb->get_results(
            "SELECT m.meta_id, m.meta_key, p.ID, p.post_title, p.post_type, p.post_status
             FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id
             WHERE (m.meta_key IN ($builder) OR m.meta_key NOT LIKE '\\_%')
               AND p.post_type NOT IN ($types) AND p.post_status NOT IN ('trash','auto-draft','inherit')
               AND (" . $like('m.meta_value') . ') ORDER BY m.meta_id LIMIT 5000'
        );
        foreach ($metas as $m) {
            $out[] = ['kind' => 'meta', 'id' => (string) $m->meta_id, 'post' => (int) $m->ID, 'label' => self::post_label($m, $m->meta_key)];
        }

        $options = $wpdb->get_col(
            "SELECT option_name FROM {$wpdb->options}
             WHERE (option_name LIKE 'widget\\_%' OR option_name LIKE 'theme\\_mods\\_%' OR option_name LIKE 'elementor\\_%')
               AND option_name NOT LIKE '\\_transient%' AND (" . $like('option_value') . ') LIMIT 500'
        );
        foreach ($options as $name) {
            $out[] = ['kind' => 'option', 'id' => $name, 'post' => 0, 'label' => 'Widgets / theme: ' . $name];
        }
        return $out;
    }

    /** A cheap first pass in SQL; the converter makes the real call. */
    private static function like_sql() {
        global $wpdb;
        $needles = ['data-rs-', 'rs-search-template', 'rs-listing-template', 'rs-map-search', 'rs\\_', 'property-detail-container',
            'realtysoft', 'smartpropertywidget', '[2020', '\\_search','footer\\_prop', 'ft\\_prop\\_style', 'property\\_slider\\_style'];
        return function ($col) use ($needles) {
            return implode(' OR ', array_map(function ($n) use ($col) {
                return $col . " LIKE '%" . esc_sql($n) . "%'";
            }, $needles));
        };
    }

    private static function post_label($p, $where) {
        $title = $p->post_title !== '' ? $p->post_title : '(no title)';
        $where = $where === 'content' ? 'content' : ($where === '_elementor_data' ? 'Elementor' : $where);
        return sprintf('%s — %s #%d (%s) · %s', $title, $p->post_type, $p->ID, $p->post_status, $where);
    }

    /* ------------------------------------------------------------ converting */

    /** Raw stored value, or null when the row is gone. */
    public static function read($kind, $id) {
        global $wpdb;
        if ($kind === 'post') return $wpdb->get_var($wpdb->prepare("SELECT post_content FROM {$wpdb->posts} WHERE ID = %d", $id));
        if ($kind === 'meta') return $wpdb->get_var($wpdb->prepare("SELECT meta_value FROM {$wpdb->postmeta} WHERE meta_id = %d", $id));
        if ($kind === 'option') return $wpdb->get_var($wpdb->prepare("SELECT option_value FROM {$wpdb->options} WHERE option_name = %s", $id));
        return null;
    }

    /** [new raw value, report]; the value is unchanged when nothing applies. */
    public static function convert_raw($raw, SPMC_Report $r) {
        $raw = (string) $raw;
        if (is_serialized($raw)) {
            $data = @unserialize($raw, ['allowed_classes' => false]);
            if ($data === false && $raw !== 'b:0;') return [$raw, $r];
            $new = spmc_carry(self::walk($data, $r), $r);
            return [$new === $data ? $raw : serialize($new), $r];
        }
        $t = ltrim($raw);
        if ($t !== '' && ($t[0] === '[' || $t[0] === '{')) {
            $data = json_decode($raw, true);
            if (is_array($data)) {
                $new = spmc_carry(self::walk($data, $r), $r);
                // Elementor stores wp_json_encode() output.
                return [$new === $data ? $raw : wp_json_encode($new), $r];
            }
        }
        return [spmc_carry(spmc_convert($raw, $r), $r), $r];
    }

    private static function walk($data, SPMC_Report $r) {
        if (is_string($data)) {
            // A JSON or serialized string inside (Elementor templates, ACF).
            if (is_serialized($data) || (strlen($data) > 1 && ($data[0] === '[' || $data[0] === '{') && is_array(json_decode($data, true)))) {
                return self::convert_raw($data, $r)[0];
            }
            return spmc_convert($data, $r);
        }
        if (is_array($data)) {
            foreach ($data as $k => $v) $data[$k] = self::walk($v, $r);
        }
        return $data;
    }

    public static function preview($kind, $id) {
        $raw = self::read($kind, $id);
        if ($raw === null) return null;
        [$new, $r] = self::convert_raw($raw, new SPMC_Report());
        return ['raw' => $raw, 'new' => $new, 'report' => $r];
    }

    /* ------------------------------------------------------------ writing */

    /** @return array{status:string, label?:string} */
    public static function apply($runId, $kind, $id, $label) {
        $p = self::preview($kind, $id);
        if (!$p) return ['status' => 'gone'];
        if ($p['new'] === $p['raw']) return ['status' => 'unchanged'];
        if (!self::write($kind, $id, $p['new'])) return ['status' => 'failed'];

        global $wpdb;
        $wpdb->insert(self::table(), [
            'run_id'       => $runId,
            'kind'         => $kind,
            'object_id'    => (string) $id,
            'label'        => $label,
            'before_value' => $p['raw'],
            'after_value'  => $p['new'],
            'status'       => 'done',
            'created_at'   => current_time('mysql'),
        // Formats given: WordPress types any "object_id" column as %d, which
        // would store an option name as 0.
        ], ['%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s']);
        return ['status' => 'done'];
    }

    /** Raw write (the value is already encoded), then clear caches. */
    private static function write($kind, $id, $value) {
        global $wpdb;
        if ($kind === 'post') {
            $ok = $wpdb->update($wpdb->posts, ['post_content' => $value], ['ID' => (int) $id]);
            clean_post_cache((int) $id);
            return $ok !== false;
        }
        if ($kind === 'meta') {
            $row = $wpdb->get_row($wpdb->prepare("SELECT post_id, meta_key FROM {$wpdb->postmeta} WHERE meta_id = %d", $id));
            if (!$row) return false;
            $ok = $wpdb->update($wpdb->postmeta, ['meta_value' => $value], ['meta_id' => (int) $id]);
            wp_cache_delete((int) $row->post_id, 'post_meta');
            clean_post_cache((int) $row->post_id);
            if ($row->meta_key === '_elementor_data') self::clear_elementor((int) $row->post_id);
            return $ok !== false;
        }
        if ($kind === 'option') {
            $ok = $wpdb->update($wpdb->options, ['option_value' => $value], ['option_name' => $id]);
            wp_cache_delete($id, 'options');
            wp_cache_delete('alloptions', 'options');
            wp_cache_delete('notoptions', 'options');
            return $ok !== false;
        }
        return false;
    }

    /** Elementor keeps rendered copies; they would still show the old code. */
    private static function clear_elementor($postId) {
        delete_post_meta($postId, '_elementor_element_cache');
        delete_post_meta($postId, '_elementor_css');
        if (did_action('elementor/loaded') && class_exists('\Elementor\Plugin')) {
            $files = \Elementor\Plugin::$instance->files_manager ?? null;
            if ($files && method_exists($files, 'clear_cache')) $files->clear_cache();
        }
    }

    /* ------------------------------------------------------------ history */

    public static function runs() {
        global $wpdb;
        $t = self::table();
        return $wpdb->get_results(
            "SELECT run_id, MIN(created_at) AS created_at, COUNT(*) AS items,
                    SUM(status = 'done') AS done, SUM(status = 'undone') AS undone, SUM(status = 'kept') AS kept
             FROM $t GROUP BY run_id ORDER BY MIN(id) DESC LIMIT 50",
            ARRAY_A
        );
    }

    public static function run_items($runId) {
        global $wpdb;
        $t = self::table();
        return $wpdb->get_results($wpdb->prepare("SELECT id, label, status FROM $t WHERE run_id = %s ORDER BY id", $runId), ARRAY_A);
    }

    /** Puts back what a run changed, unless the content was edited since. */
    public static function undo($runId) {
        global $wpdb;
        $t = self::table();
        $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE run_id = %s AND status = 'done' ORDER BY id DESC", $runId));
        $out = ['undone' => 0, 'kept' => []];
        foreach ($rows as $row) {
            $now = self::read($row->kind, $row->object_id);
            if ($now !== $row->after_value) {
                $wpdb->update($t, ['status' => 'kept'], ['id' => $row->id]);
                $out['kept'][] = $row->label;
                continue;
            }
            if (self::write($row->kind, $row->object_id, $row->before_value)) {
                $wpdb->update($t, ['status' => 'undone'], ['id' => $row->id]);
                $out['undone']++;
            }
        }
        return $out;
    }
}
