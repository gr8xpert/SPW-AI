<?php
/**
 * SPM Settings Handler
 *
 * Admin settings page for SPM Sync plugin
 *
 * @package SPM_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPM_Settings class
 */
class SPM_Settings {

    /**
     * Settings page slug
     *
     * @var string
     */
    private $page_slug = 'spm-sync-settings';

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
            __('SPM Sync Settings', 'spm-sync'),
            __('SPM Sync', 'spm-sync'),
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
            'spm_api_settings',
            __('API Settings', 'spm-sync'),
            array($this, 'render_api_section'),
            $this->page_slug
        );

        // Dashboard URL
        register_setting($this->page_slug, 'spm_dashboard_url', array(
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ));

        add_settings_field(
            'spm_dashboard_url',
            __('Dashboard URL', 'spm-sync'),
            array($this, 'render_url_field'),
            $this->page_slug,
            'spm_api_settings',
            array(
                'name' => 'spm_dashboard_url',
                'description' => __('Your SPM Dashboard URL (e.g., https://api.example.com)', 'spm-sync'),
            )
        );

        // API Key
        register_setting($this->page_slug, 'spm_api_key', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        add_settings_field(
            'spm_api_key',
            __('API Key', 'spm-sync'),
            array($this, 'render_password_field'),
            $this->page_slug,
            'spm_api_settings',
            array(
                'name' => 'spm_api_key',
                'description' => __('Your API key from the SPM Dashboard', 'spm-sync'),
            )
        );

        // Webhook Secret
        register_setting($this->page_slug, 'spm_webhook_secret', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ));

        add_settings_field(
            'spm_webhook_secret',
            __('Webhook Secret', 'spm-sync'),
            array($this, 'render_password_field'),
            $this->page_slug,
            'spm_api_settings',
            array(
                'name' => 'spm_webhook_secret',
                'description' => __('Your webhook secret from the SPM Dashboard', 'spm-sync'),
            )
        );

        // Display Settings Section
        add_settings_section(
            'spm_display_settings',
            __('Display Settings', 'spm-sync'),
            array($this, 'render_display_section'),
            $this->page_slug
        );

        // Enable OG Tags
        register_setting($this->page_slug, 'spm_enable_og_tags', array(
            'type' => 'boolean',
            'sanitize_callback' => 'rest_sanitize_boolean',
            'default' => true,
        ));

        add_settings_field(
            'spm_enable_og_tags',
            __('Enable OG Tags', 'spm-sync'),
            array($this, 'render_checkbox_field'),
            $this->page_slug,
            'spm_display_settings',
            array(
                'name' => 'spm_enable_og_tags',
                'description' => __('Add Open Graph meta tags to property pages for better social sharing', 'spm-sync'),
            )
        );

        // Property URL Pattern
        register_setting($this->page_slug, 'spm_property_url_pattern', array(
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '/property/{reference}/',
        ));

        add_settings_field(
            'spm_property_url_pattern',
            __('Property URL Pattern', 'spm-sync'),
            array($this, 'render_text_field'),
            $this->page_slug,
            'spm_display_settings',
            array(
                'name' => 'spm_property_url_pattern',
                'description' => __('URL pattern for property pages. Use {reference} or {id} as placeholders.', 'spm-sync'),
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
            'spm-sync-admin',
            SPM_SYNC_PLUGIN_URL . 'assets/admin.css',
            array(),
            SPM_SYNC_VERSION
        );

        wp_enqueue_script(
            'spm-sync-admin',
            SPM_SYNC_PLUGIN_URL . 'assets/admin.js',
            array('jquery'),
            SPM_SYNC_VERSION,
            true
        );

        wp_localize_script('spm-sync-admin', 'spmSync', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('spm_sync_nonce'),
            'strings' => array(
                'syncing' => __('Syncing...', 'spm-sync'),
                'syncComplete' => __('Sync completed!', 'spm-sync'),
                'syncError' => __('Sync failed:', 'spm-sync'),
                'checking' => __('Checking...', 'spm-sync'),
            ),
        ));
    }

    /**
     * Render API section description
     */
    public function render_api_section() {
        echo '<p>' . esc_html__('Configure your SPM Dashboard API connection.', 'spm-sync') . '</p>';
    }

    /**
     * Render display section description
     */
    public function render_display_section() {
        echo '<p>' . esc_html__('Configure how property data is displayed on your site.', 'spm-sync') . '</p>';
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
        $sync = spm_sync()->sync;
        $status = $sync->get_status();
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Smart Property Widget Sync', 'spm-sync'); ?></h1>

            <div class="spm-settings-container">
                <div class="spm-settings-main">
                    <form method="post" action="options.php">
                        <?php
                        settings_fields($this->page_slug);
                        do_settings_sections($this->page_slug);
                        submit_button();
                        ?>
                    </form>
                </div>

                <div class="spm-settings-sidebar">
                    <!-- Sync Status Card -->
                    <div class="spm-card">
                        <h3><?php esc_html_e('Sync Status', 'spm-sync'); ?></h3>

                        <table class="spm-status-table">
                            <tr>
                                <th><?php esc_html_e('Local Version', 'spm-sync'); ?></th>
                                <td><?php echo esc_html($status['sync_version']); ?></td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Last Sync', 'spm-sync'); ?></th>
                                <td>
                                    <?php
                                    echo $status['last_sync']
                                        ? esc_html($status['last_sync'])
                                        : esc_html__('Never', 'spm-sync');
                                    ?>
                                </td>
                            </tr>
                            <tr>
                                <th><?php esc_html_e('Data Directory', 'spm-sync'); ?></th>
                                <td>
                                    <code><?php echo esc_html($status['data_dir']); ?></code>
                                </td>
                            </tr>
                        </table>

                        <h4><?php esc_html_e('Data Files', 'spm-sync'); ?></h4>
                        <ul class="spm-file-list">
                            <?php foreach ($status['files'] as $name => $file) : ?>
                                <li>
                                    <span class="spm-file-status <?php echo $file['exists'] ? 'exists' : 'missing'; ?>">
                                        <?php echo $file['exists'] ? '✓' : '✗'; ?>
                                    </span>
                                    <span class="spm-file-name"><?php echo esc_html($name); ?>.json</span>
                                    <?php if ($file['exists']) : ?>
                                        <span class="spm-file-size">
                                            (<?php echo esc_html(size_format($file['size'])); ?>)
                                        </span>
                                    <?php endif; ?>
                                </li>
                            <?php endforeach; ?>
                        </ul>

                        <div class="spm-sync-actions">
                            <button type="button" class="button button-primary" id="spm-manual-sync">
                                <?php esc_html_e('Sync Now', 'spm-sync'); ?>
                            </button>
                            <button type="button" class="button" id="spm-check-version">
                                <?php esc_html_e('Check Updates', 'spm-sync'); ?>
                            </button>
                        </div>

                        <div id="spm-sync-result" class="spm-sync-result" style="display: none;"></div>
                    </div>

                    <!-- Webhook Info Card -->
                    <div class="spm-card">
                        <h3><?php esc_html_e('Webhook Endpoint', 'spm-sync'); ?></h3>
                        <p><?php esc_html_e('Configure this URL in your SPM Dashboard webhook settings:', 'spm-sync'); ?></p>
                        <code class="spm-webhook-url"><?php echo esc_url(SPM_Webhook::get_webhook_url()); ?></code>
                        <button type="button" class="button button-small spm-copy-btn" data-copy="<?php echo esc_attr(SPM_Webhook::get_webhook_url()); ?>">
                            <?php esc_html_e('Copy', 'spm-sync'); ?>
                        </button>
                    </div>

                    <!-- Help Card -->
                    <div class="spm-card">
                        <h3><?php esc_html_e('Need Help?', 'spm-sync'); ?></h3>
                        <ul>
                            <li><a href="https://docs.smartpropertywidget.com" target="_blank"><?php esc_html_e('Documentation', 'spm-sync'); ?></a></li>
                            <li><a href="https://smartpropertywidget.com/support" target="_blank"><?php esc_html_e('Support', 'spm-sync'); ?></a></li>
                        </ul>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }
}
