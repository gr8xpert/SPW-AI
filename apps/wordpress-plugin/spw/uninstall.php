<?php
/**
 * Runs when the plugin is DELETED from Plugins (not on deactivate). Removes
 * everything the plugin stored so a reinstall starts clean and no API key is
 * left behind in wp_options.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

foreach ([
    'spw_settings',
    'spw_data_versions',
    'spw_last_sync',
    'spw_last_sync_results',
    'spw_flush_rewrites',
    'spw_last_check',
] as $option) {
    delete_option($option);
}

wp_clear_scheduled_hook('spw_daily_sync');

global $wpdb;
// OG-tag and sitemap transients (spw_og_*, spw_sitemap_*).
$wpdb->query(
    "DELETE FROM {$wpdb->options}
      WHERE option_name LIKE '\\_transient\\_spw\\_%'
         OR option_name LIKE '\\_transient\\_timeout\\_spw\\_%'"
);

// Cached lookup JSON in uploads/spw-data/.
$uploads = wp_upload_dir();
$dir = trailingslashit($uploads['basedir']) . 'spw-data/';
if (is_dir($dir)) {
    // glob('*') skips dotfiles; .htaccess (bundle cache headers) must go too
    // or the directory can't be removed.
    foreach (array_merge((array) glob($dir . '*'), [$dir . '.htaccess']) as $file) {
        if ($file && is_file($file)) @unlink($file);
    }
    @rmdir($dir);
}

flush_rewrite_rules();
