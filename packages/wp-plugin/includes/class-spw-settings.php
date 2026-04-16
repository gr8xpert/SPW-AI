<?php
/**
 * SPW Settings Handler
 *
 * Admin settings page for SPW Sync plugin
 *
 * @package SPW_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPW_Settings class
 */
class SPW_Settings {

    /**
     * Settings page slug
     *
     * @var string
     */
    private $page_slug = 'spw-sync-settings';

    /**
     * Constructor
     */
    public function __construct() {
        add_action('admin_menu', array($this, 'add_settings_page'));
        add_action('admin_init', array($this, 'register_settings'));
        add_action('admin_enqueue_scripts', array($this, 'enqueue_scripts'));
    }

    /**
     * Add settings page to admin menu
     */
    public function add_settings_page() {
        add_options_page(
            __('SPW Sync Settings', 'spw-sync'),
            __('SPW Sync', 'spw-sync'),
            'manage_options',
            $this->page_slug,
            array($this, 'render_settings_page')
        );
    }

    /**
     * Register settings
     */
    public function register_settings() {
        // API Settings Section
        add_settings_section(
            'spw_api_settings',
            __('API Settings', 'spw-sync'),
            array($this, 'render_api_section'),
            $this->page_slug
        );

        // Dashboard URL
        register_setting($this->page_slug, 'spw_dashboard_url', array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ));

        add_settings_field(
            'spw_dashboard_url',
            __('Dashboard URL', 'spw-sync'),
            array($this, 'render_url_field'),
            $this->page_slug,
            'spw_api_settings',
            array(
                'name' => 'spw_dashboard_url',
                'description' => __('Your SPW Dashboard URL (e.g., https://api.example.com)', 'spw-sync'),
            )
        );

        // API Key
        register_setting($this->page_slug, 'spw_api_key', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        add_settings_field(
            'spw_api_key',
            __('API Key', 'spw-sync'),
            array($this, 'render_password_field'),
            $this->page_slug,
            'spw_api_settings',
            array(
                'name' => 'spw_api_key',
                'description' => __('Your API key from the SPW Dashboard', 'spw-sync'),
            )
        );

        // Webhook Secret
        register_setting($this->page_slug, 'spw_webhook_secret', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        add_settings_field(
            'spw_webhook_secret',
            __('Webhook Secret', 'spw-sync'),
            array($this, 'render_password_field'),
            $this->page_slug,
            'spw_api_settings',
            array(
                'name' => 'spw_webhook_secret',
                'description' => __('Your webhook secret from the SPW Dashboard', 'spw-sync'),
            )
        );

        // Display Settings Section
        add_settings_section(
            'spw_display_settings',
            __('Display Settings', 'spw-sync'),
            array($this, 'render_display_section'),
            $this->page_slug
        );

        // Enable OG Tags
        register_setting($this->page_slug, 'spw_enable_og_tags', array(
            'type' => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default' => true,
        ));

        add_settings_field(
            'spw_enable_og_tags',
            __('Enable OG Tags', 'spw-sync'),
            array($this, 'render_checkbox_field'),
            $this->page_slug,
            'spw_display_settings',
            array(
                'name' => 'spw_enable_og_tags',
                'description' => __('Add Open Graph meta tags to property pages for better social sharing', 'spw-sync'),
            )
        );

        // Property URL Pattern
        register_setting($this->page_slug, 'spw_property_url_pattern', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '/property/{reference}/',
        ));

        add_settings_field(
            'spw_property_url_pattern',
            __('Property URL Pattern', 'spw-sync'),
            array($this, 'render_text_field'),
            $this->page_slug,
            'spw_display_settings',
            array(
                'name' => 'spw_property_url_pattern',
                'description' => __('URL pattern for property pages. Use {reference} or {id} as placeholders.', 'spw-sync'),
                'placeholder' => '/property/{reference}/',
            )
        );
    }

