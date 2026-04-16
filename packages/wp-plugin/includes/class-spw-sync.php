<?php
/**
 * SPW Sync Handler
 *
 * Handles data synchronization from SPW Dashboard API
 *
 * @package SPW_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPW_Sync class
 */
class SPW_Sync {

    /**
     * API endpoint for sync data
     *
     * @var string
     */
    private $api_endpoint = '/api/v1/sync/data';

    /**
     * API endpoint for sync version
     *
     * @var string
     */
    private $version_endpoint = '/api/v1/sync/version';

    /**
     * Constructor
     */
    public function __construct() {
        // Register AJAX handlers for manual sync
        add_action('wp_ajax_spw_manual_sync', array($this, 'ajax_manual_sync'));
        add_action('wp_ajax_spw_check_version', array($this, 'ajax_check_version'));
    }

    /**
     * Get dashboard URL
     *
     * @return string
     */
    private function get_dashboard_url() {
        return rtrim(get_option('spw_dashboard_url', ''), '/');
    }

    /**
     * Get API key
     *
     * @return string
     */
    private function get_api_key() {
        return get_option('spw_api_key', '');
    }

    /**
     * Make API request
     *
     * @param string $endpoint API endpoint
     * @param array  $params   Query parameters
     * @return array|WP_Error Response data or error
     */
    private function api_request($endpoint, $params = array()) {
        $dashboard_url = $this->get_dashboard_url();
        $api_key = $this->get_api_key();

        if (empty($dashboard_url) || empty($api_key)) {
            return new WP_Error('missing_config', __('API configuration is missing', 'spw-sync'));
        }

        $url = $dashboard_url . $endpoint;

        if (!empty($params)) {
            $url = add_query_arg($params, $url);
        }

        $response = wp_remote_get($url, array(
            'headers' => array(
                'X-API-Key' => $api_key,
                'Accept' => 'application/json',
            ),
            'timeout' => 30,
        ));

        if (is_wp_error($response)) {
            return $response;
        }

        $status_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        if ($status_code !== 200) {
            return new WP_Error(
                'api_error',
                sprintf(__('API returned status %d', 'spw-sync'), $status_code)
            );
        }

        $data = json_decode($body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            return new WP_Error('json_error', __('Invalid JSON response', 'spw-sync'));
        }

        return $data;
    }

    /**
     * Check remote sync version
     *
     * @return array|WP_Error Version info or error
     */
    public function check_version() {
        return $this->api_request($this->version_endpoint);
    }

    /**
     * Sync all data from API
     *
     * @param array|null $types Specific types to sync (null for all)
     * @return array Sync results
     */
    public function sync_all_data($types = null) {
        $default_types = array('locations', 'types', 'features', 'labels', 'config');
        $types = $types ?? $default_types;

        $results = array(
            'success' => true,
            'synced' => array(),
            'errors' => array(),
            'timestamp' => current_time('mysql'),
        );

        // Fetch data from API
        $data = $this->api_request($this->api_endpoint, array('types' => $types));

        if (is_wp_error($data)) {
            $results['success'] = false;
            $results['errors'][] = $data->get_error_message();
            return $results;
        }

        // Write each type to JSON file
        foreach ($types as $type) {
            if (isset($data[$type])) {
                $written = $this->write_json_file($type . '.json', $data[$type]);

                if ($written) {
                    $results['synced'][] = $type;
                } else {
                    $results['errors'][] = sprintf(__('Failed to write %s.json', 'spw-sync'), $type);
                }
            }
        }

        // Update sync meta
        if (isset($data['sync_version'])) {
            update_option('spw_sync_version', $data['sync_version']);
        }

        // Write sync meta file
        $this->write_json_file('sync_meta.json', array(
            'version' => get_option('spw_sync_version', 0),
            'synced_at' => $results['timestamp'],
            'synced_types' => $results['synced'],
        ));

        // Update last sync time
        update_option('spw_last_sync', $results['timestamp']);

        // Log sync
        $this->log_sync($results);

        return $results;
    }

    /**
     * Sync specific types
     *
     * @param array $types Types to sync
     * @return array Sync results
     */
    public function sync_types($types) {
        return $this->sync_all_data($types);
    }

    /**
     * Write JSON file to data directory
     *
     * @param string $filename File name
     * @param mixed  $data     Data to write
     * @return bool Success
     */
    private function write_json_file($filename, $data) {
        $file_path = SPW_SYNC_DATA_DIR . $filename;

        $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

        if ($json === false) {
            return false;
        }

        $result = file_put_contents($file_path, $json);

        return $result !== false;
    }

