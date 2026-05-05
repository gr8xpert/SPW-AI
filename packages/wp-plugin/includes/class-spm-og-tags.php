<?php
/**
 * SPM OG Tags Handler
 *
 * Renders Open Graph meta tags for property pages
 *
 * @package SPM_Sync
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

/**
 * SPM_OG_Tags class
 */
class SPM_OG_Tags {

    /**
     * Current property data
     *
     * @var array|null
     */
    private $current_property = null;

    /**
     * Constructor
     */
    public function __construct() {
        // Only if OG tags are enabled
        if (get_option('spm_enable_og_tags', true)) {
            add_action('wp_head', array($this, 'render_og_tags'), 5);
            add_filter('document_title_parts', array($this, 'filter_title'));
            add_filter('pre_get_document_title', array($this, 'filter_document_title'));
        }
    }

    /**
     * Check if current page is a property page
     *
     * @return bool
     */
    private function is_property_page() {
        // Get URL pattern from settings
        $pattern = get_option('spm_property_url_pattern', '/property/{reference}/');

        if (empty($pattern)) {
            return false;
        }

        // Convert pattern to regex
        // {reference} -> capture group
        $regex = preg_quote($pattern, '/');
        $regex = str_replace(
            array('\{reference\}', '\{id\}'),
            array('([a-zA-Z0-9\-_]+)', '(\d+)'),
            $regex
        );
        $regex = '/^' . $regex . '$/';

        // Get current URL path
        $current_path = wp_parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
        $current_path = rtrim($current_path, '/') . '/';

        // Check match
        if (preg_match($regex, $current_path, $matches)) {
            // Store the reference/id for later use
            if (isset($matches[1])) {
                $this->load_property($matches[1]);
                return true;
            }
        }

        // Also check for query parameter
        if (isset($_GET['spm_property'])) {
            $this->load_property(sanitize_text_field($_GET['spm_property']));
            return $this->current_property !== null;
        }

        return false;
    }

    /**
     * Load property data by reference or ID
     *
     * @param string $identifier Property reference or ID
     */
    private function load_property($identifier) {
        // Try to load from API cache or make request
        $dashboard_url = rtrim(get_option('spm_dashboard_url', ''), '/');
        $api_key = get_option('spm_api_key', '');

        if (empty($dashboard_url) || empty($api_key)) {
            return;
        }

        // Check transient cache first
        $cache_key = 'spm_property_' . md5($identifier);
        $cached = get_transient($cache_key);

        if ($cached !== false) {
            $this->current_property = $cached;
            return;
        }

        // Fetch from API
        $url = $dashboard_url . '/api/v1/properties/' . urlencode($identifier);

        $response = wp_remote_get($url, array(
            'headers' => array(
                'X-API-Key' => $api_key,
                'Accept' => 'application/json',
            ),
            'timeout' => 10,
        ));

        if (is_wp_error($response)) {
            return;
        }

        $status_code = wp_remote_retrieve_response_code($response);

        if ($status_code !== 200) {
            return;
        }

        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);

