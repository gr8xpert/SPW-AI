<?php
if (!defined('ABSPATH')) exit;
if (!current_user_can('manage_options')) return;

/**
 * Reads the cached locations / property-types / features JSON written by
 * SPW_Data_Sync and renders a searchable, hierarchical reference so an admin
 * can find the numeric IDs needed to lock a widget to specific filters
 * (e.g. `data-spm-lock-location="5"`). No API calls happen here — everything
 * is served from the JSON cache.
 */

$up        = wp_upload_dir();
$cache_dir = trailingslashit($up['basedir']) . 'spw-data/';

function spw_read_cache_list($cache_dir, $file) {
    $p = $cache_dir . $file;
    if (!file_exists($p)) return null;
    $j = json_decode(file_get_contents($p), true);
    if (!is_array($j)) return null;
    return isset($j['data']) && is_array($j['data']) ? $j['data'] : null;
}

$locations = spw_read_cache_list($cache_dir, 'locations.json');
$types     = spw_read_cache_list($cache_dir, 'property-types.json');
$features  = spw_read_cache_list($cache_dir, 'features.json');

/**
 * Build a parentId-keyed tree from a flat list with `id` and `parentId`.
 * Items whose parent isn't in the list are treated as roots so an orphan row
 * still shows up rather than disappearing silently.
 */
function spw_build_tree($items) {
    $by_parent = [];
    $ids = [];
    foreach ($items as $it) {
        $ids[$it['id']] = true;
    }
    foreach ($items as $it) {
        $pid = $it['parentId'] ?? null;
        if ($pid === null || !isset($ids[$pid])) $pid = 0; // root
        $by_parent[$pid][] = $it;
    }
    $build = function ($parentId) use (&$build, $by_parent) {
        $out = [];
        foreach (($by_parent[$parentId] ?? []) as $row) {
            $out[] = ['node' => $row, 'children' => $build($row['id'])];
        }
        return $out;
    };
    return $build(0);
}

function spw_render_id_tree($nodes, $depth, $kind) {
    foreach ($nodes as $n) {
        $row    = $n['node'];
        $rowId  = (int)($row['id'] ?? 0);
        $name   = (string)($row['name'] ?? '');
        $level  = (string)($row['level'] ?? '');
        $count  = isset($row['propertyCount']) ? (int)$row['propertyCount'] : null;
        $has_kids = !empty($n['children']);
        ?>
        <div class="spw-id-row spw-tree-row depth-<?php echo (int)$depth; ?>"
             data-name="<?php echo esc_attr(strtolower($name)); ?>"
             data-id="<?php echo esc_attr($rowId); ?>"
             style="padding-left:<?php echo 12 + ($depth * 22); ?>px">
            <div class="spw-id-left">
                <?php if ($depth > 0): ?>
                    <span class="spw-tree-elbow" aria-hidden="true"></span>
                <?php endif; ?>
                <span class="spw-id-name"><?php echo esc_html($name); ?></span>
                <?php if ($level): ?>
                    <span class="spw-id-tag spw-tag--<?php echo esc_attr(sanitize_html_class($level)); ?>"><?php echo esc_html(strtoupper($level)); ?></span>
                <?php endif; ?>
            </div>
            <div class="spw-id-right">
                <?php if ($count !== null && $count > 0): ?>
                    <span class="spw-id-count"><?php echo (int)$count; ?> properties</span>
                <?php endif; ?>
                <code class="spw-id-badge">ID: <?php echo (int)$rowId; ?></code>
                <button type="button"
                        class="button button-small spw-copy-btn"
                        data-copy="<?php echo (int)$rowId; ?>"
                        data-kind="<?php echo esc_attr($kind); ?>">Copy</button>
            </div>
        </div>
        <?php
        if ($has_kids) {
            spw_render_id_tree($n['children'], $depth + 1, $kind);
        }
    }
}

$loc_tree   = $locations ? spw_build_tree($locations) : [];
$type_tree  = $types     ? spw_build_tree($types)     : [];

// Group features by category.
$features_by_cat = [];
if ($features) {
    foreach ($features as $f) {
        $cat = $f['category'] ?? 'other';
        $features_by_cat[$cat][] = $f;
    }
    ksort($features_by_cat);
}

