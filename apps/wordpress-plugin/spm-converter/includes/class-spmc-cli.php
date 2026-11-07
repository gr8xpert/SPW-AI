<?php
if (!defined('ABSPATH')) exit;

/**
 * The converter from the command line (WP-CLI), for scripted moves:
 *
 *   wp spm-converter scan [--format=table|csv|json] [--codes]   what would change (writes nothing)
 *   wp spm-converter ids [--format=…]                            old IDs in use and their SPM match
 *   wp spm-converter match <location|type|feature> <old-id>...   one old ID → SPM ID
 *   wp spm-converter try [<file>]                                convert pasted code (file or STDIN)
 *   wp spm-converter convert [--yes] [--exclude=…] [--exclude-file=…] [--only=…]
 *   wp spm-converter runs | log <run-id> [--format=…] | undo <run-id> --yes
 *
 * convert without --yes is a dry run. --exclude / --only take post IDs or
 * site paths (/about-us/), comma separated; --exclude-file one per line.
 */
class SPMC_CLI {
    const FORMATS = ['table', 'csv', 'json', 'yaml'];

    public static function register() {
        WP_CLI::add_command('spm-converter', __CLASS__);
    }

    /**
     * Lists every place with old codes and what converting it would do. Writes nothing.
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     *
     * [--codes]
     * : One row per old code (before → after) instead of one per place.
     */
    public function scan($args, $assoc) {
        $rows = [];
        foreach ($this->places() as $p) {
            if (!$p['report']->changes) continue;
            if (!empty($assoc['codes'])) {
                foreach ($p['report']->changes as $c) {
                    $rows[] = ['kind' => $p['kind'], 'id' => $p['id'], 'post' => $p['post'], 'system' => $c['system'],
                        'before' => $c['before'], 'after' => $c['after'], 'notes' => implode(' | ', $c['notes'])];
                }
                continue;
            }
            $rows[] = ['kind' => $p['kind'], 'id' => $p['id'], 'post' => $p['post'], 'label' => $p['label'],
                'changes' => $p['changed'] ? 'yes' : 'no', 'codes' => count($p['report']->changes),
                'warnings' => implode(' | ', $p['report']->warnings())];
        }
        $fields = !empty($assoc['codes']) ? ['kind', 'id', 'post', 'system', 'before', 'after', 'notes'] : ['kind', 'id', 'post', 'label', 'changes', 'codes', 'warnings'];
        $this->out($rows, $fields, $assoc);
    }

    /**
     * Old location, type and feature IDs the site's codes use, with their SPM match.
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     */
    public function ids($args, $assoc) {
        $all = new SPMC_Report();
        foreach ($this->places() as $p) $all->merge($p['report']);
        $rows = [];
        foreach (SPMC_Lists::KINDS as $kind) {
            foreach (array_keys($all->used[$kind]) as $old) $rows[] = $this->match_row($kind, $old);
        }
        $this->out($rows, ['kind', 'old', 'old_label', 'new', 'new_label', 'how', 'candidates'], $assoc);
    }

    /**
     * How old IDs match the client's SPM lists.
     *
     * <kind>
     * : location, type or feature.
     *
     * <old-id>...
     * : One or more old IDs.
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     */
    public function match($args, $assoc) {
        $kind = array_shift($args);
        if (!in_array($kind, SPMC_Lists::KINDS, true)) WP_CLI::error('Kind must be location, type or feature.');
        $rows = [];
        foreach ($args as $old) {
            if (!ctype_digit((string) $old)) WP_CLI::error("Not an ID: $old");
            $rows[] = $this->match_row($kind, (int) $old);
        }
        $this->out($rows, ['kind', 'old', 'old_label', 'new', 'new_label', 'how', 'candidates'], $assoc);
    }

    /**
     * Converts code from a file (or STDIN) and prints the result and the notes. Touches nothing.
     *
     * [<file>]
     * : File holding the old code. Default: STDIN.
     *
     * @subcommand try
     */
    public function try_code($args, $assoc) {
        $file = $args[0] ?? 'php://stdin';
        $text = @file_get_contents($file);
        if ($text === false) WP_CLI::error("Cannot read $file");
        $r = new SPMC_Report();
        WP_CLI::line(SPMC_Store::convert_raw($text, $r)[0]);
        foreach ($r->warnings() as $n) WP_CLI::warning($n);
    }

