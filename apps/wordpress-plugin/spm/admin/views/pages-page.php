<?php
if (!defined('ABSPATH')) exit;
if (!current_user_can('manage_options')) return;

$opts        = get_option(SPM_OPTION, SPM_Plugin::default_settings());
$page_titles = (array)($opts['page_titles'] ?? []);
$page_ids = [
    'listings' => (int)($opts['listings_page_id'] ?? 0),
    'detail'   => (int)($opts['detail_page_id']   ?? 0),
    'wishlist' => (int)($opts['wishlist_page_id'] ?? 0),
];
$pages_created = 0;
foreach ($page_ids as $id) { if ($id && get_post_status($id)) $pages_created++; }

$page_types = [
    'listings' => ['default' => SPM_Plugin::page_title('listings'), 'icon' => '&#9783;', 'desc' => 'Search + results'],
    'detail'   => ['default' => SPM_Plugin::page_title('detail'),   'icon' => '&#9783;', 'desc' => 'Single property'],
    'wishlist' => ['default' => SPM_Plugin::page_title('wishlist'), 'icon' => '&#9825;', 'desc' => 'Saved by visitor'],
];
?>
<div class="wrap spm-wrap">
    <h1 class="spm-h1">Pages <span class="spm-ver">v<?php echo esc_html(SPM_VERSION); ?></span></h1>
    <p class="spm-tagline">One page per widget surface. The easiest way to create them &mdash; in every language of your site &mdash; is the <a href="<?php echo esc_url(SPM_Setup_Wizard::url('pages')); ?>">setup wizard</a>.</p>

    <div class="spm-card">
        <div class="spm-card-head">
            <h2>Page titles</h2>
            <span class="spm-card-meta"><?php echo (int)$pages_created; ?> of 3 created</span>
        </div>
        <div class="spm-card-body">
            <p class="description">Edit a title to customize what the page will be called. Save first, then click <strong>Create Missing Pages</strong>. Existing pages are never overwritten &mdash; rename a page directly in <em>Pages &rarr; All Pages</em>.</p>

            <form method="post" action="options.php">
                <?php settings_fields('spm_settings_group'); ?>

                <div class="spm-pages-grid">
                    <?php foreach ($page_types as $type => $meta):
                        $id            = $page_ids[$type];
                        $exists        = $id && get_post_status($id);
                        $current_title = $page_titles[$type] ?? $meta['default'];
                    ?>
                        <div class="spm-page-card <?php echo $exists ? 'is-ready' : 'is-pending'; ?>">
                            <div class="spm-page-card-head">
                                <span class="spm-page-icon"><?php echo $meta['icon']; ?></span>
                                <div>
                                    <div class="spm-page-type"><?php echo esc_html(ucfirst($type)); ?></div>
                                    <div class="spm-page-sub"><?php echo esc_html($meta['desc']); ?></div>
                                </div>
                                <?php if ($exists): ?>
                                    <span class="spm-badge ok">Ready</span>
                                <?php else: ?>
                                    <span class="spm-badge warn">Pending</span>
                                <?php endif; ?>
                            </div>
                            <label for="spm_page_title_<?php echo esc_attr($type); ?>" class="screen-reader-text">
                                <?php echo esc_html(ucfirst($type)); ?> title
                            </label>
                            <input type="text"
                                   id="spm_page_title_<?php echo esc_attr($type); ?>"
                                   name="<?php echo SPM_OPTION; ?>[page_titles][<?php echo esc_attr($type); ?>]"
                                   value="<?php echo esc_attr($current_title); ?>"
                                   placeholder="<?php echo esc_attr($meta['default']); ?>" />
                            <?php if ($exists): ?>
                                <div class="spm-page-links">
                                    <a href="<?php echo esc_url(get_edit_post_link($id)); ?>">Edit</a>
                                    &middot;
                                    <a href="<?php echo esc_url(get_permalink($id)); ?>" target="_blank">View</a>
                                </div>
                            <?php endif; ?>
                        </div>
                    <?php endforeach; ?>
                </div>

                <p class="spm-save-row">
                    <?php submit_button('Save Titles', 'primary large', 'submit', false); ?>
                    <button type="button" class="button button-secondary button-large" id="spm-create-pages">Create Missing Pages</button>
                    <span id="spm-create-pages-result" class="spm-status"></span>
                </p>
            </form>
        </div>
    </div>

    <div class="spm-card spm-card--hint">
        <div class="spm-card-body">
            <h3>How it works</h3>
            <p>Each generated page contains <code>&lt;div data-spm-widget="site-&hellip;"&gt;</code> blocks. They show the design chosen in your SPM dashboard &rarr; <strong>Website Design</strong>, so changing the design there needs no page edits. Your theme's header, footer and menus still apply.</p>
<pre class="spm-snippet"><code>&lt;div data-spm-widget="site-search"&gt;&lt;/div&gt;
&lt;div data-spm-widget="site-listing"&gt;&lt;/div&gt;</code></pre>
        </div>
    </div>
</div>
