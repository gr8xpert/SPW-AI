<?php
if (!defined('ABSPATH')) exit;
$opts         = get_option(SPW_OPTION, SPW_Plugin::default_settings());
$status       = SPW_Data_Sync::instance()->get_status();
$last_results = SPW_Data_Sync::instance()->get_last_results();

/**
 * Merge the three per-type slug maps into a single list of rows keyed by lang
 * so the UI can show one row per language with all three slug fields together.
 * Also pre-populates rows for any languages declared by the active translation
 * plugin (Polylang/WPML/etc.) that aren't already in the saved map.
 */
function spw_slug_rows_from_opts($opts, $detected_codes = []) {
    $rows = [];
    foreach (['listings', 'detail', 'wishlist'] as $type) {
        foreach ((array)($opts['slugs_' . $type] ?? []) as $lang => $slug) {
            if (!$lang) continue;
            $rows[$lang]['lang']  = $lang;
            $rows[$lang][$type]   = $slug;
        }
    }
    foreach ($detected_codes as $code) {
        if (!$code || isset($rows[$code])) continue;
        $rows[$code] = ['lang' => $code];
    }
    if (!isset($rows['en'])) {
        $rows['en'] = ['lang' => 'en'];
    }
    uksort($rows, function ($a, $b) {
        if ($a === 'en') return -1;
        if ($b === 'en') return 1;
        return strcmp($a, $b);
    });
    return array_values($rows);
}

$i18n_info = class_exists('SPW_I18n') ? SPW_I18n::instance()->detect() : ['plugin' => 'none', 'all_languages' => []];
$detected_codes = [];
foreach ((array)($i18n_info['all_languages'] ?? []) as $l) {
    if (!empty($l['code'])) $detected_codes[] = $l['code'];
}
$slug_rows   = spw_slug_rows_from_opts($opts, $detected_codes);
$page_titles = (array)($opts['page_titles'] ?? []);

/**
 * Translate legacy "HTTP 401: {json}" stored errors to the friendly text the
 * new SPW_API_Client emits, so installs that synced before 2.2.3 don't show
 * raw JSON on render.
 */
function spw_normalize_sync_error($error, $details = '') {
    if (!$error) return ['', $details];
    if (preg_match('/^HTTP\s+(\d{3})\s*:?\s*(.*)$/s', $error, $m)) {
        $code = (int) $m[1];
        $raw  = $details !== '' ? $details : trim($m[2]);
        $friendly = SPW_API_Client::friendly_message_for_status($code);
        return [$friendly, $raw];
    }
    return [$error, $details];
}

