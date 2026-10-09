<?php
/**
 * Plugin Name: SPM Converter
 * Plugin URI:  https://spw-ai.com
 * Description: Moves a website to Smart Property Manager: rewrites Inmotech shortcodes and the old Smart Property Widget (SPW / RealtySoft V3) codes in pages, Elementor and widgets into SPM blocks. Shows every change first, and every run can be undone.
 * Version:     1.0.1
 * Author:      RealtySoft
 * License:     GPL v2 or later
 * Text Domain: spm-converter
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('SPMC_VERSION', '1.0.1');
define('SPMC_FILE', __FILE__);
define('SPMC_DIR', plugin_dir_path(__FILE__));
define('SPMC_URL', plugin_dir_url(__FILE__));
define('SPMC_DB_VERSION', 1);
// Where the old widget's lists come from when the site has no local copy.
define('SPMC_V3_PROXY', 'https://smartpropertywidget.com/spw/php/api-proxy.php');

require_once SPMC_DIR . 'includes/class-spmc-report.php';
require_once SPMC_DIR . 'includes/class-spmc-lists.php';
require_once SPMC_DIR . 'includes/class-spmc-output.php';
require_once SPMC_DIR . 'includes/class-spmc-inmotech.php';
require_once SPMC_DIR . 'includes/class-spmc-spw.php';
require_once SPMC_DIR . 'includes/class-spmc-store.php';
require_once SPMC_DIR . 'includes/class-spmc-admin.php';

register_activation_hook(__FILE__, function () {
    SPMC_Store::install();
    update_option('spmc_open_page', 1, false);
});

add_action('plugins_loaded', function () {
    // Also creates the table after an upload over an active copy, which
    // skips the activation hook.
    if ((int) get_option('spmc_db_version', 0) < SPMC_DB_VERSION) SPMC_Store::install();
    if (is_admin()) SPMC_Admin::instance();
});

/** Old codes + converted text, used by the scanner and the "Try it" box. */
function spmc_convert($text, SPMC_Report $report) {
    $text = SPMC_Inmotech::convert($text, $report);
    $text = SPMC_Spw::convert($text, $report);
    // A Gutenberg Shortcode block that now holds HTML becomes an HTML block,
    // so the editor shows it as what it is.
    return preg_replace(
        '/<!-- wp:shortcode -->(\s*<div class="spm-block"[^>]*><\/div>\s*)<!-- \/wp:shortcode -->/',
        '<!-- wp:html -->$1<!-- /wp:html -->',
        $text
    );
}

/**
 * Old search forms could preset filters for the page (a rentals page:
 * listing-type=long_rental on the search). SPM search forms take none, so
 * they move to the page's results block — when there is exactly one in this
 * stored value (a string, or a whole Elementor/serialized structure).
 */
function spmc_carry($data, SPMC_Report $r) {
    if (!$r->carry) return $data;
    $re = '/<([a-z][a-z0-9]*)(\s[^>]*\bdata-spm-widget="(?:site-listing|listing-template-\d{2})"[^>]*)>/i';
    $count = 0;
    $walk = function ($v) use (&$walk, &$count, $re) {
        if (is_string($v)) $count += preg_match_all($re, $v);
        elseif (is_array($v)) foreach ($v as $x) $walk($x);
    };
    $walk($data);

    $attrs = [];
    foreach ($r->carry as $c) $attrs += $c['attrs'];
    $list = implode(', ', array_map(function ($k, $v) { return "$k=\"$v\""; }, array_keys($attrs), $attrs));
    $notify = function ($message) use ($r) {
        foreach ($r->carry as $c) {
            if (isset($r->changes[$c['change']])) $r->changes[$c['change']]['notes'][] = $message;
        }
        $r->carry = [];
    };
    if ($count !== 1) {
        $notify(sprintf(
            'SPM search forms take no preset filters, and this place has %s results block — dropped: %s. Add them to the results block that should use them.',
            $count ? 'more than one' : 'no', $list
        ));
        return $data;
    }

    $inject = function ($v) use (&$inject, $re, $attrs, $r) {
        if (is_array($v)) {
            foreach ($v as $k => $x) $v[$k] = $inject($x);
            return $v;
        }
        if (!is_string($v)) return $v;
        return preg_replace_callback($re, function ($m) use ($attrs, $r) {
            $add = '';
            foreach ($attrs as $k => $val) {
                if (!preg_match('/\sdata-spm-' . preg_quote($k, '/') . '=/', $m[2])) $add .= ' data-spm-' . $k . '="' . esc_attr($val) . '"';
            }
            $new = '<' . $m[1] . $m[2] . $add . '>';
            foreach ($r->changes as $i => $c) {
                if (strpos($c['after'], $m[0]) !== false) $r->changes[$i]['after'] = str_replace($m[0], $new, $c['after']);
            }
            return $new;
        }, $v);
    };
    $data = $inject($data);
    $notify('SPM search forms take no preset filters — moved to the results block on this page: ' . $list . '.');
    return $data;
}
