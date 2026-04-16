<?php
/**
 * SPW Webhook Handler
 *
 * Handles incoming webhooks from SPW Dashboard for real-time sync
 *
 * @package SPW_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPW_Webhook class
 */
class SPW_Webhook {

    /**
     * REST namespace
     *
     * @var string
     */
    private $namespace = 'spw/v1';

    /**
     * Constructor
     */
    public function __construct() {
        // Register REST routes
        add_action('rest_api_init', array($this, 'register_routes'));
    }

    /**
     * Register REST API routes
     */
    public function register_routes() {
        register_rest_route($this->namespace, '/sync', array(
            'methods' => WP_REST_Server::CREATABLE,
            'callback' => array($this, 'handle_sync_webhook'),
            'permission_callback' => array($this, 'verify_webhook_signature'),
        ));

        register_rest_route($this->namespace, '/ping', array(
            'methods' => WP_REST_Server::READABLE,
            'callback' => array($this, 'handle_ping'),
            'permission_callback' => '__return_true',
        ));
    }

    /**
     * Verify webhook signature
     *
     * @param WP_REST_Request $request Request object
     * @return bool|WP_Error
     */
    public function verify_webhook_signature($request) {
        $webhook_secret = get_option('spw_webhook_secret', '');

        // Fail closed: if no secret is configured, refuse all webhook traffic.
        // A previous version accepted requests in this state "for initial setup",
        // which left the endpoint open to unauthenticated payloads.
        if (empty($webhook_secret)) {
            error_log('SPW Sync: Webhook secret not configured — rejecting request');
            return new WP_Error(
                'webhook_not_configured',
                __('Webhook secret not configured on this site', 'spw-sync'),
                array('status' => 503)
            );
        }

        $signature = $request->get_header('X-SPW-Signature');
        if (empty($signature)) {
            return new WP_Error(
                'missing_signature',
                __('Missing webhook signature', 'spw-sync'),
                array('status' => 401)
            );
        }

        $timestamp = $request->get_header('X-SPW-Timestamp');
        // Replay protection: require a recent timestamp. Allow ±5 minutes of clock skew.
        if (!empty($timestamp)) {
            $ts = (int) $timestamp;
            if ($ts <= 0 || abs(time() - $ts) > 300) {
                return new WP_Error(
                    'stale_timestamp',
                    __('Webhook timestamp out of range', 'spw-sync'),
                    array('status' => 401)
                );
            }
            $signed_payload = $ts . '.' . $request->get_body();
        } else {
            // Backward compatibility with v1 senders that don't send a timestamp.
            // New senders must include X-SPW-Timestamp.
            $signed_payload = $request->get_body();
        }

        $expected_signature = hash_hmac('sha256', $signed_payload, $webhook_secret);

        if (!hash_equals($expected_signature, $signature)) {
            return new WP_Error(
                'invalid_signature',
                __('Invalid webhook signature', 'spw-sync'),
                array('status' => 401)
            );
        }

        return true;
    }

    /**
     * Handle sync webhook
     *
     * @param WP_REST_Request $request Request object
     * @return WP_REST_Response
     */
    public function handle_sync_webhook($request) {
        $payload = $request->get_json_params();

        // Log incoming webhook
        $this->log_webhook($payload);

        // Validate payload
        if (!isset($payload['event'])) {
            return new WP_REST_Response(array(
                'status' => 'error',
                'message' => 'Missing event type',
            ), 400);
        }

        // Process based on event type
        switch ($payload['event']) {
            case 'sync.required':
                return $this->handle_sync_required($payload);

            case 'property.created':
            case 'property.updated':
            case 'property.deleted':
                return $this->handle_property_change($payload);

            case 'settings.changed':
                return $this->handle_settings_change($payload);

            case 'test':
                return $this->handle_test_webhook($payload);

            default:
                return new WP_REST_Response(array(
                    'status' => 'ignored',
                    'message' => 'Unknown event type',
                ), 200);
        }
    }

