<?php
if (!defined('ABSPATH')) exit;

/**
 * SPM → Blocks: every shortcode, with one-click copy. Meant for page-builder
 * users (Divi, Elementor) who build their own listing and property layouts.
 */
$groups = SPM_Shortcode_Reference::groups();
$options = SPM_Shortcode_Reference::options();
?>
<div class="wrap spm-wrap">
    <h1 class="spm-h1">Blocks <span class="spm-ver">v<?php echo esc_html(SPM_VERSION); ?></span></h1>
    <p class="spm-tagline">Each block has two forms that do the same thing: the <strong>WordPress shortcode</strong> (<code>[spm_listing]</code>, for any text, shortcode or Divi module) and the <strong>HTML line</strong> (for a Code / Custom HTML module, or a site that is not WordPress). Click a code to copy it.</p>

    <div class="spm-card spm-card--hint">
        <div class="spm-card-body">
            <p><strong>Whole page in one go:</strong> <code>&lt;div data-spm-widget="site-search"&gt;&lt;/div&gt;</code>, and the same with <code>site-listing</code>, <code>site-detail</code>, <code>site-map</code> or <code>site-wishlist</code>. <strong>Your own layout:</strong> combine the smaller blocks below — for a property page, <code>detail_gallery</code>, <code>detail_price</code>, <code>detail_description</code> and so on, each in its own module.</p>
            <p class="description"><strong>Where to paste it:</strong> a Divi <em>Code</em> module, a WordPress <em>Custom HTML</em> block, or the Text tab of the classic editor — not a visual Text module, which can strip the attributes. This is the same line you would paste on Wix, Squarespace, Webflow or your own HTML, so one set of instructions works everywhere.</p>
            <p class="description">Property pages only work on the SPM property page (<code><?php echo esc_html(SPM_Plugin::slug('detail')); ?>/…</code>), because that is where a property is loaded. Search and results blocks work on any page.</p>
        </div>
    </div>

    <?php foreach ($groups as $group): ?>
        <div class="spm-card">
            <div class="spm-card-head"><h2><?php echo esc_html($group['title']); ?></h2></div>
            <div class="spm-card-body">
                <?php if (!empty($group['intro'])): ?><p class="description"><?php echo wp_kses_post($group['intro']); ?></p><?php endif; ?>
                <?php
                $rows = [];
                foreach ((array) ($group['shortcodes'] ?? []) as $code => $label) $rows[$code] = $label;
                foreach ((array) ($group['items'] ?? []) as $name => $label) $rows['<div data-spm-widget="' . $name . '"></div>'] = $label;
                ?>
                <table class="widefat striped spm-blocks-table">
                    <thead><tr><th style="width:30%">WordPress shortcode</th><th style="width:36%">HTML</th><th>What it shows</th></tr></thead>
                    <tbody>
                    <?php foreach ($rows as $code => $label): $short = SPM_Shortcode_Reference::shortcode($code); ?>
                        <tr>
                            <td><?php if ($short): ?><button type="button" class="spm-copy" data-copy="<?php echo esc_attr($short); ?>"><code><?php echo esc_html($short); ?></code><span class="spm-copy-hint">copy</span></button><?php endif; ?></td>
                            <td><button type="button" class="spm-copy" data-copy="<?php echo esc_attr($code); ?>"><code><?php echo esc_html($code); ?></code><span class="spm-copy-hint">copy</span></button></td>
                            <td><?php echo esc_html($label); ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </div>
    <?php endforeach; ?>

    <div class="spm-card spm-card--hint">
        <div class="spm-card-body">
            <h3>Filter examples</h3>
            <p class="description">Filters go inside the same shortcode. Use <strong>IDs</strong> for location, property type and features — copy them from <a href="<?php echo esc_url(admin_url('admin.php?page=spm-filter-ids')); ?>">SPM &rarr; Filter IDs</a>. The same name can belong to an area, a municipality and a town, so a name is only accepted when it is unique in your lists; otherwise the block tells you which IDs to choose from (you see that note, visitors don't).</p>
            <pre class="spm-snippet"><code>&lt;div data-spm-widget="site-listing" data-spm-location="5216585" data-spm-under="500000" data-spm-beds="3" data-spm-sort="newest"&gt;&lt;/div&gt;
&lt;div data-spm-widget="site-listing" data-spm-location="5216585" data-spm-for="rent" data-spm-features="31,44" data-spm-fixed="yes"&gt;&lt;/div&gt;
&lt;div data-spm-widget="site-listing" data-spm-standalone data-spm-sort="newest" data-spm-limit="3"&gt;&lt;/div&gt;   &lt;!-- a "latest properties" block on any page --&gt;
&lt;div data-spm-widget="site-listing" data-spm-ref="R1234,R2345,R3456"&gt;&lt;/div&gt;   &lt;!-- hand-picked properties, in this order --&gt;

[spm_listing location="5216585" under="500000" beds="3" sort="newest"]   &lt;!-- the same filters as a WordPress shortcode --&gt;
[spm_listing ref="R1234,R2345,R3456" template="13"]</code></pre>
        </div>
    </div>

    <div class="spm-card">
        <div class="spm-card-head"><h2>Options</h2></div>
        <div class="spm-card-body">
            <p class="description">Add these to any block, e.g. <code>&lt;div data-spm-widget="site-listing" data-spm-limit="6" data-spm-sort="price_desc"&gt;&lt;/div&gt;</code>. In a shortcode the same option is written without <code>data-spm-</code>: <code>[spm_listing limit="6" sort="price_desc"]</code>. Both give exactly the same block.</p>
            <table class="widefat striped spm-blocks-table">
                <thead><tr><th style="width:24%">In a shortcode</th><th style="width:24%">In the HTML line</th><th>What it does</th></tr></thead>
                <tbody>
                <?php foreach ($options as $opt => $label): ?>
                    <tr><td><code><?php echo esc_html(preg_replace('/^data-spm-/', '', preg_replace('/^data-spm-([a-z0-9-]+)$/', 'data-spm-$1="yes"', $opt))); ?></code></td><td><code><?php echo esc_html($opt); ?></code></td><td><?php echo wp_kses_post($label); ?></td></tr>
                <?php endforeach; ?>
                </tbody>
            </table>
            <p class="description">The numbers to use for <code>location</code>, <code>property-type</code> and <code>features</code> are listed below.</p>
        </div>
    </div>
</div>

<?php
// The id reference used to be a menu item of its own. It is only ever needed
// while writing a block, so it lives here now, under the blocks it serves.
include SPM_DIR . 'admin/views/filter-ids-page.php';
