<?php
if (!defined('ABSPATH')) exit;

/**
 * Tools → SPM Converter: scan, check the old IDs, convert, undo.
 */
class SPMC_Admin {
    const CAP = 'manage_options';
    const NONCE = 'spmc_admin';
    private static $instance;

    public static function instance() {
        if (!self::$instance) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'menu'], 20);
        add_action('admin_init', [$this, 'open_after_activation']);
        add_filter('plugin_action_links_' . plugin_basename(SPMC_FILE), function ($links) {
            array_unshift($links, '<a href="' . esc_url(admin_url('admin.php?page=spm-converter')) . '">Open</a>');
            return $links;
        });
        add_action('admin_enqueue_scripts', [$this, 'assets']);
        foreach (['scan', 'convert', 'undo', 'runs', 'save', 'reload', 'try', 'deactivate'] as $a) {
            add_action('wp_ajax_spmc_' . $a, [$this, 'ajax_' . $a]);
        }
    }

    /** Straight to the converter after activating it (not on bulk activation). */
    public function open_after_activation() {
        if (!get_option('spmc_open_page')) return;
        delete_option('spmc_open_page');
        if (wp_doing_ajax() || isset($_GET['activate-multi']) || !current_user_can(self::CAP)) return;
        wp_safe_redirect(admin_url('admin.php?page=spm-converter'));
        exit;
    }

    public function menu() {
        // Under the SPM menu when it is there (where a client looks), else Tools.
        class_exists('SPM_Plugin')
            ? add_submenu_page('spm-settings', 'Move to SPM', 'Move to SPM', self::CAP, 'spm-converter', [$this, 'page'])
            : add_management_page('Move to SPM', 'Move to SPM', self::CAP, 'spm-converter', [$this, 'page']);
    }

    public function assets($hook) {
        // By page name, not hook: the page also opens from its Tools address
        // (older link, or SPM missing), where the hook name differs.
        if (($_GET['page'] ?? '') !== 'spm-converter') return;
        wp_enqueue_style('spmc-admin', SPMC_URL . 'assets/admin.css', [], SPMC_VERSION . '.' . filemtime(SPMC_DIR . 'assets/admin.css'));
        wp_enqueue_style('dashicons');
        wp_enqueue_script('spmc-admin', SPMC_URL . 'assets/admin.js', [], SPMC_VERSION . '.' . filemtime(SPMC_DIR . 'assets/admin.js'), true);
        wp_localize_script('spmc-admin', 'SPMC', [
            'ajax'       => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce(self::NONCE),
            'ready'      => SPMC_Lists::spm_ready(),
            'oldPlugins' => array_values($this->old_plugins()),
        ]);
    }

    public function page() {
        if (!current_user_can(self::CAP)) return;
        $counts = SPMC_Lists::counts();
        include SPMC_DIR . 'admin/page.php';
    }

    /** Active plugins of the old systems (file => name); both widgets on a page clash. */
    private function old_plugins() {
        if (!function_exists('get_plugins')) require_once ABSPATH . 'wp-admin/includes/plugin.php';
        $out = [];
        foreach (get_plugins() as $file => $data) {
            if (!is_plugin_active($file)) continue;
            if (strpos($file, 'spm-converter/') === 0 || strpos($file, 'spm/') === 0) continue;
            $hay = $file . ' ' . ($data['Name'] ?? '') . ' ' . ($data['Description'] ?? '');
            if (strpos($file, 'realtysoft-connector.php') !== false || preg_match('/inmotech|inmolink|realtysoft connector|smart property widget/i', $hay)) {
                $out[$file] = $data['Name'] ?? $file;
            }
        }
        return $out;
    }

    /** "Switch off the old plugin" — only the ones old_plugins() named. */
    public function ajax_deactivate() {
        $this->guard();
        if (!current_user_can('activate_plugins')) wp_send_json_error(['message' => 'You are not allowed to switch plugins off.'], 403);
        $old = $this->old_plugins();
        if ($old) deactivate_plugins(array_keys($old));
        wp_send_json_success(['off' => array_values($old)]);
    }

    /* ------------------------------------------------------------ AJAX */

    private function guard() {
        if (!current_user_can(self::CAP) || !check_ajax_referer(self::NONCE, 'nonce', false)) {
            wp_send_json_error(['message' => 'Not allowed — reload the page.'], 403);
        }
        @set_time_limit(300);
    }

    private function input($name, $default = null) {
        $raw = wp_unslash($_POST[$name] ?? '');
        if ($raw === '') return $default;
        $v = json_decode($raw, true);
        return $v === null ? $default : $v;
    }

    public function ajax_scan() {
        $this->guard();
        $all = new SPMC_Report();
        $items = [];
        $where = []; // kind => old id => [page titles]
        foreach (SPMC_Store::candidates() as $c) {
            $p = SPMC_Store::preview($c['kind'], $c['id']);
            if (!$p || !$p['report']->changes) continue;
            $all->merge($p['report']);
            $title = explode(' — ', $c['label'])[0];
            foreach ($p['report']->used as $kind => $ids) {
                foreach (array_keys($ids) as $id) $where[$kind][$id][$title] = true;
            }
            $items[] = [
                'kind'     => $c['kind'],
                'id'       => $c['id'],
                'label'    => $c['label'],
                'title'    => $c['post'] ? $title : 'Widgets and theme settings',
                'url'      => $c['post'] && get_post_status($c['post']) === 'publish' ? get_permalink($c['post']) : '',
                'changed'  => $p['new'] !== $p['raw'],
                'systems'  => $p['report']->systems(),
                'warnings' => $p['report']->warnings(),
                'changes'  => array_map(function ($ch) {
                    return [
                        'system' => $ch['system'],
                        'before' => self::cut($ch['before']),
                        'after'  => self::cut($ch['after']),
                        'notes'  => $ch['notes'],
                    ];
                }, array_slice($p['report']->changes, 0, 40)),
            ];
        }
        wp_send_json_success([
            'items'  => $items,
            'ids'    => $this->id_rows($all, $where),
            'tags'   => $this->tag_rows($all),
            'counts' => SPMC_Lists::counts(),
        ]);
    }

    private static function cut($s) {
        return strlen($s) > 800 ? substr($s, 0, 800) . ' …' : $s;
    }

    /** Old IDs the site uses, how each matched, and what to pick from. */
    private function id_rows(SPMC_Report $all, array $where = []) {
        $out = [];
        foreach (SPMC_Lists::KINDS as $kind) {
            $rows = [];
            $needChoices = false;
            foreach (array_keys($all->used[$kind]) as $old) {
                $m = SPMC_Lists::match($kind, $old);
                // Shown under "Needs your help": no match, or a guess to check.
                $help = (!$m['id'] && $m['how'] !== 'skip') || $m['how'] === 'close';
                if ($help) $needChoices = true;
                $rows[] = [
                    'help'       => $help,
                    'where'      => array_slice(array_keys($where[$kind][$old] ?? []), 0, 3),
                    'old'        => $old,
                    'old_label'  => SPMC_Lists::label('old', $kind, $old),
                    'new'        => $m['id'],
                    'new_label'  => $m['id'] ? SPMC_Lists::label('new', $kind, $m['id']) : '',
                    'how'        => $m['how'],
                    'candidates' => array_map(function ($id) use ($kind) {
                        return ['id' => $id, 'label' => SPMC_Lists::label('new', $kind, $id)];
                    }, $m['candidates']),
                ];
            }
            usort($rows, function ($a, $b) { return ($a['new'] ? 1 : 0) - ($b['new'] ? 1 : 0) ?: $a['old'] - $b['old']; });
            $choices = [];
            if ($needChoices) foreach (SPMC_Lists::choices($kind) as $id => $label) $choices[] = ['id' => $id, 'label' => $label];
            $out[$kind] = ['rows' => $rows, 'choices' => $choices];
        }
        return $out;
    }

    private function tag_rows(SPMC_Report $all) {
        $out = [];
        foreach (array_keys($all->tags) as $tag) {
            $out[] = ['tag' => $tag, 'target' => SPMC_Inmotech::target($tag), 'default' => SPMC_Inmotech::default_target($tag)];
        }
        return $out;
    }

    public function ajax_save() {
        $this->guard();
        $ids = (array) $this->input('ids', []);
        foreach (SPMC_Lists::KINDS as $kind) {
            if (isset($ids[$kind]) && is_array($ids[$kind])) SPMC_Lists::save_picks($kind, $ids[$kind]);
        }
        $tags = $this->input('tags');
        if (is_array($tags)) {
            $clean = [];
            foreach ($tags as $tag => $target) {
                $tag = sanitize_key($tag);
                $target = sanitize_text_field((string) $target);
                if ($tag && preg_match('/^[a-z][a-z0-9_-]{1,60}$/', $target) && $target !== SPMC_Inmotech::default_target($tag)) {
                    $clean[$tag] = $target;
                }
            }
            update_option('spmc_tag_targets', $clean, false);
        }
        $settings = (array) $this->input('settings', []);
        if (array_key_exists('old_domain', $settings)) {
            $d = strtolower(trim(sanitize_text_field((string) $settings['old_domain'])));
            $d = preg_replace('#^https?://#', '', rtrim($d, '/'));
            if ($d !== get_option('spmc_old_domain', '')) {
                update_option('spmc_old_domain', $d, false);
                SPMC_Lists::forget();
            }
        }
        if (array_key_exists('strip_scripts', $settings)) {
            update_option('spmc_strip_scripts', $settings['strip_scripts'] ? '1' : '0', false);
        }
        wp_send_json_success(['counts' => SPMC_Lists::counts()]);
    }

    public function ajax_reload() {
        $this->guard();
        SPMC_Lists::forget();
        wp_send_json_success(['counts' => SPMC_Lists::counts()]);
    }

    public function ajax_convert() {
        $this->guard();
        $items = (array) $this->input('items', []);
        $runId = gmdate('Ymd-His') . '-' . wp_generate_password(6, false, false);
        $done = 0;
        $other = [];
        foreach ($items as $it) {
            $kind = in_array($it['kind'] ?? '', ['post', 'meta', 'option'], true) ? $it['kind'] : '';
            $id = sanitize_text_field((string) ($it['id'] ?? ''));
            if (!$kind || $id === '') continue;
            $label = sanitize_text_field((string) ($it['label'] ?? ''));
            $res = SPMC_Store::apply($runId, $kind, $id, $label);
            if ($res['status'] === 'done') $done++;
            else $other[] = $label . ': ' . $res['status'];
        }
        wp_send_json_success(['run' => $runId, 'done' => $done, 'other' => $other]);
    }

    public function ajax_runs() {
        $this->guard();
        $runs = SPMC_Store::runs();
        foreach ($runs as &$run) $run['items_list'] = SPMC_Store::run_items($run['run_id']);
        wp_send_json_success(['runs' => $runs]);
    }

    public function ajax_undo() {
        $this->guard();
        $run = sanitize_text_field((string) ($_POST['run'] ?? ''));
        if ($run === '') wp_send_json_error(['message' => 'No run given.']);
        wp_send_json_success(SPMC_Store::undo($run));
    }

    /** Converts pasted code without touching the site. */
    public function ajax_try() {
        $this->guard();
        $text = (string) wp_unslash($_POST['text'] ?? '');
        $r = new SPMC_Report();
        $out = spmc_carry(spmc_convert($text, $r), $r);
        wp_send_json_success(['output' => $out, 'notes' => $r->warnings()]);
    }
}
