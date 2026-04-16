<?php
/**
 * Plugin Name: Smart Property Widget Sync
 * Plugin URI: https://smartpropertywidget.com
 * Description: Syncs property data from SPW Dashboard for instant widget performance. Enables webhook-based real-time sync and local JSON caching.
 * Version: 1.0.0
 * Author: Smart Property Widget
 * Author URI: https://smartpropertywidget.com
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: spw-sync
 * Domain Path: /languages
 *
 * @package SPW_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Plugin constants
define('SPW_SYNC_VERSION', '1.0.0');
define('SPW_SYNC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SPW_SYNC_PLUGIN_URL', plugin_dir_url(__FILE__));
define('SPW_SYNC_DATA_DIR', WP_CONTENT_DIR . '/spw-data/');

// Include required files
require_once SPW_SYNC_PLUGIN_DIR . 'includes/class-spw-sync.php';
require_once SPW_SYNC_PLUGIN_DIR . 'includes/class-spw-webhook.php';
require_once SPW_SYNC_PLUGIN_DIR . 'includes/class-spw-og-tags.php';
require_once SPW_SYNC_PLUGIN_DIR . 'includes/class-spw-settings.php';

/**
 * Main plugin class
 */
class SPW_Sync_Plugin {

    /**
     * Plugin instance
     *
     * @var SPW_Sync_Plugin
     */
    private static $instance = null;

    /**
     * Sync handler
     *
     * @var SPW_Sync
     */
    public $sync;

    /**
     * Webhook handler
     *
     * @var SPW_Webhook
     */
    public $webhook;

    /**
     * OG Tags handler
     *
     * @var SPW_OG_Tags
     */
    public $og_tags;

    /**
     * Settings handler
     *
     * @var SPW_Settings
     */
    public $settings;

    /**
     * Get plugin instance
     *
     * @return SPW_Sync_Plugin
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * Constructor
     */
    private function __construct() {
        // Initialize on plugins_loaded
        add_action('plugins_loaded', array($this, 'init'));

        // Activation/deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
    }

    /**
     * Initialize plugin
     */
    public function init() {
        // Create data directory if not exists
        $this->create_data_directory();

        // Initialize components
        $this->sync = new SPW_Sync();
        $this->webhook = new SPW_Webhook();
        $this->og_tags = new SPW_OG_Tags();
        $this->settings = new SPW_Settings();

        // Load text domain
        load_plugin_textdomain('spw-sync', false, dirname(plugin_basename(__FILE__)) . '/languages');

        // Register cron schedule
        add_filter('cron_schedules', array($this, 'add_cron_interval'));

        // Schedule daily sync if not already scheduled
        if (!wp_next_scheduled('spw_daily_sync')) {
            wp_schedule_event(time(), 'daily', 'spw_daily_sync');
        }

        // Hook into cron
        add_action('spw_daily_sync', array($this->sync, 'sync_all_data'));

        // Admin notices
        add_action('admin_notices', array($this, 'admin_notices'));
    }

    /**
     * Plugin activation
     */
    public function activate() {
        // Create data directory
        $this->create_data_directory();

        // Create default options
        $default_options = array(
            'api_key' => '',
            'dashboard_url' => '',
            'webhook_secret' => '',
            'sync_version' => 0,
            'last_sync' => null,
            'enable_og_tags' => true,
            'property_url_pattern' => '/property/{reference}/',
        );

        foreach ($default_options as $key => $value) {
            if (get_option('spw_' . $key) === false) {
                add_option('spw_' . $key, $value);
            }
        }

        // Schedule cron
        if (!wp_next_scheduled('spw_daily_sync')) {
            wp_schedule_event(time(), 'daily', 'spw_daily_sync');
        }

        // Flush rewrite rules for REST endpoint
        flush_rewrite_rules();
    }

    /**
     * Plugin deactivation
     */
    public function deactivate() {
        // Clear scheduled cron
        wp_clear_scheduled_hook('spw_daily_sync');

        // Flush rewrite rules
        flush_rewrite_rules();
    }

    /**
     * Create data directory
     */
    private function create_data_directory() {
        if (!file_exists(SPW_SYNC_DATA_DIR)) {
            wp_mkdir_p(SPW_SYNC_DATA_DIR);

            // Add .htaccess for security
            $htaccess = SPW_SYNC_DATA_DIR . '.htaccess';
            if (!file_exists($htaccess)) {
                file_put_contents($htaccess, "Options -Indexes\n");
            }

            // Add index.php for security
            $index = SPW_SYNC_DATA_DIR . 'index.php';
            if (!file_exists($index)) {
                file_put_contents($index, "<?php\n// Silence is golden.\n");
            }
        }
    }

    /**
     * Add custom cron interval
     *
     * @param array $schedules Existing schedules
     * @return array Modified schedules
     */
    public function add_cron_interval($schedules) {
        $schedules['spw_hourly'] = array(
            'interval' => HOUR_IN_SECONDS,
            'display' => __('Every Hour', 'spw-sync'),
        );
        return $schedules;
    }

    /**
     * Display admin notices
     */
    public function admin_notices() {
        // Check if API key is configured
        $api_key = get_option('spw_api_key');
        $dashboard_url = get_option('spw_dashboard_url');

        if (empty($api_key) || empty($dashboard_url)) {
            $settings_url = admin_url('options-general.php?page=spw-sync-settings');
            ?>
            <div class="notice notice-warning is-dismissible">
                <p>
                    <?php
                    printf(
                        /* translators: %s: Settings page URL */
                        __('Smart Property Widget Sync: Please <a href="%s">configure your API settings</a> to enable property sync.', 'spw-sync'),
                        esc_url($settings_url)
                    );
                    ?>
                </p>
            </div>
            <?php
        }
    }

    /**
     * Get plugin data directory path
     *
     * @return string
     */
    public static function get_data_dir() {
        return SPW_SYNC_DATA_DIR;
    }

    /**
     * Get plugin data URL
     *
     * @return string
     */
    public static function get_data_url() {
        return content_url('/spw-data/');
    }
}

// Initialize plugin
function spw_sync() {
    return SPW_Sync_Plugin::get_instance();
}

// Start the plugin
spw_sync();
