<?php
if (!defined('ABSPATH')) exit;
/** @var array $counts */
$spm_ready = SPMC_Lists::spm_ready();
$kinds = ['location' => 'Locations', 'type' => 'Property types', 'feature' => 'Features'];
?>
<div class="wrap spmc">
    <h1 class="screen-reader-text">Move to Smart Property Manager</h1>

    <header class="spmc-hero">
        <span class="spmc-hero-icon dashicons dashicons-migrate" aria-hidden="true"></span>
        <div>
            <h2 class="spmc-hero-title">Move to Smart Property Manager</h2>
            <p class="spmc-hero-sub">Turns the property codes of your old Inmotech or Smart Property Widget site into Smart Property Manager — in one click, and undoable.</p>
        </div>
    </header>

    <?php if (!$spm_ready): ?>
        <section class="spmc-panel">
            <div class="spmc-state spmc-state--stop">
                <span class="spmc-badge spmc-badge--stop dashicons dashicons-admin-plugins" aria-hidden="true"></span>
                <h3>First, connect Smart Property Manager</h3>
                <p>Enter your API key in Smart Property Manager's settings, then come back to this page.</p>
                <p><a class="button button-primary button-hero" href="<?php echo esc_url(admin_url('admin.php?page=spm-settings')); ?>">Open SPM settings</a></p>
            </div>
        </section>
    <?php else: ?>
        <ol class="spmc-steps" id="spmc-steps" aria-label="Progress">
            <li data-step="scan"><span>1</span> Scan</li>
            <li data-step="check"><span>2</span> Check</li>
            <li data-step="convert"><span>3</span> Convert</li>
            <li data-step="finish"><span>4</span> Finish</li>
        </ol>

        <section class="spmc-panel" aria-live="polite">
            <div class="spmc-state" id="spmc-checking">
                <div class="spmc-loader" aria-hidden="true">
                    <span class="spmc-ring"></span>
                    <span class="dashicons dashicons-admin-home"></span>
                </div>
                <h3>Looking for old property codes…</h3>
                <p class="spmc-loader-msg" data-msgs="Reading your pages and posts…|Checking Elementor layouts…|Checking widgets and theme settings…|Matching locations and property types…">Reading your pages and posts…</p>
                <div class="spmc-bar" aria-hidden="true"><span></span></div>
                <p class="spmc-slow">This is taking longer than usual. If nothing changes, reload the page.</p>
            </div>

            <div class="spmc-state" id="spmc-none" hidden>
                <span class="spmc-badge spmc-badge--ok dashicons dashicons-yes" aria-hidden="true"></span>
                <h3>Nothing to convert</h3>
                <p>Your site has no old Inmotech or Smart Property Widget codes.</p>
                <div class="spmc-last" id="spmc-none-last"></div>
            </div>

            <div class="spmc-state spmc-state--left" id="spmc-found" hidden>
                <div class="spmc-summary">
                    <div class="spmc-count"><strong id="spmc-found-count">0</strong><span id="spmc-found-unit">places</span></div>
                    <div>
                        <h3 id="spmc-found-title"></h3>
                        <p id="spmc-found-sub"></p>
                        <div class="spmc-chips" id="spmc-found-chips"></div>
                    </div>
                </div>
                <details class="spmc-pages"><summary>See where</summary><ul id="spmc-page-list"></ul></details>

                <div class="spmc-help" id="spmc-help" hidden>
                    <div class="spmc-help-head">
                        <span class="dashicons dashicons-lightbulb" aria-hidden="true"></span>
                        <div>
                            <h4 id="spmc-help-title"></h4>
                            <p>Your old site filtered listings by these. Pick what each one is in Smart Property Manager, or skip it — a skipped filter just isn't used.</p>
                        </div>
                    </div>
                    <div id="spmc-nolist" hidden class="spmc-nolist">
                        <p>We couldn't read the names from your old system. If your old property widget ran under another web address, enter it:</p>
                        <p class="spmc-inline"><input type="text" class="regular-text" id="spmc-domain" value="<?php echo esc_attr(SPMC_Lists::old_domain()); ?>" aria-label="Old web address"> <button class="button" id="spmc-domain-go">Try again</button></p>
                    </div>
                    <div id="spmc-questions"></div>
                </div>

                <div class="spmc-cta">
                    <button class="button button-primary button-hero" id="spmc-go"></button>
                    <p id="spmc-go-note"></p>
                </div>
            </div>

            <div class="spmc-state" id="spmc-working" hidden>
                <div class="spmc-loader" aria-hidden="true">
                    <span class="spmc-ring"></span>
                    <span class="dashicons dashicons-update"></span>
                </div>
                <h3>Converting…</h3>
                <p class="spmc-loader-msg" data-msgs="Rewriting your pages…|Updating Elementor layouts…|Updating widgets…|Saving a copy so you can undo…">Rewriting your pages…</p>
                <div class="spmc-bar" aria-hidden="true"><span></span></div>
            </div>

            <div class="spmc-state" id="spmc-done" hidden>
                <span class="spmc-badge spmc-badge--ok spmc-pop dashicons dashicons-yes" aria-hidden="true"></span>
                <h3 id="spmc-done-title"></h3>
                <p id="spmc-done-sub"></p>
                <div class="spmc-last" id="spmc-done-last"></div>
                <p class="spmc-undo-row"><button class="button-link" id="spmc-undo-last"><span class="dashicons dashicons-undo" aria-hidden="true"></span> Undo — put the old codes back</button></p>
            </div>
        </section>
    <?php endif; ?>

    <details class="spmc-advanced">
        <summary><span class="dashicons dashicons-admin-generic" aria-hidden="true"></span> Advanced <small>for developers — every change, ID matches, history</small></summary>

        <div class="spmc-adv-grid">
            <section class="spmc-card spmc-card--wide">
                <h3>What will change</h3>
                <p class="description">Every old code with its replacement. Untick a place to leave it as it is.</p>
                <div id="spmc-results"><p class="description">Waiting for the scan…</p></div>
            </section>

            <section class="spmc-card spmc-card--wide">
                <h3>All old IDs</h3>
                <div id="spmc-ids"><p class="description">Waiting for the scan…</p></div>
                <div id="spmc-tags"></div>
                <p><button class="button" id="spmc-save-ids">Save and scan again</button> <span class="spmc-status" id="spmc-ids-status"></span></p>
            </section>

            <section class="spmc-card">
                <h3>Where old names come from</h3>
                <table class="spmc-table spmc-counts">
                    <thead><tr><th></th><th>Old system</th><th>SPM</th></tr></thead>
                    <tbody>
                    <?php foreach ($kinds as $k => $label): ?>
                        <tr><td><?php echo esc_html($label); ?></td>
                            <td data-count="old-<?php echo esc_attr($k); ?>"><?php echo (int) $counts[$k]['old']; ?></td>
                            <td data-count="new-<?php echo esc_attr($k); ?>"><?php echo (int) $counts[$k]['new']; ?></td></tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
                <p class="description" data-count="old-source"><?php echo $counts['old_source'] ? 'Old lists from: ' . esc_html($counts['old_source']) : 'No old lists found yet.'; ?></p>
                <p><label class="spmc-field">Old account domain <input type="text" id="spmc-old-domain" value="<?php echo esc_attr(SPMC_Lists::old_domain()); ?>"></label></p>
                <p><label><input type="checkbox" id="spmc-strip" <?php checked(get_option('spmc_strip_scripts', '1'), '1'); ?>> Remove the old widget's scripts pasted into pages</label></p>
                <p><button class="button" id="spmc-save-settings">Save and scan again</button> <span class="spmc-status" id="spmc-settings-status"></span></p>
            </section>

            <section class="spmc-card">
                <h3>History</h3>
                <div id="spmc-runs"><p class="description">Loading…</p></div>
            </section>

            <section class="spmc-card spmc-card--wide">
                <h3>Try a code</h3>
                <p class="description">Paste an old shortcode or HTML to see what it becomes. Nothing on the site changes.</p>
                <textarea id="spmc-try-in" rows="4" class="large-text code" placeholder='[2020marbella filter="type=2,3 location=72 perpage=12"]'></textarea>
                <p><button class="button" id="spmc-try">Convert this</button></p>
                <div id="spmc-try-out"></div>
            </section>
        </div>
    </details>
</div>