    /**
     * Converts every place with old codes. Without --yes it only says what it would do.
     *
     * [--yes]
     * : Write the changes.
     *
     * [--exclude=<list>]
     * : Post IDs or site paths to leave alone, comma separated.
     *
     * [--exclude-file=<file>]
     * : Post IDs or site paths to leave alone, one per line.
     *
     * [--only=<list>]
     * : Convert only these post IDs or site paths.
     *
     * [--options]
     * : Also convert widget and theme options (otherwise skipped when --only is given).
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     */
    public function convert($args, $assoc) {
        $exclude = $this->post_ids((string) ($assoc['exclude'] ?? ''));
        if (!empty($assoc['exclude-file'])) {
            $lines = @file($assoc['exclude-file'], FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if ($lines === false) WP_CLI::error('Cannot read ' . $assoc['exclude-file']);
            $exclude += $this->post_ids(implode(',', $lines));
        }
        $only = isset($assoc['only']) ? $this->post_ids((string) $assoc['only']) : null;
        $apply = !empty($assoc['yes']);
        $runId = gmdate('Ymd-His') . '-' . wp_generate_password(6, false, false);
        SPMC_Log::$source = 'cli';

        $rows = [];
        foreach ($this->places() as $p) {
            if (!$p['changed']) continue;
            $post = (int) $p['post'];
            $skip = ($post && isset($exclude[$post])) || ($only !== null && ($post ? !isset($only[$post]) : empty($assoc['options'])));
            if ($skip) {
                $rows[] = ['kind' => $p['kind'], 'id' => $p['id'], 'label' => $p['label'], 'status' => 'excluded'];
                continue;
            }
            $status = $apply ? SPMC_Store::apply($runId, $p['kind'], $p['id'], $p['label'])['status'] : 'would change';
            $rows[] = ['kind' => $p['kind'], 'id' => $p['id'], 'label' => $p['label'], 'status' => $status];
        }
        $this->out($rows, ['kind', 'id', 'label', 'status'], $assoc);
        if (!$apply) {
            WP_CLI::success(sprintf('Dry run: %d places would change. Nothing written. Add --yes to convert.', count(array_filter($rows, function ($r) { return $r['status'] === 'would change'; }))));
            return;
        }
        $done = count(array_filter($rows, function ($r) { return $r['status'] === 'done'; }));
        WP_CLI::success(sprintf('Run %s: %d places converted. Log: %s', $runId, $done, SPMC_Log::file($runId) ?: '(nothing written)'));
    }

    /**
     * Lists the runs in the file log (kept when the history table is gone).
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     */
    public function runs($args, $assoc) {
        $rows = array_map(function ($run) {
            return ['run' => $run['run'], 'at' => $run['at'], 'source' => $run['source'], 'user' => $run['user'],
                'converter' => $run['converter'], 'counts' => http_build_query($run['counts'], '', ' '), 'file' => $run['file']];
        }, SPMC_Log::runs());
        $this->out($rows, ['run', 'at', 'source', 'user', 'converter', 'counts', 'file'], $assoc);
    }

    /**
     * Every place one run changed, from the file log.
     *
     * <run-id>
     * : As shown by `runs`.
     *
     * [--format=<format>]
     * : table, csv, json or yaml. Default: table.
     */
    public function log($args, $assoc) {
        $rows = SPMC_Log::rows($args[0] ?? '');
        if (!$rows) WP_CLI::error('No log for that run.');
        if (($assoc['format'] ?? '') === 'json') {
            WP_CLI::line(wp_json_encode($rows, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            return;
        }
        $out = [];
        foreach (array_slice($rows, 1) as $row) {
            $codes = $row['changes'] ?? [[]];
            foreach ($codes as $c) {
                $out[] = ['type' => $row['type'] ?? '', 'kind' => $row['kind'] ?? '', 'id' => $row['id'] ?? '', 'status' => $row['status'] ?? '',
                    'before' => $c['before'] ?? '', 'after' => $c['after'] ?? '', 'notes' => implode(' | ', $c['notes'] ?? [])];
            }
        }
        $this->out($out, ['type', 'kind', 'id', 'status', 'before', 'after', 'notes'], $assoc);
    }

    /**
     * Puts back what a run changed (from the history table), unless edited since.
     *
     * <run-id>
     * : As shown by `runs`.
     *
     * [--yes]
     * : Required.
     */
    public function undo($args, $assoc) {
        if (empty($assoc['yes'])) WP_CLI::error('Add --yes to undo.');
        $res = SPMC_Store::undo((string) ($args[0] ?? ''));
        foreach ($res['kept'] as $label) WP_CLI::warning("Kept (edited since): $label");
        WP_CLI::success(sprintf('%d places put back.', $res['undone']));
    }

    /* ------------------------------------------------------------ helpers */

    /** Every candidate with its preview. */
    private function places() {
        $out = [];
        foreach (SPMC_Store::candidates() as $c) {
            $p = SPMC_Store::preview($c['kind'], $c['id']);
            if (!$p) continue;
            $out[] = $c + ['report' => $p['report'], 'changed' => $p['new'] !== $p['raw']];
        }
        return $out;
    }

    private function match_row($kind, $old) {
        $m = SPMC_Lists::match($kind, $old);
        return [
            'kind' => $kind, 'old' => $old, 'old_label' => SPMC_Lists::label('old', $kind, $old),
            'new' => $m['id'] ?: '', 'new_label' => $m['id'] ? SPMC_Lists::label('new', $kind, $m['id']) : '',
            'how' => $m['how'], 'candidates' => implode(',', $m['candidates']),
        ];
    }

    /** "12, /about-us/, 40" → [post id => true]; an unknown path stops the command. */
    private function post_ids($list) {
        $out = [];
        foreach (array_filter(array_map('trim', explode(',', $list))) as $v) {
            if (ctype_digit($v)) {
                $out[(int) $v] = true;
                continue;
            }
            $id = url_to_postid(preg_match('#^https?://#', $v) ? $v : home_url('/' . ltrim($v, '/')));
            if (!$id) WP_CLI::error("No post at $v — fix the list before converting.");
            $out[$id] = true;
        }
        return $out;
    }

    private function out(array $rows, array $fields, array $assoc) {
        $format = $assoc['format'] ?? 'table';
        if (!in_array($format, self::FORMATS, true)) WP_CLI::error('Format must be one of: ' . implode(', ', self::FORMATS));
        if (!$rows && $format === 'table') {
            WP_CLI::line('Nothing found.');
            return;
        }
        WP_CLI\Utils\format_items($format, $rows, $fields);
    }
}
