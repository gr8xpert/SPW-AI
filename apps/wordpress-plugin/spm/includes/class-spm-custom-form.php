<?php
if (!defined('ABSPATH')) exit;

/**
 * The client's own form (Gravity Forms, or any form shortcode) in place of
 * the widget's inquiry form on property pages.
 *
 * Settings → Property page form holds one shortcode per language
 * (`detail_forms`, lang => shortcode). The page's language uses its own,
 * else the default language's; none = the widget's built-in form.
 *
 * The form is rendered here, by WordPress, so the form plugin loads its own
 * scripts and styles and handles the submission as usual. It is written into
 * a hidden holder at the foot of the page; the widget moves it into the
 * property page where its own form would be, and fills these fields when the
 * form has them (Gravity Forms → field → Appearance → Custom CSS Class):
 *   spm-ref      the property reference
 *   spm-title    the property title
 *   spm-url      the property page address
 *   spm-message  "I am interested in …" (only when empty)
 */
class SPM_Custom_Form {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    private function __construct() {
        // Before footer scripts (priority 20), so whatever the form plugin
        // enqueues while rendering is still printed.
        add_action('wp_footer', [$this, 'render_holder'], 5);
    }

    /** The shortcode for a language: its own, else the default language's. */
    public static function shortcode_for($lang = null) {
        $forms = (array) SPM_Plugin::get('detail_forms', []);
        $i18n = SPM_I18n::instance();
        $lang = $lang ?: ($i18n->current_lang() ?: 'en');
        foreach ([$lang, $i18n->default_lang_code(), 'en'] as $code) {
            $sc = trim((string) ($forms[$code] ?? ''));
            if ($sc !== '') return $sc;
        }
        return '';
    }

    /** A saved value must be a single shortcode: "[gravityform id=\"3\" …]". */
    public static function sanitize_shortcode($value) {
        $value = trim((string) $value);
        // Editors paste from rich text: curly quotes break the attributes.
        $value = str_replace(['“', '”', '″', '‘', '’'], ['"', '"', '"', "'", "'"], $value);
        $value = sanitize_text_field($value);
        return preg_match('/^\[[a-z0-9_-]+(\s[^\[\]]*)?\]$/i', $value) ? $value : '';
    }

    public function render_holder() {
        if (!SPM_Rewrite::is_property_detail()) return;
        $sc = self::shortcode_for();
        if ($sc === '') return;
        $html = (string) do_shortcode($sc);
        // The form plugin is missing (the shortcode comes back as text) or
        // the form was deleted: keep the built-in form rather than show none.
        if ($html === $sc || stripos($html, '<form') === false) return;
        echo '<div id="spm-custom-form" data-spm-custom-form hidden>' . $html . '</div>';
    }
}
