<?php
/**
 * Runs when the plugin is DELETED from Plugins (not on deactivate). Removes
 * everything the plugin stored so a reinstall starts clean and no API key is
 * left behind in wp_options — including what the plugin stored under its old
 * name (spw_*, before 2.8.0), which the upgrade copied but left in place.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

$names = [
    'settings',
    'data_versions',
    'last_sync',
    'last_sync_results',
    'flush_rewrites',
    'last_check',
    'site_config',
    'setup_redirect',
    'setup_done',
    'widget_version',
    'sync_version',
    'bundle_format',
    'migrated_from_spw',
    'page_searches',
];
foreach (['spm_', 'spw_'] as $prefix) {
    foreach ($names as $name) delete_option($prefix . $name);
    wp_clear_scheduled_hook($prefix . 'daily_sync');
}

global $wpdb;
// OG-tag and sitemap transients (spm_og_*, spm_sitemap_*, and the old spw_*).
$wpdb->query(
    "DELETE FROM {$wpdb->options}
      WHERE option_name LIKE '\\_transient\\_spm\\_%'
         OR option_name LIKE '\\_transient\\_timeout\\_spm\\_%'
         OR option_name LIKE '\\_transient\\_spw\\_%'
         OR option_name LIKE '\\_transient\\_timeout\\_spw\\_%'"
);

// Cached lookup JSON in uploads/spm-data/ (and the old uploads/spw-data/).
$uploads = wp_upload_dir();
foreach (['spm-data/', 'spw-data/'] as $sub) {
    $dir = trailingslashit($uploads['basedir']) . $sub;
    if (!is_dir($dir)) continue;
    // glob('*') skips dotfiles; .htaccess (bundle cache headers) must go too
    // or the directory can't be removed.
    foreach (array_merge((array) glob($dir . '*'), [$dir . '.htaccess']) as $file) {
        if ($file && is_file($file)) @unlink($file);
    }
    @rmdir($dir);
}

flush_rewrite_rules();
