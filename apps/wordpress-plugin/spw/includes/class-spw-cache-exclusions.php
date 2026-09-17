<?php
if (!defined('ABSPATH')) exit;

/**
 * Prevent popular optimization / caching plugins from deferring, delaying,
 * combining, or minifying SPW scripts — they break widget hydration.
 */
class SPW_Cache_Exclusions {
    private static $instance = null;
    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // The bundle is spm-widget.umd.js (enqueued under the handle
        // "spw-widget"); match both so no optimizer defers or combines it.
        $tokens = ['spm-widget', 'spm-widget.umd', 'spw-widget', 'RealtySoftConfig', 'realtysoft-loader'];

        // WP Rocket
        add_filter('rocket_exclude_defer_js', fn($x) => array_merge($x, $tokens));
        add_filter('rocket_delay_js_exclusions', fn($x) => array_merge($x, $tokens));
        add_filter('rocket_exclude_js', fn($x) => array_merge($x, ['spm-widget(.*)\.js', 'spw-widget(.*)\.js']));

        // Autoptimize
        add_filter('autoptimize_filter_js_exclude', fn($x) => $x . ',' . implode(',', $tokens));

        // LiteSpeed Cache
        add_filter('litespeed_optimize_js_excludes', fn($x) => array_merge($x, $tokens));

        // FlyingPress
        add_filter('flying_press_exclude_from_delay', fn($x) => array_merge($x, $tokens));
        add_filter('flying_press_exclude_from_defer', fn($x) => array_merge($x, $tokens));

        // SG Optimizer
        add_filter('sgo_javascript_combine_exclude', fn($x) => array_merge($x, $tokens));
        add_filter('sgo_js_minify_exclude',          fn($x) => array_merge($x, $tokens));

        // W3 Total Cache
        add_filter('w3tc_minify_js_do_tag_minification', function ($do, $script_tag) use ($tokens) {
            foreach ($tokens as $t) {
                if (stripos($script_tag, $t) !== false) return false;
            }
            return $do;
        }, 10, 2);
    }
}
