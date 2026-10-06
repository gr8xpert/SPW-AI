<?php
/**
 * Plugin Name: Smart Property Manager
 * Plugin URI:  https://spw-ai.com
 * Description: One-click integration for the Smart Property Manager. Enter your API key, pick your pages, and SPM handles listings, search, property detail pages, social sharing, and SEO.
 * Version:     2.9.4
 * Author:      RealtySoft
 * License:     GPL v2 or later
 * Text Domain: spm
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('SPM_VERSION', '2.9.4');
define('SPM_FILE', __FILE__);
define('SPM_DIR', plugin_dir_path(__FILE__));
define('SPM_URL', plugin_dir_url(__FILE__));
define('SPM_OPTION', 'spm_settings');
define('SPM_LOADER_DEFAULT', 'https://spw-ai.com/widget/spm-widget.umd.js');
define('SPM_API_DEFAULT', 'https://api.spw-ai.com');

// Before 2.8.0 the plugin was folder spw/ and its names started with spw/SPW.
// wp-config.php overrides written for it keep working.
if (!defined('SPM_API_URL') && defined('SPW_API_URL')) define('SPM_API_URL', SPW_API_URL);
if (!defined('SPM_LOADER_URL') && defined('SPW_LOADER_URL')) define('SPM_LOADER_URL', SPW_LOADER_URL);

/**
 * Moving from the old spw/ plugin: copy its settings and state across once
 * (API key, pages, slugs…), so the site keeps working without setup, and
 * switch the old plugin off — both running would put the widget on every page
 * twice. The old options are left in place until the plugin is deleted.
 */
function spm_migrate_from_spw() {
    if (get_option('spm_migrated_from_spw')) return;
    foreach ([
        'settings', 'data_versions', 'last_sync', 'last_sync_results', 'last_check',
        'site_config', 'setup_done', 'widget_version', 'sync_version',
    ] as $name) {
        $old = get_option('spw_' . $name, null);
        if ($old !== null && get_option('spm_' . $name, null) === null) {
            add_option('spm_' . $name, $old, '', in_array($name, ['widget_version', 'sync_version'], true) ? 'yes' : 'no');
        }
    }
    wp_clear_scheduled_hook('spw_daily_sync');
    // Property addresses are matched by new rewrite rules; data files move
    // to uploads/spm-data/ on the next sync.
    update_option('spm_flush_rewrites', 1, false);
    update_option('spm_migrated_from_spw', time(), false);
}

function spm_retire_old_plugin() {
    if (!function_exists('is_plugin_active')) require_once ABSPATH . 'wp-admin/includes/plugin.php';
    if (!is_plugin_active('spw/spw.php')) return;
    deactivate_plugins('spw/spw.php');
    set_transient('spm_retired_old_plugin', 1, HOUR_IN_SECONDS);
}

require_once SPM_DIR . 'includes/class-spm-api-client.php';
require_once SPM_DIR . 'includes/class-spm-plugin.php';
require_once SPM_DIR . 'includes/class-spm-settings.php';
require_once SPM_DIR . 'includes/class-spm-i18n.php';
require_once SPM_DIR . 'includes/class-spm-rewrite.php';
require_once SPM_DIR . 'includes/class-spm-og-tags.php';
require_once SPM_DIR . 'includes/class-spm-data-sync.php';
require_once SPM_DIR . 'includes/class-spm-page-results.php';
require_once SPM_DIR . 'includes/class-spm-page-defaults.php';
require_once SPM_DIR . 'includes/class-spm-page-generator.php';
require_once SPM_DIR . 'includes/class-spm-filter-resolver.php';
require_once SPM_DIR . 'includes/class-spm-shortcode.php';
require_once SPM_DIR . 'includes/class-spm-shortcode-reference.php';
require_once SPM_DIR . 'includes/class-spm-health.php';
require_once SPM_DIR . 'includes/class-spm-setup-wizard.php';
require_once SPM_DIR . 'includes/class-spm-cache-exclusions.php';
require_once SPM_DIR . 'includes/class-spm-sitemap.php';

register_activation_hook(__FILE__, function () {
    spm_migrate_from_spw();
    spm_retire_old_plugin();
    SPM_Plugin::activate();
});
register_deactivation_hook(__FILE__, ['SPM_Plugin', 'deactivate']);

add_action('plugins_loaded', function () {
    // Also on plain load: WordPress can replace the plugin without running
    // the activation hook (e.g. an upload over an active copy).
    spm_migrate_from_spw();
    SPM_Plugin::instance();
});
add_action('admin_init', 'spm_retire_old_plugin');
add_action('admin_notices', function () {
    if (!get_transient('spm_retired_old_plugin')) return;
    delete_transient('spm_retired_old_plugin');
    echo '<div class="notice notice-success is-dismissible"><p><strong>Smart Property Manager:</strong> the older copy of this plugin (folder <code>spw</code>) was switched off and its settings carried over. You can delete it from Plugins.</p></div>';
});
