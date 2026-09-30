<?php
if (!defined('ABSPATH')) exit;

/**
 * Shortcodes for page builders (Divi, Elementor, WPBakery), whose text
 * modules strip raw HTML.
 *
 * One shortcode per page — the whole design in one go:
 *   [spm_search]     search form
 *   [spm_listing]    property results
 *   [spm_detail]     property page
 *   [spm_map]        map search
 *   [spm_wishlist]   saved properties (all its parts)
 * They follow the design picked in the SPM dashboard → Website Design.
 * Pin one design instead with template="3" (or "listing-template-03").
 *
 * Any single part, by name:
 *   [spm block="detail_gallery"]
 *   [spm block="property_grid" limit="6" sort="price_desc"]
 *
 * Options are passed to the widget as `data-spm-<name>`, so anything that
 * works on a hand-written div works here. `class` and `id` land on the
 * element itself.
 */
class SPM_Shortcode {
    private static $instance = null;

    public static function instance() {
        if (self::$instance === null) self::$instance = new self();
        return self::$instance;
    }

    /** [spm_*] shortcode => the widget block it stands for. */
    const PAGES = [
        'spm_search'   => ['site-search', 'search-template-'],
        'spm_listing'  => ['site-listing', 'listing-template-'],
        'spm_listings' => ['site-listing', 'listing-template-'],
        'spm_detail'   => ['site-detail', 'detail-template-'],
        'spm_property' => ['site-detail', 'detail-template-'],
        'spm_map'      => ['site-map', 'map-template-'],
    ];

    private function __construct() {
        add_shortcode('spm', [$this, 'render']);
        // The plugin was called SPW before 2.3; keep that spelling working.
        add_shortcode('spw', [$this, 'render']);
        foreach (array_keys(self::PAGES) as $tag) {
            add_shortcode($tag, [$this, 'render_page']);
        }
        add_shortcode('spm_wishlist', [$this, 'render_wishlist']);
    }

    /**
     * A whole page block: the dashboard's design by default, or the one named
     * in template="" (a number, or the full id).
     */
    public function render_page($atts, $content = '', $tag = '') {
        $atts = is_array($atts) ? $atts : [];
        [$alias, $prefix] = self::PAGES[$tag] ?? self::PAGES['spm_listing'];
        $block = $alias;
        $chosen = '';
        foreach (['template', 'design', 'variation'] as $key) {
            if (!empty($atts[$key])) {
                $chosen = (string) $atts[$key];
                unset($atts[$key]);
                break;
            }
        }
        if ($chosen !== '') {
            $chosen = strtolower(trim($chosen));
            // "3", "03" and "listing-template-03" all mean the same design.
            if (preg_match('/^\d{1,2}$/', $chosen)) {
                $block = $prefix . str_pad($chosen, 2, '0', STR_PAD_LEFT);
            } elseif (strpos($chosen, $prefix) === 0) {
                $block = $chosen;
            }
        }
        $atts['block'] = $block;
        return $this->render($atts);
    }

    /** The saved-properties page: heading, buttons, the list and its windows. */
    public function render_wishlist($atts) {
        $atts = is_array($atts) ? $atts : [];
        unset($atts['block'], $atts['widget'], $atts['template']);
        $html = '';
        // No wishlist_empty here: the grid shows the "nothing saved yet"
        // message itself, so adding the block as well printed it underneath
        // a list that did have properties in it.
        foreach (['wishlist_header', 'wishlist_actions', 'wishlist_grid', 'wishlist_modals'] as $block) {
            $html .= $this->render(array_merge($atts, ['block' => $block]));
        }
        return $html;
    }