    /**
     * Enqueue admin scripts
     *
     * @param string $hook Current admin page
     */
    public function enqueue_scripts($hook) {
        if ('settings_page_' . $this->page_slug !== $hook) {
            return;
        }

        wp_enqueue_style(
            'spw-sync-admin',
            SPW_SYNC_PLUGIN_URL . 'assets/admin.css',
            array(),
            SPW_SYNC_VERSION
        );

        wp_enqueue_script(
            'spw-sync-admin',
            SPW_SYNC_PLUGIN_URL . 'assets/admin.js',
            array('jquery'),
            SPW_SYNC_VERSION,
            true
        );

        wp_localize_script('spw-sync-admin', 'spwSync', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('spw_sync_nonce'),
            'strings' => array(
                'syncing' => __('Syncing...', 'spw-sync'),
                'syncComplete' => __('Sync completed!', 'spw-sync'),
                'syncError' => __('Sync failed:', 'spw-sync'),
                'checking' => __('Checking...', 'spw-sync'),
            ),
        ));
    }

    /**
     * Render API section description
     */
    public function render_api_section() {
        echo '<p>' . esc_html__('Configure your SPW Dashboard API connection.', 'spw-sync') . '</p>';
    }

    /**
     * Render display section description
     */
    public function render_display_section() {
        echo '<p>' . esc_html__('Configure how property data is displayed on your site.', 'spw-sync') . '</p>';
    }

    /**
     * Render URL field
     *
     * @param array $args Field arguments
     */
    public function render_url_field($args) {
        $value = get_option($args['name'], '');
        ?>
        <input type="url"
               name="<?php echo esc_attr($args['name']); ?>"
               value="<?php echo esc_url($value); ?>"
               class="regular-text"
               placeholder="https://api.example.com" />
        <?php if (!empty($args['description'])) : ?>
            <p class="description"><?php echo esc_html($args['description']); ?></p>
        <?php endif;
    }

    /**
     * Render text field
     *
     * @param array $args Field arguments
     */
    public function render_text_field($args) {
        $value = get_option($args['name'], '');
        $placeholder = $args['placeholder'] ?? '';
        ?>
        <input type="text"
               name="<?php echo esc_attr($args['name']); ?>"
               value="<?php echo esc_attr($value); ?>"
               class="regular-text"
               placeholder="<?php echo esc_attr($placeholder); ?>" />
        <?php if (!empty($args['description'])) : ?>
            <p class="description"><?php echo esc_html($args['description']); ?></p>
        <?php endif;
    }

    /**
     * Render password field
     *
     * @param array $args Field arguments
     */
    public function render_password_field($args) {
        $value = get_option($args['name'], '');
        ?>
        <input type="password"
               name="<?php echo esc_attr($args['name']); ?>"
               value="<?php echo esc_attr($value); ?>"
               class="regular-text"
               autocomplete="off" />
        <?php if (!empty($args['description'])) : ?>
            <p class="description"><?php echo esc_html($args['description']); ?></p>
        <?php endif;
    }

    /**
     * Render checkbox field
     *
     * @param array $args Field arguments
     */
    public function render_checkbox_field($args) {
        $value = get_option($args['name'], true);
        ?>
        <label>
            <input type="checkbox"
                   name="<?php echo esc_attr($args['name']); ?>"
                   value="1"
                   <?php checked($value, true); ?> />
            <?php echo esc_html($args['description']); ?>
        </label>
        <?php
    }

    /**
     * Render settings page
     */
    public function render_settings_page() {
        // Get sync status
        $sync = spw_sync()->sync;
        $status = $sync->get_status();
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Smart Property Widget Sync', 'spw-sync'); ?></h1>

            <div class="spw-settings-container">
                <div class="spw-settings-main">
                    <form method="post" action="options.php">
                        <?php
                        settings_fields($this->page_slug);
                        do_settings_sections($this->page_slug);
                        submit_button();
                        ?>
                    </form>
                </div>

                <div class="spw-settings-sidebar">
                    <!-- Sync Status Card -->
                    <div class="spw-card">
                        <h3><?php esc_html_e('Sync Status', 'spw-sync'); ?></h3>

                        <table class="spw-status-table">
                            <tr>
                                <th><?php esc_html_e('Local Version', 'spw-sync'); ?></th>
                                <td><?php echo esc_html($status['sync_version']); ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Sync', 'spw-sync'); ?></th>
                                <td>
                                    <?php
                                    echo $status['last_sync']
                                        ? esc_html($status['last_sync'])
                                        : esc_html__('Never', 'spw-sync');
                                    ?>
                                </td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Data Directory', 'spw-sync'); ?></th>
                                <td>
                                    <code><?php echo esc_html($status['data_dir']); ?></code>
                                </td>
                            </tr>
                        </table>

                        <h4><?php esc_html_e('Data Files', 'spw-sync'); ?></h4>
                        <ul class="spw-file-list">
                            <?php foreach ($status['files'] as $name => $file) : ?>
                                <li>
                                    <span class="spw-file-status <?php echo $file['exists'] ? 'exists' : 'missing'; ?>">
                                        <?php echo $file['exists'] ? '✓' : '✗'; ?>
                                    </span>
                                    <span class="spw-file-name"><?php echo esc_html($name); ?>.json</span>
                                    <?php if ($file['exists']) : ?>
                                        <span class="spw-file-size">
                                            (<?php echo esc_html(size_format($file['size'])); ?>)
                                        </span>
                                    <?php endif; ?>
                                </li>
                            <?php endforeach; ?>
                        </ul>

                        <div class="spw-sync-actions">
                            <button type="button" class="button button-primary" id="spw-manual-sync">
                                <?php esc_html_e('Sync Now', 'spw-sync'); ?>
                            </button>
                            <button type="button" class="button" id="spw-check-version">
                                <?php esc_html_e('Check Updates', 'spw-sync'); ?>
                            </button>
                        </div>

                        <div id="spw-sync-result" class="spw-sync-result" style="display: none;"></div>
                    </div>

                    <!-- Webhook Info Card -->
                    <div class="spw-card">
                        <h3><?php esc_html_e('Webhook Endpoint', 'spw-sync'); ?></h3>
                        <p><?php esc_html_e('Configure this URL in your SPW Dashboard webhook settings:', 'spw-sync'); ?></p>
                        <code class="spw-webhook-url"><?php echo esc_url(SPW_Webhook::get_webhook_url()); ?></code>
                        <button type="button" class="button button-small spw-copy-btn" data-copy="<?php echo esc_attr(SPW_Webhook::get_webhook_url()); ?>">
                            <?php esc_html_e('Copy', 'spw-sync'); ?>
                        </button>
                    </div>

                    <!-- Help Card -->
                    <div class="spw-card">
                        <h3><?php esc_html_e('Need Help?', 'spw-sync'); ?></h3>
                        <ul>
                            <li><a href="https://docs.smartpropertywidget.com" target="_blank"><?php esc_html_e('Documentation', 'spw-sync'); ?></a></li>
                            <li><a href="https://smartpropertywidget.com/support" target="_blank"><?php esc_html_e('Support', 'spw-sync'); ?></a></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}
