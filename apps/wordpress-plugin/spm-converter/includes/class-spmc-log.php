<?php
if (!defined('ABSPATH')) exit;

/**
 * A run log that outlives the history table.
 *
 * The table (SPMC_Store) holds full before/after values so a run can be
 * undone, but it goes when the plugin is deleted or the database is restored
 * from a copy. Every run therefore also writes one JSON line per place to
 *
 *   uploads/spm-converter-logs/run-<run id>-<site token>.jsonl
 *
 * — what was changed (old code → new code, with the converter's notes) and a
 * checksum of the value before and after, not the whole page. The folder
 * refuses web access on Apache; on nginx the random token in the name keeps
 * the files unguessable. Deleting the plugin leaves the logs.
 *
 * Read them with `wp spm-converter runs` / `wp spm-converter log <run>`.
 */
class SPMC_Log {
    const DIR = 'spm-converter-logs';
    /** admin | cli — who started the run. */
    public static $source = 'admin';

    public static function dir() {
        return trailingslashit(wp_upload_dir()['basedir']) . self::DIR . '/';
    }

    private static function token() {
        $t = (string) get_option('spmc_log_token', '');
        if (!preg_match('/^[a-z0-9]{16}$/', $t)) {
            $t = strtolower(wp_generate_password(16, false, false));
            update_option('spmc_log_token', $t, false);
        }
        return $t;
    }

    private static function ensure_dir() {
        $dir = self::dir();
        if (!is_dir($dir)) wp_mkdir_p($dir);
        if (!is_dir($dir)) return false;
        if (!file_exists($dir . 'index.php')) @file_put_contents($dir . 'index.php', "<?php // Silence is golden\n");
        if (!file_exists($dir . '.htaccess')) {
            @file_put_contents($dir . '.htaccess', "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
        }
        return wp_is_writable($dir);
    }

    /** The file for a run, or '' when none is there yet. */
    public static function file($runId) {
        if (!self::valid_run($runId)) return '';
        $found = glob(self::dir() . 'run-' . $runId . '-*.jsonl');
        return $found ? $found[0] : '';
    }

    public static function valid_run($runId) {
        return is_string($runId) && preg_match('/^\d{8}-\d{6}-[A-Za-z0-9]{6}$/', $runId);
    }

    /** One line; the run's header line comes first, written with the first entry. */
    public static function write($runId, array $entry) {
        if (!self::valid_run($runId) || !self::ensure_dir()) return false;
        $path = self::file($runId);
        $lines = '';
        if ($path === '') {
            $path = self::dir() . 'run-' . $runId . '-' . self::token() . '.jsonl';
            $user = function_exists('wp_get_current_user') ? wp_get_current_user() : null;
            $lines .= wp_json_encode([
                'type'      => 'run',
                'run'       => $runId,
                'at'        => gmdate('c'),
                'source'    => self::$source,
                'user'      => $user && $user->exists() ? $user->user_login : '',
                'site'      => home_url('/'),
                'converter' => SPMC_VERSION,
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
        }
        $entry['at'] = gmdate('c');
        $lines .= wp_json_encode($entry, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n";
        return @file_put_contents($path, $lines, FILE_APPEND | LOCK_EX) !== false;
    }

    /** A place a run looked at: what changed in it, by code. */
    public static function item($runId, $kind, $id, $label, $status, $before = null, $after = null, ?SPMC_Report $r = null) {
        $entry = ['type' => 'item', 'kind' => $kind, 'id' => (string) $id, 'label' => $label, 'status' => $status];
        if ($before !== null) {
            $entry['before_sha1'] = sha1((string) $before);
            $entry['after_sha1'] = sha1((string) $after);
            $entry['before_bytes'] = strlen((string) $before);
            $entry['after_bytes'] = strlen((string) $after);
        }
        if ($r) {
            $entry['changes'] = array_map(function ($c) {
                return [
                    'system' => $c['system'],
                    'before' => self::code($c['before']),
                    'after'  => self::code($c['after']),
                    'notes'  => $c['notes'],
                ];
            }, $r->changes);
        }
        return self::write($runId, $entry);
    }

    /** Old widget scripts may carry the old key: only say they went. */
    private static function code($s) {
        $s = (string) $s;
        if (stripos($s, '<script') !== false) return '(old widget script)';
        return strlen($s) > 2000 ? substr($s, 0, 2000) . ' …' : $s;
    }

    /** @return array<int, array> each run's header line plus counts, newest first. */
    public static function runs() {
        $out = [];
        foreach ((array) glob(self::dir() . 'run-*.jsonl') as $path) {
            $rows = self::rows_from($path);
            if (!$rows || ($rows[0]['type'] ?? '') !== 'run') continue;
            $head = $rows[0];
            $counts = [];
            foreach (array_slice($rows, 1) as $row) {
                $k = ($row['type'] ?? '') === 'item' ? (string) ($row['status'] ?? '') : (string) ($row['type'] ?? '');
                $counts[$k] = ($counts[$k] ?? 0) + 1;
            }
            $head['counts'] = $counts;
            $head['file'] = $path;
            $out[] = $head;
        }
        usort($out, function ($a, $b) { return strcmp($b['run'], $a['run']); });
        return $out;
    }

    /** Every line of one run. */
    public static function rows($runId) {
        $path = self::file($runId);
        return $path === '' ? [] : self::rows_from($path);
    }

    private static function rows_from($path) {
        $rows = [];
        foreach ((array) @file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $row = json_decode($line, true);
            if (is_array($row)) $rows[] = $row;
        }
        return $rows;
    }
}