    /**
     * Shortcode attributes -> what the widget reads.
     *
     * The widget's filter engine is the only place a filter is defined, so
     * every platform behaves the same and a new filter needs no plugin
     * release: an attribute this plugin has never heard of is passed straight
     * through as data-spm-<name> (see render()). Ranges, price words, listing
     * types and fixed="yes" are all read there.
     *
     * What is left here is the one thing a browser cannot do as well: turning
     * a name into an id against the client's own lists while the page is being
     * written, so the page ships an id and the editor is told when a name is
     * ambiguous or unknown. The widget resolves names too, but it can only say
     * so in the browser console, which an editor never sees.
     *
     *   [spm_listing location="Marbella" under="500000" beds="3" own-first="yes"]
     */
    private function filters(array $atts) {
        $out = [];
        $notes = [];

        // attribute => which of the client's lists its value names
        $named = [
            'location' => 'location', 'area' => 'location', 'town' => 'location',
            'type' => 'property type', 'property-type' => 'property type',
        ];
        $lists = ['features' => 'feature', 'feature' => 'feature'];

        foreach ($atts as $key => $value) {
            if (!is_string($key)) continue;
            $key = strtolower(str_replace('_', '-', trim($key)));
            $value = is_scalar($value) ? trim((string) $value) : '';
            if ($value === '') continue;

            if (isset($named[$key])) {
                $r = SPM_Filter_Resolver::resolve($named[$key], $value);
                if ($r['id']) $out[$key] = $r['id'];
                elseif ($r['error']) $notes[] = $r['error'];
                continue;
            }

            if (isset($lists[$key])) {
                [$ids, $errors] = SPM_Filter_Resolver::ids($lists[$key], $value);
                if ($ids !== '') $out[$key] = $ids;
                foreach ($errors as $err) $notes[] = $err;
                continue;
            }
        }

        return [$out, $notes];
    }

    private static function is_yes($value) {
        return in_array(strtolower(trim((string) $value)), ['1', 'yes', 'true', 'on'], true);
    }

    public function render($atts) {
        $atts = is_array($atts) ? $atts : [];
        // The block name: block="" is the documented spelling, the others are
        // what people try first.
        $block = '';
        foreach (['block', 'widget', 'name', 'template', 'type', 0] as $key) {
            if (!empty($atts[$key])) {
                $block = (string) $atts[$key];
                unset($atts[$key]);
                break;
            }
        }
        $block = strtolower(trim($block));
        if ($block === '' || !preg_match('/^[a-z][a-z0-9_-]{1,60}$/', $block)) {
            return current_user_can('edit_posts')
                ? '<p><strong>SPM:</strong> add a block name, e.g. <code>[spm block="listing-template-01"]</code>. The full list is in SPM &rarr; Blocks.</p>'
                : '';
        }

        // own-search="yes": this block searches on its own, so one page can
        // hold several different lists.
        if (self::is_yes($atts['own-search'] ?? $atts['standalone'] ?? $atts['own_search'] ?? '')) {
            $atts['standalone'] = 'true';
        }
        // own-search is this plugin's friendlier word for it; the widget only
        // knows data-spm-standalone, so don't send both.
        unset($atts['own-search'], $atts['own_search']);
        [$filters, $notes] = $this->filters($atts);
        // Only the names we turned into ids are replaced. Everything else the
        // author wrote goes through untouched, for the widget's engine to read.
        foreach (['location', 'area', 'town', 'type', 'property-type', 'property_type', 'features', 'feature'] as $key) {
            unset($atts[$key], $atts[str_replace('-', '_', $key)]);
        }
        $atts = array_merge($atts, $filters);

        $class = 'spm-block';
        $id = '';
        $data = [];
        foreach ($atts as $key => $value) {
            if (is_int($key)) continue;
            $key = strtolower(trim((string) $key));
            if ($key === 'class') {
                $class .= ' ' . sanitize_text_field($value);
                continue;
            }
            if ($key === 'id') {
                $id = sanitize_html_class($value);
                continue;
            }
            // data_spm_limit / data-spm-limit / limit all mean the same thing,
            // and WordPress editors reach for underscores, so normalise before
            // deciding whether the name is one we can put in an attribute.
            $key = preg_replace('/^data[-_]spm[-_]/', '', str_replace('_', '-', $key));
            if (!preg_match('/^[a-z][a-z0-9-]{0,40}$/', $key)) continue;
            $data[$key] = (string) $value;
        }

        $html = '<div class="' . esc_attr($class) . '"';
        if ($id !== '') $html .= ' id="' . esc_attr($id) . '"';
        $html .= ' data-spm-widget="' . esc_attr($block) . '"';
        foreach ($data as $key => $value) {
            $html .= ' data-spm-' . esc_attr($key) . '="' . esc_attr($value) . '"';
        }
        $html .= '></div>';
        // Editors see why a name was ignored; visitors never do.
        if ($notes && current_user_can('edit_posts')) {
            $html .= '<p class="spm-block-note"><strong>SPM:</strong> filter ignored — ' . esc_html(implode('; ', $notes))
                . '. Copy the right ID from SPM &rarr; Filter IDs.</p>';
        }
        return $html;
    }
}
