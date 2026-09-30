<?php
/**
 * Plugin Name: Smart Property Manager
 * Plugin URI:  https://spw-ai.com
 * Description: One-click integration for the Smart Property Manager. Enter your API key, pick your pages, and SPM handles listings, search, property detail pages, social sharing, and SEO.
 * Version:     2.8.0
 * Author:      RealtySoft
 * License:     GPL v2 or later
 * Text Domain: spw
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('SPW_VERSION', '2.8.0');
define('SPW_FILE', __FILE__);
define('SPW_DIR', plugin_dir_path(__FILE__));
define('SPW_URL', plugin_dir_url(__FILE__));
define('SPW_OPTION', 'spw_settings');
define('SPW_LOADER_DEFAULT', 'https://spw-ai.com/widget/spm-widget.umd.js');
define('SPW_API_DEFAULT', 'https://api.spw-ai.com');

require_once SPW_DIR . 'includes/class-spw-api-client.php';
require_once SPW_DIR . 'includes/class-spw-plugin.php';
require_once SPW_DIR . 'includes/class-spw-settings.php';
require_once SPW_DIR . 'includes/class-spw-i18n.php';
require_once SPW_DIR . 'includes/class-spw-rewrite.php';
require_once SPW_DIR . 'includes/class-spw-og-tags.php';
require_once SPW_DIR . 'includes/class-spw-data-sync.php';
require_once SPW_DIR . 'includes/class-spw-page-defaults.php';
require_once SPW_DIR . 'includes/class-spw-page-generator.php';
require_once SPW_DIR . 'includes/class-spw-filter-resolver.php';
require_once SPW_DIR . 'includes/class-spw-shortcode.php';
require_once SPW_DIR . 'includes/class-spw-shortcode-reference.php';
require_once SPW_DIR . 'includes/class-spw-health.php';
require_once SPW_DIR . 'includes/class-spw-setup-wizard.php';
require_once SPW_DIR . 'includes/class-spw-cache-exclusions.php';
require_once SPW_DIR . 'includes/class-spw-sitemap.php';

register_activation_hook(__FILE__, ['SPW_Plugin', 'activate']);
register_deactivation_hook(__FILE__, ['SPW_Plugin', 'deactivate']);

add_action('plugins_loaded', function () {
    SPW_Plugin::instance();
});
