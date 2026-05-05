<?php
/**
 * SPM Webhook Handler
 *
 * Handles incoming webhooks from SPM Dashboard for real-time sync
 *
 * @package SPM_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPM_Webhook class
 */
class SPM_Webhook {

    /**
     * REST namespace
     *
     * @var string
     */
    private $namespace = 'spm/v1';

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
            'permission_callback' => array($this, 'verify_ping_auth'),
        ));
    }

    /**
     * Verify ping request has a valid API key.
     *
     * @param WP_REST_Request $request Request object
     * @return bool|WP_Error
     */
    public function verify_ping_auth($request) {
        $api_key = get_option('spm_api_key', '');
        $header  = $request->get_header('X-API-Key');
        if (empty($api_key) || empty($header) || !hash_equals($api_key, $header)) {
            return new WP_Error(
                'unauthorized',
                __('Invalid or missing API key', 'spm-sync'),
                array('status' => 401)
            );
        }
        return true;
    }

    /**
     * Verify webhook signature
     *
     * @param WP_REST_Request $request Request object
     * @return bool|WP_Error
     */
    public function verify_webhook_signature($request) {
        $webhook_secret = get_option('spm_webhook_secret', '');

        // Fail closed: if no secret is configured, refuse all webhook traffic.
        // A previous version accepted requests in this state "for initial setup",
        // which left the endpoint open to unauthenticated payloads.
        if (empty($webhook_secret)) {
            error_log('SPM Sync: Webhook secret not configured — rejecting request');
            return new WP_Error(
                'webhook_not_configured',
                __('Webhook secret not configured on this site', 'spm-sync'),
                array('status' => 503)
            );
        }

        $signature_header = $request->get_header('X-SPM-Signature');
        if (empty($signature_header)) {
            return new WP_Error(
                'missing_signature',
                __('Missing webhook signature', 'spm-sync'),
                array('status' => 401)
            );
        }

        // v2 senders use a Stripe-style header: `t=<unix>,v1=<hex>`. Extract the
        // `v1=` scheme. Legacy senders send the raw hex string on its own.
        // Supporting both so an older sender can still talk to a new plugin
        // during rolling upgrades.
        $signature = $this->extract_v1_signature($signature_header);

        $timestamp = $request->get_header('X-SPM-Timestamp');
        // Replay protection: require a recent timestamp. Allow ±5 minutes of clock skew.
        if (!empty($timestamp)) {
            $ts = (int) $timestamp;
            if ($ts <= 0 || abs(time() - $ts) > 300) {
                return new WP_Error(
                    'stale_timestamp',
                    __('Webhook timestamp out of range', 'spm-sync'),
                    array('status' => 401)
                );
            }
            $signed_payload = $ts . '.' . $request->get_body();
        } else {
            // Backward compatibility with v1 senders that don't send a timestamp.
            // New senders must include X-SPM-Timestamp.
            $signed_payload = $request->get_body();
        }

        $expected_signature = hash_hmac('sha256', $signed_payload, $webhook_secret);

        if (!hash_equals($expected_signature, $signature)) {
            return new WP_Error(
                'invalid_signature',
                __('Invalid webhook signature', 'spm-sync'),
                array('status' => 401)
            );
        }

        return true;
    }

    /**
     * Parse the X-SPM-Signature header. Returns the hex-digest portion.
     *
     * Accepts:
     *   - `t=<unix>,v1=<hex>` (v2 format, what the current server sends)
     *   - `<hex>` (legacy raw format)
     *
     * @param string $header Raw header value.
     * @return string Hex digest (or empty string if not parseable).
     */
    private function extract_v1_signature($header) {
        if (strpos($header, 'v1=') === false) {
            // Legacy: assume the whole header is the hex digest.
            return trim($header);
        }
        $parts = explode(',', $header);
        foreach ($parts as $part) {
            $part = trim($part);
            if (strpos($part, 'v1=') === 0) {
                return substr($part, 3);
            }
        }
        return '';
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

            case 'cache.invalidated':
                return $this->handle_cache_invalidated($payload);

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
     * Handle cache.invalidated event.
     *
     * Fired when a tenant admin (or super-admin) clicks "Clear widget cache"
     * in the SPM dashboard. The server bumps its syncVersion and sends this
     * webhook so the plugin can refresh local JSON immediately — otherwise
     * the widget would only pick up fresh data after its next 60s poll.
     *
     * v2 envelope: { event, deliveryId, createdAt, data: { tenantId,
     *   syncVersion, clearedAt, triggeredBy } }
     *
     * @param array $payload Webhook payload.
     * @return WP_REST_Response
     */
    private function handle_cache_invalidated($payload) {
        $data = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : array();
        $remote_version = isset($data['syncVersion']) ? (int) $data['syncVersion'] : 0;
        $local_version  = (int) get_option('spm_sync_version', 0);

        // Record the incoming version up-front so a subsequent duplicate
        // delivery (retry) is treated as a no-op by handle_sync_required.
        if ($remote_version > $local_version) {
            update_option('spm_sync_version', $remote_version);
        }

        // Defer the heavy lift so the webhook responds under 10s (our
        // server times out at that mark). spm_async_sync is the same hook
        // property.* uses.
        wp_schedule_single_event(time() + 1, 'spm_async_sync');

        // Let integrations hook in — e.g. a site that wants to purge a
        // page-cache plugin (WP Rocket, W3TC) when SPM data changes.
        do_action('spm_cache_invalidated', $payload);

        return new WP_REST_Response(array(
            'status'         => 'ok',
            'message'        => 'Cache invalidation queued',
            'remote_version' => $remote_version,
            'local_version'  => $local_version,
            'cleared_at'     => isset($data['clearedAt']) ? $data['clearedAt'] : null,
        ), 200);
    }

    /**
     * Extract a sync_version from either v2 envelope ($payload['data']
     * ['sync_version']) or legacy v1 top-level ($payload['sync_version']).
     *
     * v2 senders wrap all event-specific data inside a `data` key, leaving
     * top-level for envelope fields (event, deliveryId, createdAt). v1
     * senders put everything at the top level. Supporting both keeps the
     * plugin tolerant of rolling upgrades on the server side.
     *
     * @param array $payload Webhook payload.
     * @return int 0 when neither envelope carries a sync_version.
     */
    private function extract_sync_version($payload) {
        if (isset($payload['data']) && is_array($payload['data']) && isset($payload['data']['sync_version'])) {
            return (int) $payload['data']['sync_version'];
        }
        // Also accept 'syncVersion' (camelCase) — v2 property.* webhooks send
        // this form because NestJS payloads are camelCase across the wire.
        if (isset($payload['data']) && is_array($payload['data']) && isset($payload['data']['syncVersion'])) {
            return (int) $payload['data']['syncVersion'];
        }
        if (isset($payload['sync_version'])) {
            return (int) $payload['sync_version'];
        }
        return 0;
    }

    /**
     * Handle sync.required event
     *
     * v2 envelope: { event, deliveryId, createdAt, data: { sync_version,
     *   changed } }. v1 envelope keeps those fields at the top level. We
     * support both.
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_sync_required($payload) {
        $remote_version = $this->extract_sync_version($payload);
        $local_version = (int) get_option('spm_sync_version', 0);

        // Check if sync needed
        if ($remote_version <= $local_version) {
            return new WP_REST_Response(array(
                'status' => 'ok',
                'message' => 'Already up to date',
                'local_version' => $local_version,
                'remote_version' => $remote_version,
            ), 200);
        }

        // Determine which types to sync (v2 nests under data, v1 at top level)
        $data = isset($payload['data']) && is_array($payload['data']) ? $payload['data'] : array();
        $types = null;
        if (isset($data['changed'])) {
            $types = $data['changed'];
        } elseif (isset($payload['changed'])) {
            $types = $payload['changed'];
        }

        // Perform sync
        $sync = spm_sync()->sync;
        $results = $sync->sync_all_data($types);

        return new WP_REST_Response(array(
            'status' => $results['success'] ? 'ok' : 'error',
            'message' => $results['success'] ? 'Sync completed' : 'Sync failed',
            'synced' => $results['synced'],
            'errors' => $results['errors'],
        ), $results['success'] ? 200 : 500);
    }

    /**
     * Handle property change events (property.created | property.updated |
     * property.deleted).
     *
     * v2 behaviour: the arrival of a property.* webhook IS the signal that
     * data changed — server-side, every property write also bumps
     * tenant.syncVersion. We record the new version so a subsequent poll
     * doesn't re-trigger, then schedule spm_async_sync unconditionally.
     * The 5-second delay dedupes bursts (bulk import fires many in a row).
     *
     * v1 fallback: the old behaviour that gated scheduling on "remote
     * version > local version" is preserved for legacy senders that still
     * include sync_version at the top level.
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_property_change($payload) {
        $remote_version = $this->extract_sync_version($payload);
        $local_version  = (int) get_option('spm_sync_version', 0);

        if ($remote_version > $local_version) {
            update_option('spm_sync_version', $remote_version);
        }

        // v2: always schedule — the webhook itself is proof something
        // changed. Debounced 5s so a bulk import doesn't fire a storm.
        // v1 fallback: only schedule when the version actually advanced,
        // matching the pre-v2 behaviour operators came to expect.
        if ($remote_version === 0 || $remote_version > $local_version) {
            wp_schedule_single_event(time() + 5, 'spm_async_sync');
        }

        // Fire action for custom handling
        do_action('spm_property_changed', $payload);

        return new WP_REST_Response(array(
            'status'         => 'ok',
            'message'        => 'Property change acknowledged',
            'remote_version' => $remote_version,
            'local_version'  => $local_version,
        ), 200);
    }

    /**
     * Handle settings.changed event
     *
     * @param array $payload Webhook payload
     * @return WP_REST_Response
     */
    private function handle_settings_change($payload) {
        // If the event carried a newer sync_version, persist it before the
        // sync runs so duplicate deliveries are no-ops.
        $remote_version = $this->extract_sync_version($payload);
        $local_version  = (int) get_option('spm_sync_version', 0);
        if ($remote_version > $local_version) {
            update_option('spm_sync_version', $remote_version);
        }

        // Sync labels and config
        $sync = spm_sync()->sync;
        $results = $sync->sync_types(array('labels', 'config'));

        // Fire action for custom handling
        do_action('spm_settings_changed', $payload);

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
        // sync_version + last_sync_at surfaced here so the SPM dashboard
        // (or an operator poking by hand) can see how far behind the plugin
        // is without grepping through log files.
        return new WP_REST_Response(array(
            'status'       => 'ok',
            'plugin'       => 'spm-sync',
            'version'      => SPM_SYNC_VERSION,
            'timestamp'    => current_time('mysql'),
            'sync_version' => (int) get_option('spm_sync_version', 0),
            'last_sync_at' => get_option('spm_last_sync', null),
        ), 200);
    }

    /**
     * Log webhook
     *
     * @param array $payload Webhook payload
     */
    private function log_webhook($payload) {
        $log_file = SPM_SYNC_DATA_DIR . 'webhooks.log';

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
        chmod($log_file, 0600);
    }

    /**
     * Get webhook URL
     *
     * @return string
     */
    public static function get_webhook_url() {
        return rest_url('spm/v1/sync');
    }
}

// Register async sync action
add_action('spm_async_sync', function () {
    $sync = spm_sync()->sync;
    $sync->sync_all_data();
});