// --- Stat strip data --------------------------------------------------------
$api_key_set  = !empty($opts['api_key']);
$total_items  = 0;
$synced_files = 0;
foreach ($status['files'] as $info) {
    if (!empty($info['exists'])) {
        $synced_files++;
        $total_items += (int)($info['count'] ?? 0);
    }
}
$page_ids = [
    'listings' => (int)($opts['listings_page_id'] ?? 0),
    'detail'   => (int)($opts['detail_page_id']   ?? 0),
    'wishlist' => (int)($opts['wishlist_page_id'] ?? 0),
];
$pages_created = 0;
foreach ($page_ids as $id) { if ($id && get_post_status($id)) $pages_created++; }
$has_errors = false;
foreach ($last_results as $r) { if (empty($r['success'])) { $has_errors = true; break; } }
$sync_state = !$status['last_sync'] ? 'idle' : ($has_errors ? 'err' : 'ok');
?>
<div class="wrap spw-wrap">
    <h1 class="spw-h1">Smart Property Manager <span class="spw-ver">v<?php echo esc_html(SPW_VERSION); ?></span></h1>
    <p class="spw-tagline">Connect to your SPM tenant. Slugs, sync, and that's it &mdash; everything else lives in your SPM dashboard.</p>

    <div class="spw-stats">
        <div class="spw-stat spw-stat--<?php echo $api_key_set ? 'ok' : 'warn'; ?>">
            <div class="spw-stat-label">API token</div>
            <div class="spw-stat-value">
                <?php if ($api_key_set): ?>
                    <span class="spw-dot ok"></span> Configured
                <?php else: ?>
                    <span class="spw-dot warn"></span> Not set
                <?php endif; ?>
            </div>
        </div>
        <div class="spw-stat spw-stat--<?php echo $sync_state; ?>">
            <div class="spw-stat-label">Last sync</div>
            <div class="spw-stat-value">
                <?php if ($sync_state === 'idle'): ?>
                    <span class="spw-dot warn"></span> Never
                <?php elseif ($sync_state === 'err'): ?>
                    <span class="spw-dot err"></span> Failed
                <?php else: ?>
                    <span class="spw-dot ok"></span> <?php echo esc_html(human_time_diff($status['last_sync']) . ' ago'); ?>
                <?php endif; ?>
            </div>
            <?php if ($status['last_sync']): ?>
                <div class="spw-stat-sub"><?php echo esc_html($status['last_sync_formatted']); ?></div>
            <?php endif; ?>
        </div>
        <div class="spw-stat">
            <div class="spw-stat-label">Cached items</div>
            <div class="spw-stat-value"><?php echo (int)$total_items; ?></div>
            <div class="spw-stat-sub"><?php echo (int)$synced_files; ?> of 4 lists</div>
        </div>
        <div class="spw-stat spw-stat--<?php echo $pages_created === 3 ? 'ok' : 'warn'; ?>">
            <div class="spw-stat-label">Pages</div>
            <div class="spw-stat-value"><?php echo (int)$pages_created; ?> / 3</div>
            <div class="spw-stat-sub">
                <?php echo $pages_created === 3 ? 'All ready' : 'Click Create below'; ?>
            </div>
        </div>
    </div>

    <div class="spw-grid">
        <div class="spw-col-main">
            <form method="post" action="options.php">
                <?php settings_fields('spw_settings_group'); ?>

                <div class="spw-card">
                    <div class="spw-card-head">
                        <span class="spw-step">1</span>
                        <h2>API token</h2>
                    </div>
                    <div class="spw-card-body">
                        <div class="spw-field">
                            <label for="api_key">API Key <span class="required">*</span></label>
                            <div class="spw-input-row">
                                <input type="text" id="api_key" name="<?php echo SPW_OPTION; ?>[api_key]"
                                       value="<?php echo esc_attr($opts['api_key']); ?>" autocomplete="off" />
                                <button type="button" class="button" id="spw-test-conn">Test Connection</button>
                            </div>
                            <span id="spw-test-result" class="spw-status"></span>
                            <p class="description">Generate this in your SPM dashboard &rarr; Settings &rarr; API Keys.</p>
                        </div>
                    </div>
                </div>

                <div class="spw-card">
                    <div class="spw-card-head">
                        <span class="spw-step">2</span>
                        <h2>Page slugs per language</h2>
                    </div>
                    <div class="spw-card-body">
                        <p class="description">One row per language. Each row sets the URL slug for the three widget pages. The <code>en</code> row is the fallback when an active language has no slug filled in.
                        <?php if (!empty($i18n_info['plugin']) && $i18n_info['plugin'] !== 'none' && !empty($detected_codes)): ?>
                            <br><strong>Detected via <?php echo esc_html(ucfirst($i18n_info['plugin'])); ?>:</strong>
                            <?php echo esc_html(implode(', ', $detected_codes)); ?>
                            &mdash; rows pre-added below.
                        <?php endif; ?>
                        </p>

                        <table class="widefat spw-slug-table" id="spw-slug-table">
                            <thead>
                                <tr>
                                    <th style="width:90px">Language</th>
                                    <th>Listings slug</th>
                                    <th>Detail slug</th>
                                    <th>Wishlist slug</th>
                                    <th style="width:44px"></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($slug_rows as $row):
                                    $lang = $row['lang'] ?? '';
                                    $listings = $row['listings'] ?? '';
                                    $detail   = $row['detail']   ?? '';
                                    $wishlist = $row['wishlist'] ?? '';
                                ?>
                                    <tr class="spw-slug-row">
                                        <td>
                                            <input type="text" name="<?php echo SPW_OPTION; ?>[slug_rows][lang][]"
                                                   value="<?php echo esc_attr($lang); ?>" placeholder="en" />
                                        </td>
                                        <td>
                                            <input type="text" name="<?php echo SPW_OPTION; ?>[slug_rows][listings][]"
                                                   value="<?php echo esc_attr($listings); ?>" placeholder="properties" />
                                        </td>
                                        <td>
                                            <input type="text" name="<?php echo SPW_OPTION; ?>[slug_rows][detail][]"
                                                   value="<?php echo esc_attr($detail); ?>" placeholder="property" />
                                        </td>
                                        <td>
                                            <input type="text" name="<?php echo SPW_OPTION; ?>[slug_rows][wishlist][]"
                                                   value="<?php echo esc_attr($wishlist); ?>" placeholder="wishlist" />
                                        </td>
                                        <td>
                                            <button type="button" class="button-link-delete spw-slug-remove" aria-label="Remove">&times;</button>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                            <tfoot>
                                <tr>
                                    <td colspan="5">
                                        <button type="button" class="button button-secondary" id="spw-slug-add">+ Add language</button>
                                    </td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>

                <p class="spw-save-row">
                    <?php submit_button('Save Settings', 'primary large', 'submit', false); ?>
                    <span class="description">Saves API key and slugs.</span>
                </p>
            </form>
        </div>

        <aside class="spw-col-side">
            <div class="spw-card">
                <div class="spw-card-head">
                    <span class="spw-step">3</span>
                    <h3>Sync system</h3>
                </div>
                <div class="spw-card-body">
                    <p class="description">Local JSON cache for locations / property types / features / labels. Auto-refreshes daily; <code>/sync-meta</code> skips lists that didn't change.</p>

                    <?php
                    $normalized = [];
                    foreach ($last_results as $file => $r) {
                        if (!empty($r['success'])) continue;
                        list($friendly, $raw) = spw_normalize_sync_error($r['error'] ?? '', $r['details'] ?? '');
                        $normalized[$file] = ['error' => $friendly, 'details' => $raw];
                    }
                    if (count($normalized) >= 2) {
                        $first = reset($normalized);
                        $msg   = $first['error'] ?? '';
                        $same  = $msg !== '';
                        foreach ($normalized as $r) {
                            if (($r['error'] ?? '') !== $msg) { $same = false; break; }
                        }
                        if ($same) {
                            echo '<div class="notice notice-error inline spw-sync-banner"><p>' . esc_html($msg) . '</p></div>';
                        }
                    }
                    ?>

                    <ul class="spw-files">
                        <?php foreach ($status['files'] as $name => $info):
                            $err     = $normalized[$name]['error']   ?? null;
                            $details = $normalized[$name]['details'] ?? '';
                        ?>
                            <li>
                                <div class="spw-file-row">
                                    <code><?php echo esc_html($name); ?></code>
                                    <?php if (!empty($info['exists'])): ?>
                                        <span class="ok"><?php echo (int)$info['count']; ?> items</span>
                                    <?php else: ?>
                                        <span class="warn">not synced</span>
                                    <?php endif; ?>
                                </div>
                                <?php if ($err): ?>
                                    <div class="spw-sync-err"><?php echo esc_html($err); ?></div>
                                    <?php if ($details): ?>
                                        <details class="spw-sync-details">
                                            <summary>Technical details</summary>
                                            <code><?php echo esc_html(mb_substr($details, 0, 400)); ?></code>
                                        </details>
                                    <?php endif; ?>
                                <?php endif; ?>
                            </li>
                        <?php endforeach; ?>
                    </ul>
                    <p class="spw-btn-row">
                        <button type="button" class="button button-primary" id="spw-sync-now">Sync Now</button>
                        <button type="button" class="button" id="spw-clear-cache">Clear Cache</button>
                    </p>
                </div>
            </div>

            <div class="spw-card">
                <div class="spw-card-head">
                    <h3>Pages</h3>
                    <span class="spw-card-meta"><?php echo (int)$pages_created; ?> of 3 created</span>
                </div>
                <div class="spw-card-body">
                    <p>Manage the auto-generated Listings, Property Detail and Wishlist pages &mdash; titles, status, and one-click creation.</p>
                    <p>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=spw-pages')); ?>" class="button button-primary">
                            <span class="dashicons dashicons-admin-page" style="vertical-align:middle;margin-top:-2px"></span>
                            Open Pages
                        </a>
                    </p>
                </div>
            </div>

            <div class="spw-card">
                <div class="spw-card-head">
                    <h3>Filter IDs Reference</h3>
                </div>
                <div class="spw-card-body">
                    <p>Need to lock a page to a specific city, property type, or feature? Open the reference to browse every ID synced for <strong><?php echo esc_html(parse_url(home_url(), PHP_URL_HOST)); ?></strong> with one-click copy.</p>
                    <p>
                        <a href="<?php echo esc_url(admin_url('admin.php?page=spw-filter-ids')); ?>" class="button button-primary">
                            <span class="dashicons dashicons-list-view" style="vertical-align:middle;margin-top:-2px"></span>
                            Open Filter IDs Reference
                        </a>
                    </p>
                    <p class="description">Example: <code>&lt;div data-spm-widget="listing-template-01" data-spm-lock-location="5"&gt;&lt;/div&gt;</code></p>
                </div>
            </div>

            <div class="spw-card spw-card--hint">
                <div class="spw-card-body">
                    <h3>Everything else lives in your dashboard</h3>
                    <p>Display currency, listing types, search options, primary colour and feature toggles are managed in your <strong>SPM dashboard &rarr; Settings &rarr; Widget</strong>. Save once there and every embed picks it up &mdash; this plugin included.</p>
                    <p class="description">Want to embed a custom widget anywhere else on your site? Paste this anywhere:</p>
<pre class="spw-snippet"><code>&lt;div data-spm-widget="listing-template-03"
     data-spm-sort="is_featured_desc"
     data-spm-limit="6"&gt;&lt;/div&gt;</code></pre>
                </div>
            </div>
        </aside>
    </div>
</div>