    /**
     * Handle sync.required event
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_sync_required($payload) {
        $remote_version = isset($payload['sync_version']) ? (int) $payload['sync_version'] : 0;
        $local_version = (int) get_option('spw_sync_version', 0);

        // Check if sync needed
        if ($remote_version <= $local_version) {
            return new WP_REST_Response(array(
                'status' => 'ok',
                'message' => 'Already up to date',
                'local_version' => $local_version,
                'remote_version' => $remote_version,
            ), 200);
        }

        // Determine which types to sync
        $types = isset($payload['changed']) ? $payload['changed'] : null;

        // Perform sync
        $sync = spw_sync()->sync;
        $results = $sync->sync_all_data($types);

        return new WP_REST_Response(array(
            'status' => $results['success'] ? 'ok' : 'error',
            'message' => $results['success'] ? 'Sync completed' : 'Sync failed',
            'synced' => $results['synced'],
            'errors' => $results['errors'],
        ), $results['success'] ? 200 : 500);
    }

    /**
     * Handle property change events
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_property_change($payload) {
        // For property changes, we don't sync the full data
        // Just update the sync version to indicate data is stale
        if (isset($payload['sync_version'])) {
            // Trigger a full sync if version changed significantly
            $remote_version = (int) $payload['sync_version'];
            $local_version = (int) get_option('spw_sync_version', 0);

            if ($remote_version > $local_version) {
                // Schedule async sync
                wp_schedule_single_event(time() + 5, 'spw_async_sync');
            }
        }

        // Fire action for custom handling
        do_action('spw_property_changed', $payload);

        return new WP_REST_Response(array(
            'status' => 'ok',
            'message' => 'Property change acknowledged',
        ), 200);
    }

    /**
     * Handle settings.changed event
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_settings_change($payload) {
        // Sync labels and config
        $sync = spw_sync()->sync;
        $results = $sync->sync_types(array('labels', 'config'));

        // Fire action for custom handling
        do_action('spw_settings_changed', $payload);

        return new WP_REST_Response(array(
            'status' => $results['success'] ? 'ok' : 'error',
            'message' => $results['success'] ? 'Settings synced' : 'Sync failed',
        ), $results['success'] ? 200 : 500);
    }

    /**
     * Handle test webhook
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_test_webhook($payload) {
        return new WP_REST_Response(array(
            'status' => 'ok',
            'message' => 'Webhook test successful',
            'received_at' => current_time('mysql'),
            'payload' => $payload,
        ), 200);
    }

    /**
     * Handle ping request
     *
     * @param WP_REST_Request $request Request object
     * @return WP_REST_Response
     */
    public function handle_ping($request) {
        return new WP_REST_Response(array(
            'status' => 'ok',
            'plugin' => 'spw-sync',
            'version' => SPW_SYNC_VERSION,
            'timestamp' => current_time('mysql'),
        ), 200);
    }

    /**
     * Log webhook
     *
     * @param array $payload Webhook payload
     */
    private function log_webhook($payload) {
        $log_file = SPW_SYNC_DATA_DIR . 'webhooks.log';

        $log_entry = sprintf(
            "[%s] Event: %s - Payload: %s\n",
            current_time('mysql'),
            isset($payload['event']) ? $payload['event'] : 'unknown',
            json_encode($payload)
        );

        // Keep log file under 1MB
        if (file_exists($log_file) && filesize($log_file) > 1048576) {
            $content = file_get_contents($log_file, false, null, -524288);
            file_put_contents($log_file, $content);
        }

        file_put_contents($log_file, $log_entry, FILE_APPEND);
    }

    /**
     * Get webhook URL
     *
     * @return string
     */
    public static function get_webhook_url() {
        return rest_url('spw/v1/sync');
    }
}

// Register async sync action
add_action('spw_async_sync', function () {
    $sync = spw_sync()->sync;
    $sync->sync_all_data();
});
