<?php
/**
 * Just enough WordPress for the converter's pure parts (conversion, ID
 * mapping by saved picks, the file log), so they run under plain PHP:
 *
 *   docker run --rm -v "$PWD":/app -w /app php:8.1-cli php apps/wordpress-plugin/tests/spm-converter/run.php
 *
 * Nothing here talks to a network or a database.
 */
define('ABSPATH', __DIR__ . '/');
define('WP_CLI', false);

$GLOBALS['__opts'] = [];
$GLOBALS['__transients'] = [];
$GLOBALS['__uploads'] = sys_get_temp_dir() . '/spmc-test-' . getmypid();

function add_action(...$a) {}
function add_filter(...$a) {}
function register_activation_hook(...$a) {}
function is_admin() { return false; }
function plugin_dir_path($f) { return rtrim(dirname($f), '/\\') . '/'; }
function plugin_dir_url($f) { return 'https://example.test/wp-content/plugins/spm-converter/'; }
function get_option($k, $d = false) { return array_key_exists($k, $GLOBALS['__opts']) ? $GLOBALS['__opts'][$k] : $d; }
function update_option($k, $v, $autoload = null) { $GLOBALS['__opts'][$k] = $v; return true; }
function delete_option($k) { unset($GLOBALS['__opts'][$k]); return true; }
function get_transient($k) { return $GLOBALS['__transients'][$k] ?? false; }
function set_transient($k, $v, $t = 0) { $GLOBALS['__transients'][$k] = $v; return true; }
function delete_transient($k) { unset($GLOBALS['__transients'][$k]); return true; }
function esc_attr($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
function esc_sql($s) { return addslashes((string) $s); }
function remove_accents($s) { return (string) $s; }
function trailingslashit($s) { return rtrim($s, '/\\') . '/'; }
function wp_upload_dir() { return ['basedir' => $GLOBALS['__uploads'], 'baseurl' => 'https://example.test/wp-content/uploads']; }
function wp_parse_url($u, $c = -1) { return parse_url($u, $c); }
function home_url($p = '') { return 'https://example.test' . $p; }
function add_query_arg($args, $url) { return $url . '?' . http_build_query($args); }
function wp_remote_get($u, $a = []) { return new WP_Error('offline', 'tests are offline'); }
function wp_remote_retrieve_response_code($r) { return 0; }
function wp_remote_retrieve_body($r) { return ''; }
function is_wp_error($x) { return $x instanceof WP_Error; }
function wp_json_encode($v, $o = 0) { return json_encode($v, $o); }
function wp_mkdir_p($d) { return is_dir($d) || @mkdir($d, 0777, true); }
function wp_is_writable($d) { return is_writable($d); }
function wp_generate_password($n = 12, $s = true, $x = false) { return substr(str_repeat(bin2hex(random_bytes(16)), 2), 0, $n); }
function wp_get_current_user() { return new class { public $user_login = 'test'; public function exists() { return true; } }; }
function is_serialized($data) {
    if (!is_string($data)) return false;
    $data = trim($data);
    if ($data === 'N;') return true;
    return (bool) preg_match('/^([adObis]):/', $data) && @unserialize($data) !== false;
}
// WordPress's own parser (wp-includes/shortcodes.php), trimmed.
function shortcode_parse_atts($text) {
    $atts = [];
    $pattern = '/([\w-]+)\s*=\s*"([^"]*)"(?:\s|$)|([\w-]+)\s*=\s*\'([^\']*)\'(?:\s|$)|([\w-]+)\s*=\s*([^\s\'"]+)(?:\s|$)|"([^"]*)"(?:\s|$)|\'([^\']*)\'(?:\s|$)|(\S+)(?:\s|$)/';
    $text = preg_replace("/[\x{00a0}\x{200b}]+/u", ' ', $text);
    if (!preg_match_all($pattern, $text, $match, PREG_SET_ORDER)) return ltrim($text);
    foreach ($match as $m) {
        if (!empty($m[1])) $atts[strtolower($m[1])] = stripcslashes($m[2]);
        elseif (!empty($m[3])) $atts[strtolower($m[3])] = stripcslashes($m[4]);
        elseif (!empty($m[5])) $atts[strtolower($m[5])] = stripcslashes($m[6]);
        elseif (isset($m[7]) && strlen($m[7])) $atts[] = stripcslashes($m[7]);
        elseif (isset($m[8]) && strlen($m[8])) $atts[] = stripcslashes($m[8]);
        elseif (isset($m[9])) $atts[] = stripcslashes($m[9]);
    }
    return $atts;
}

class WP_Error {
    private $m;
    public function __construct($c = '', $m = '') { $this->m = $m; }
    public function get_error_message() { return $this->m; }
}

require dirname(__DIR__, 2) . '/spm-converter/spm-converter.php';