        if (json_last_error() === JSON_ERROR_NONE && isset($data['id'])) {
            $this->current_property = $data;
            // Cache for 15 minutes
            set_transient($cache_key, $data, 15 * MINUTE_IN_SECONDS);
        }
    }

    /**
     * Get current property
     *
     * @return array|null
     */
    public function get_current_property() {
        if ($this->current_property === null) {
            $this->is_property_page();
        }
        return $this->current_property;
    }

    /**
     * Render OG meta tags
     */
    public function render_og_tags() {
        if (!$this->is_property_page() || $this->current_property === null) {
            return;
        }

        $property = $this->current_property;
        $language = get_locale();
        $lang_code = substr($language, 0, 2);

        // Get localized title and description
        $title = wp_strip_all_tags($this->get_localized_text($property, 'title', $lang_code));
        $description = $this->get_localized_text($property, 'description', $lang_code);

        // Truncate description
        $description = wp_trim_words(strip_tags($description), 30, '...');

        // Get price display
        $price_display = $this->format_price($property);

        // Get main image
        $image = '';
        if (!empty($property['images']) && is_array($property['images'])) {
            $first_image = reset($property['images']);
            $image = is_array($first_image) ? ($first_image['url'] ?? '') : $first_image;
        }

        // Get location
        $location = '';
        if (isset($property['location'])) {
            $location = is_array($property['location'])
                ? ($property['location']['name'] ?? '')
                : $property['location'];
        }

        // Build full title
        $full_title = $title;
        if (!empty($location)) {
            $full_title .= ' | ' . $location;
        }

        // Current URL
        $current_url = home_url($_SERVER['REQUEST_URI']);

        // Site name
        $site_name = get_bloginfo('name');

        // Output meta tags
        ?>
        <!-- SPM Property OG Tags -->
        <meta property="og:type" content="website" />
        <meta property="og:title" content="<?php echo esc_attr($full_title); ?>" />
        <meta property="og:description" content="<?php echo esc_attr($price_display . ' - ' . $description); ?>" />
        <meta property="og:url" content="<?php echo esc_url($current_url); ?>" />
        <meta property="og:site_name" content="<?php echo esc_attr($site_name); ?>" />
        <?php if (!empty($image)) : ?>
        <meta property="og:image" content="<?php echo esc_url($image); ?>" />
        <meta property="og:image:alt" content="<?php echo esc_attr($title); ?>" />
        <?php endif; ?>

        <!-- Twitter Card -->
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="<?php echo esc_attr($full_title); ?>" />
        <meta name="twitter:description" content="<?php echo esc_attr($price_display . ' - ' . $description); ?>" />
        <?php if (!empty($image)) : ?>
        <meta name="twitter:image" content="<?php echo esc_url($image); ?>" />
        <?php endif; ?>

        <!-- Additional Meta -->
        <meta name="description" content="<?php echo esc_attr($description); ?>" />
        <?php if (!empty($property['reference'])) : ?>
        <meta name="property:reference" content="<?php echo esc_attr($property['reference']); ?>" />
        <?php endif; ?>
        <!-- /SPM Property OG Tags -->
        <?php
    }

    /**
     * Filter document title for property pages
     *
     * @param string $title Current title
     * @return string Modified title
     */
    public function filter_document_title($title) {
        if (!$this->is_property_page() || $this->current_property === null) {
            return $title;
        }

        $property = $this->current_property;
        $language = get_locale();
        $lang_code = substr($language, 0, 2);

        $prop_title = wp_strip_all_tags($this->get_localized_text($property, 'title', $lang_code));

        // Get location
        $location = '';
        if (isset($property['location'])) {
            $location = wp_strip_all_tags(is_array($property['location'])
                ? ($property['location']['name'] ?? '')
                : $property['location']);
        }

        $site_name = get_bloginfo('name');

        $parts = array($prop_title);
        if (!empty($location)) {
            $parts[] = $location;
        }
        $parts[] = $site_name;

        return implode(' | ', $parts);
    }

    /**
     * Filter title parts for property pages
     *
     * @param array $title_parts Title parts
     * @return array Modified title parts
     */
    public function filter_title($title_parts) {
        if (!$this->is_property_page() || $this->current_property === null) {
            return $title_parts;
        }

        $property = $this->current_property;
        $language = get_locale();
        $lang_code = substr($language, 0, 2);

        $title_parts['title'] = wp_strip_all_tags($this->get_localized_text($property, 'title', $lang_code));

        return $title_parts;
    }

    /**
     * Get localized text from property
     *
     * @param array  $property  Property data
     * @param string $field     Field name
     * @param string $lang_code Language code
     * @return string
     */
    private function get_localized_text($property, $field, $lang_code) {
        if (!isset($property[$field])) {
            return '';
        }

        $value = $property[$field];

        // If it's an array (multilingual)
        if (is_array($value)) {
            // Try requested language
            if (isset($value[$lang_code])) {
                return $value[$lang_code];
            }
            // Fall back to English
            if (isset($value['en'])) {
                return $value['en'];
            }
            // Return first available
            return reset($value) ?: '';
        }

        return (string) $value;
    }

    /**
     * Format property price
     *
     * @param array $property Property data
     * @return string
     */
    private function format_price($property) {
        if (!empty($property['priceOnRequest']) || empty($property['price'])) {
            return __('Price on request', 'spm-sync');
        }

        $price = (float) $property['price'];
        $currency = $property['currency'] ?? 'EUR';

        // Format based on currency
        $symbols = array(
            'EUR' => '€',
            'GBP' => '£',
            'USD' => '$',
        );

        $symbol = $symbols[$currency] ?? $currency . ' ';

        return $symbol . number_format($price, 0, ',', '.');
    }
}
