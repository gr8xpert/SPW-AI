<?php
if (!defined('ABSPATH')) exit;

/**
 * Minimal wrapper around wp_remote_get for SPM public API.
 * Always sends x-api-key header. Returns decoded JSON or WP_Error.
 */
class SPM_API_Client {

    public static function get($path, $params = [], $timeout = 15) {
        // Same base URL the browser widget gets (SPM_Plugin::inject_config), so
        // a wp-config SPM_API_URL override applies to Test Connection, sync,
        // OG tags and the sitemap too.
        $base = rtrim(defined('SPM_API_URL') ? SPM_API_URL : SPM_API_DEFAULT, '/');
        $key  = SPM_Plugin::get('api_key');

        if (!$key) return new WP_Error('spm_no_api_key', 'API key not configured');

        $url = $base . '/' . ltrim($path, '/');
        if (!empty($params)) $url = add_query_arg($params, $url);

        $resp = wp_remote_get($url, [
            'timeout' => $timeout,
            'headers' => [
                'x-api-key' => $key,
                'Accept'    => 'application/json',
                // Lets the SPM dashboard show this site on its Website Health page.
                'x-spm-site'   => home_url('/'),
                'x-spm-plugin' => SPM_VERSION,
            ],
        ]);

        if (is_wp_error($resp)) {
            // wp_remote_get reports transport-level failures (DNS, TCP, TLS,
            // timeouts) as WP_Error before the request reaches the server.
            return new WP_Error(
                'spm_network',
                __("Couldn't reach the API server. Check your hosting's outbound HTTPS access.", 'spm'),
                ['raw' => $resp->get_error_message()]
            );
        }
        $code = wp_remote_retrieve_response_code($resp);
        $raw  = wp_remote_retrieve_body($resp);
        if ($code !== 200) {
            return new WP_Error(
                'spm_http_' . $code,
                self::friendly_message_for_status($code),
                ['status' => $code, 'raw' => $raw]
            );
        }

        $body = json_decode($raw, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return new WP_Error(
                'spm_bad_json',
                __('The API returned a response that could not be parsed. Try again or contact support.', 'spm'),
                ['raw' => substr($raw, 0, 500)]
            );
        }
        return $body;
    }

    /** Convenience: test the API key. Returns true / WP_Error. */
    public static function test_connection() {
        $r = self::get('api/v1/sync-meta');
        if (is_wp_error($r)) return $r;
        return true;
    }

    /**
     * Map HTTP status codes to short, action-oriented messages aimed at
     * non-technical admins. Raw response bodies stay in the WP_Error's data
     * for debugging. Public so the settings view can translate legacy stored
     * error strings on render (forward-compat with older saved sync results).
     */
    public static function friendly_message_for_status($code) {
        switch ((int) $code) {
            case 401:
                return __('Invalid API key. Copy it again from your SPM dashboard → Settings → API Keys.', 'spm');
            case 403:
                return __('Your API key is valid but lacks permission for this endpoint. Check your dashboard plan limits.', 'spm');
            case 404:
                return __('Endpoint not found. The API URL constant may be wrong, or this widget feature is disabled on your plan.', 'spm');
            case 408:
            case 504:
                return __('The API took too long to respond. Try syncing again in a moment.', 'spm');
            case 429:
                return __('Rate limit reached. Wait a minute and try syncing again.', 'spm');
            case 500:
            case 502:
            case 503:
                return __('The SPM server is temporarily unavailable. Try again in a few minutes.', 'spm');
            default:
                return sprintf(
                    /* translators: %d: HTTP status code */
                    __('Sync failed (HTTP %d). If this keeps happening, contact support.', 'spm'),
                    (int) $code
                );
        }
    }
}
