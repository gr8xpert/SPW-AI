<?php
if (!defined('ABSPATH')) exit;
if (!current_user_can('manage_options')) return;

$opts        = get_option(SPW_OPTION, SPW_Plugin::default_settings());
$page_titles = (array)($opts['page_titles'] ?? []);
$page_ids = [
    'listings' => (int)($opts['listings_page_id'] ?? 0),
    'detail'   => (int)($opts['detail_page_id']   ?? 0),
    'wishlist' => (int)($opts['wishlist_page_id'] ?? 0),
];
$pages_created = 0;
foreach ($page_ids as $id) { if ($id && get_post_status($id)) $pages_created++; }

$page_types = [
    'listings' => ['default' => 'Properties',      'icon' => '&#9783;', 'desc' => 'Search + grid'],
    'detail'   => ['default' => 'Property Detail', 'icon' => '&#9783;', 'desc' => 'Single property'],
    'wishlist' => ['default' => 'Wishlist',        'icon' => '&#9825;', 'desc' => 'Saved by visitor'],
];
?>
<div class="wrap spw-wrap">
    <h1 class="spw-h1">Pages <span class="spw-ver">v<?php echo esc_html(SPW_VERSION); ?></span></h1>
    <p class="spw-tagline">One page per widget surface. Edit the title, save, then create the page &mdash; SPM drops a raw <code>&lt;div data-spm-widget="&hellip;"&gt;</code> embed inside.</p>

    <div class="spw-card">
        <div class="spw-card-head">
            <h2>Page titles</h2>
            <span class="spw-card-meta"><?php echo (int)$pages_created; ?> of 3 created</span>
        </div>
        <div class="spw-card-body">
            <p class="description">Edit a title to customize what the page will be called. Save first, then click <strong>Create Missing Pages</strong>. Existing pages are never overwritten &mdash; rename a page directly in <em>Pages &rarr; All Pages</em>.</p>

            <form method="post" action="options.php">
                <?php settings_fields('spw_settings_group'); ?>

                <div class="spw-pages-grid">
                    <?php foreach ($page_types as $type => $meta):
                        $id            = $page_ids[$type];
                        $exists        = $id && get_post_status($id);
                        $current_title = $page_titles[$type] ?? $meta['default'];
                    ?>
                        <div class="spw-page-card <?php echo $exists ? 'is-ready' : 'is-pending'; ?>">
                            <div class="spw-page-card-head">
                                <span class="spw-page-icon"><?php echo $meta['icon']; ?></span>
                                <div>
                                    <div class="spw-page-type"><?php echo esc_html(ucfirst($type)); ?></div>
                                    <div class="spw-page-sub"><?php echo esc_html($meta['desc']); ?></div>
                                </div>
                                <?php if ($exists): ?>
                                    <span class="spw-badge ok">Ready</span>
                                <?php else: ?>
                                    <span class="spw-badge warn">Pending</span>
                                <?php endif; ?>
                            </div>
                            <label for="spw_page_title_<?php echo esc_attr($type); ?>" class="screen-reader-text">
                                <?php echo esc_html(ucfirst($type)); ?> title
                            </label>
                            <input type="text"
                                   id="spw_page_title_<?php echo esc_attr($type); ?>"
                                   name="<?php echo SPW_OPTION; ?>[page_titles][<?php echo esc_attr($type); ?>]"
                                   value="<?php echo esc_attr($current_title); ?>"
                                   placeholder="<?php echo esc_attr($meta['default']); ?>" />
                            <?php if ($exists): ?>
                                <div class="spw-page-links">
                                    <a href="<?php echo esc_url(get_edit_post_link($id)); ?>">Edit</a>
                                    &middot;
                                    <a href="<?php echo esc_url(get_permalink($id)); ?>" target="_blank">View</a>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>

                <p class="spw-save-row">
                    <?php submit_button('Save Titles', 'primary large', 'submit', false); ?>
                    <button type="button" class="button button-secondary button-large" id="spw-create-pages">Create Missing Pages</button>
                    <span id="spw-create-pages-result" class="spw-status"></span>
                </p>
            </form>
        </div>
    </div>

    <div class="spw-card spw-card--hint">
        <div class="spw-card-body">
            <h3>How it works</h3>
            <p>Each generated page contains a single raw <code>&lt;div data-spm-widget="&hellip;"&gt;</code> block &mdash; the same markup a non-WordPress site would paste. That means SPM behaves identically inside or outside WordPress, and your theme styles still apply.</p>
            <p class="description">Listings template is set per-tenant in your SPM dashboard. To preview the embed code:</p>
<pre class="spw-snippet"><code>&lt;div data-spm-widget="listing-template-03"
     data-spm-sort="is_featured_desc"
     data-spm-limit="6"&gt;&lt;/div&gt;</code></pre>
        </div>
    </div>
</div>