$site_host = parse_url(home_url(), PHP_URL_HOST);
$has_any   = $locations || $types || $features;
?>
<div class="wrap spw-wrap spw-ids-wrap">
    <div class="spw-ids-hero">
        <div>
            <h1>Filter IDs Reference</h1>
            <p>Use these IDs to lock filters on your property pages (for example, show only Marbella properties).</p>
        </div>
        <span class="spw-ids-site"><?php echo esc_html($site_host); ?></span>
    </div>

    <?php if (!$has_any): ?>
        <div class="notice notice-warning"><p>
            No cached data yet.
            <a href="<?php echo esc_url(admin_url('admin.php?page=spw-settings')); ?>">Open Settings</a>
            and click <strong>Sync Now</strong> to fetch your tenant's locations, types, and features.
        </p></div>
    <?php else: ?>
        <div class="spw-ids-toolbar">
            <input type="search" id="spw-id-search" placeholder="Search by name or ID&hellip;" autocomplete="off" />
            <span class="spw-ids-hint">Tip: click <strong>Copy</strong> on any row to copy its ID to your clipboard.</span>
        </div>

        <?php if (!empty($loc_tree)): ?>
            <div class="spw-id-section spw-acc" data-section="locations">
                <button type="button" class="spw-id-section-head spw-acc-head" aria-expanded="false">
                    <span class="spw-acc-caret" aria-hidden="true"></span>
                    <h2>Locations <span class="spw-pill"><?php echo count($locations); ?></span></h2>
                    <span class="spw-id-section-hint">Attribute: <code>data-spm-lock-location="ID"</code></span>
                </button>
                <div class="spw-acc-body">
                    <div class="spw-id-list">
                        <?php spw_render_id_tree($loc_tree, 0, 'location'); ?>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <?php if (!empty($type_tree)): ?>
            <div class="spw-id-section spw-acc" data-section="types">
                <button type="button" class="spw-id-section-head spw-acc-head" aria-expanded="false">
                    <span class="spw-acc-caret" aria-hidden="true"></span>
                    <h2>Property Types <span class="spw-pill"><?php echo count($types); ?></span></h2>
                    <span class="spw-id-section-hint">Attribute: <code>data-spm-lock-property-type="ID"</code></span>
                </button>
                <div class="spw-acc-body">
                    <div class="spw-id-list">
                        <?php spw_render_id_tree($type_tree, 0, 'property-type'); ?>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <?php if (!empty($features_by_cat)): ?>
            <div class="spw-id-section spw-acc" data-section="features">
                <button type="button" class="spw-id-section-head spw-acc-head" aria-expanded="false">
                    <span class="spw-acc-caret" aria-hidden="true"></span>
                    <h2>Features <span class="spw-pill"><?php echo count($features); ?></span></h2>
                    <span class="spw-id-section-hint">Attribute: <code>data-spm-lock-features="ID,ID,&hellip;"</code> (comma-separated)</span>
                </button>
                <div class="spw-acc-body">
                    <?php foreach ($features_by_cat as $cat => $list): ?>
                        <div class="spw-id-cat" data-cat="<?php echo esc_attr($cat); ?>">
                            <h3 class="spw-id-cat-title"><?php echo esc_html(ucfirst($cat)); ?> <span class="spw-id-cat-count"><?php echo count($list); ?></span></h3>
                            <div class="spw-id-list spw-id-list--flat">
                                <?php foreach ($list as $f):
                                    $fid   = (int)($f['id'] ?? 0);
                                    $fname = (string)($f['name'] ?? '');
                                ?>
                                    <div class="spw-id-row"
                                         data-name="<?php echo esc_attr(strtolower($fname)); ?>"
                                         data-id="<?php echo esc_attr($fid); ?>">
                                        <div class="spw-id-left">
                                            <span class="spw-id-name"><?php echo esc_html($fname); ?></span>
                                        </div>
                                        <div class="spw-id-right">
                                            <code class="spw-id-badge">ID: <?php echo (int)$fid; ?></code>
                                            <button type="button"
                                                    class="button button-small spw-copy-btn"
                                                    data-copy="<?php echo (int)$fid; ?>"
                                                    data-kind="feature">Copy</button>
                                        </div>
                                    </div>
                                <?php endforeach; ?>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endif; ?>

        <div class="spw-card spw-ids-howto">
            <div class="spw-card-head"><h3>How to use</h3></div>
            <div class="spw-card-body">
                <p>Paste any of these attributes into your widget block to lock the search to a specific value. Multiple locks are AND-combined; <code>lock-features</code> is comma-separated.</p>
<pre class="spw-snippet"><code>&lt;div data-spm-widget="listing-template-03"
     data-spm-lock-location="5"
     data-spm-lock-property-type="2"
     data-spm-lock-features="10,12"
     data-spm-sort="is_featured_desc"
     data-spm-limit="6"&gt;&lt;/div&gt;</code></pre>
            </div>
        </div>
    <?php endif; ?>
</div>