    /**
     * Read JSON file from data directory
     *
     * @param string $filename File name
     * @return mixed|null Data or null on failure
     */
    public function read_json_file($filename) {
        $file_path = SPW_SYNC_DATA_DIR . $filename;

        if (!file_exists($file_path)) {
            return null;
        }

        $content = file_get_contents($file_path);

        if ($content === false) {
            return null;
        }

        return json_decode($content, true);
    }

    /**
     * Get local sync version
     *
     * @return int
     */
    public function get_local_version() {
        return (int) get_option('spw_sync_version', 0);
    }

    /**
     * Check if sync is needed
     *
     * @return bool
     */
    public function needs_sync() {
        $remote = $this->check_version();

        if (is_wp_error($remote)) {
            return false;
        }

        $local_version = $this->get_local_version();
        $remote_version = isset($remote['version']) ? (int) $remote['version'] : 0;

        return $remote_version > $local_version;
    }

    /**
     * Log sync operation
     *
     * @param array $results Sync results
     */
    private function log_sync($results) {
        $log_file = SPW_SYNC_DATA_DIR . 'sync.log';

        $log_entry = sprintf(
            "[%s] Sync %s - Synced: %s - Errors: %s\n",
            $results['timestamp'],
            $results['success'] ? 'SUCCESS' : 'FAILED',
            implode(', ', $results['synced']),
            implode(', ', $results['errors'])
        );

        // Keep log file under 1MB
        if (file_exists($log_file) && filesize($log_file) > 1048576) {
            // Read last 500KB
            $content = file_get_contents($log_file, false, null, -524288);
            file_put_contents($log_file, $content);
        }

        file_put_contents($log_file, $log_entry, FILE_APPEND);
    }

    /**
     * AJAX handler for manual sync
     */
    public function ajax_manual_sync() {
        // Verify nonce
        if (!check_ajax_referer('spw_sync_nonce', 'nonce', false)) {
            wp_send_json_error(array('message' => __('Security check failed', 'spw-sync')));
        }

        // Check permissions
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => __('Permission denied', 'spw-sync')));
        }

        // Perform sync
        $results = $this->sync_all_data();

        if ($results['success']) {
            wp_send_json_success(array(
                'message' => sprintf(
                    __('Sync completed. Updated: %s', 'spw-sync'),
                    implode(', ', $results['synced'])
                ),
                'results' => $results,
            ));
        } else {
            wp_send_json_error(array(
                'message' => sprintf(
                    __('Sync failed: %s', 'spw-sync'),
                    implode(', ', $results['errors'])
                ),
                'results' => $results,
            ));
        }
    }

    /**
     * AJAX handler for version check
     */
    public function ajax_check_version() {
        // Verify nonce
        if (!check_ajax_referer('spw_sync_nonce', 'nonce', false)) {
            wp_send_json_error(array('message' => __('Security check failed', 'spw-sync')));
        }

        // Check permissions
        if (!current_user_can('manage_options')) {
            wp_send_json_error(array('message' => __('Permission denied', 'spw-sync')));
        }

        $remote = $this->check_version();

        if (is_wp_error($remote)) {
            wp_send_json_error(array('message' => $remote->get_error_message()));
        }

        $local_version = $this->get_local_version();
        $remote_version = isset($remote['version']) ? (int) $remote['version'] : 0;

        wp_send_json_success(array(
            'local_version' => $local_version,
            'remote_version' => $remote_version,
            'needs_sync' => $remote_version > $local_version,
            'last_sync' => get_option('spw_last_sync'),
        ));
    }

    /**
     * Get sync status
     *
     * @return array
     */
    public function get_status() {
        $data_files = array('locations', 'types', 'features', 'labels', 'config');
        $file_status = array();

        foreach ($data_files as $file) {
            $path = SPW_SYNC_DATA_DIR . $file . '.json';
            $file_status[$file] = array(
                'exists' => file_exists($path),
                'size' => file_exists($path) ? filesize($path) : 0,
                'modified' => file_exists($path) ? date('Y-m-d H:i:s', filemtime($path)) : null,
            );
        }

        return array(
            'sync_version' => $this->get_local_version(),
            'last_sync' => get_option('spw_last_sync'),
            'data_dir' => SPW_SYNC_DATA_DIR,
            'data_url' => SPW_Sync_Plugin::get_data_url(),
            'files' => $file_status,
        );
    }
}
