<?php
if (!defined('ABSPATH')) exit;
/** @var string $step connect|pages|finish */

$error = SPM_Setup_Wizard::take_error();
$steps = ['connect' => 'Connect', 'pages' => 'Pages & languages', 'finish' => 'Done'];
$step_keys = array_keys($steps);
$current_index = array_search($step, $step_keys, true);
$dashboard_url = 'https://dashboard.spw-ai.com';
$plugin_names = ['polylang' => 'Polylang', 'wpml' => 'WPML', 'translatepress' => 'TranslatePress', 'weglot' => 'Weglot', 'gtranslate' => 'GTranslate'];
?>
<div class="wrap spm-wrap spm-wizard">
    <h1 class="spm-h1">Set up Smart Property Manager <span class="spm-ver">v<?php echo esc_html(SPM_VERSION); ?></span></h1>

    <ol class="spm-wizard-steps">
        <?php foreach ($steps as $key => $label):
            $i = array_search($key, $step_keys, true);
            $cls = $i < $current_index ? 'is-done' : ($i === $current_index ? 'is-current' : '');
        ?>
            <li class="<?php echo esc_attr($cls); ?>"><span class="spm-wizard-num"><?php echo $i < $current_index ? '&#10003;' : (int) ($i + 1); ?></span><?php echo esc_html($label); ?></li>
        <?php endforeach; ?>
    </ol>

    <?php if ($error): ?>
        <div class="notice notice-error inline spm-wizard-error"><p><?php echo esc_html($error); ?></p></div>
    <?php endif; ?>

<?php if ($step === 'connect'): ?>
    <div class="spm-card spm-wizard-card">
        <div class="spm-card-body">
            <h2>Connect your properties</h2>
            <p>Paste your <strong>API key</strong>. You find it in your SPM dashboard under <strong>Settings &rarr; API Keys</strong>.
               If you don't have it, ask SPM support &mdash; they can send it to you.</p>
            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field('spm_wizard_connect'); ?>
                <input type="hidden" name="action" value="spm_wizard_connect" />
                <p>
                    <label for="spm-wizard-key" class="screen-reader-text">API key</label>
                    <input type="text" id="spm-wizard-key" name="api_key" class="large-text code" autocomplete="off" required
                           placeholder="spm_…" value="<?php echo esc_attr((string) SPM_Plugin::get('api_key', '')); ?>" />
                </p>
                <p class="spm-wizard-actions">
                    <button type="submit" class="button button-primary button-hero">Connect and continue</button>
                </p>
            </form>
        </div>
    </div>

<?php elseif ($step === 'pages'):
    $site = SPM_Setup_Wizard::site_languages();
    $opts = get_option(SPM_OPTION, SPM_Plugin::default_settings());
    $existing_pages = 0;
    foreach (['listings', 'detail', 'wishlist'] as $t) {
        $id = (int) ($opts[$t . '_page_id'] ?? 0);
        if ($id && get_post_status($id)) $existing_pages++;
    }
    $has_legacy = false;
    foreach (['listings', 'detail'] as $t) {
        $id = (int) ($opts[$t . '_page_id'] ?? 0);
        if ($id && ($p = get_post($id)) && SPM_Page_Generator::content_state($t, $p->post_content) === 'legacy') $has_legacy = true;
    }
    $multi = count($site['languages']) > 1;
    $per_language_pages = in_array($site['plugin'], ['polylang', 'wpml'], true);
?>
    <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" class="spm-wizard-card">
        <?php wp_nonce_field('spm_wizard_pages'); ?>
        <input type="hidden" name="action" value="spm_wizard_pages" />

        <div class="spm-card">
            <div class="spm-card-body">
                <h2>Your property pages</h2>
                <p>We create three pages: the <strong>property list</strong> with search, the <strong>property page</strong> a visitor sees after clicking, and the visitor's <strong>saved properties</strong>. Check the names and web addresses below &mdash; the suggestions are fine for most sites.</p>

                <?php if ($multi): ?>
                    <p class="spm-wizard-lang-note">
                        <span class="dashicons dashicons-translation"></span>
                        <?php echo esc_html($plugin_names[$site['plugin']] ?? 'Your translation plugin'); ?> found with
                        <?php echo (int) count($site['languages']); ?> languages.
                        <?php if ($per_language_pages): ?>
                            Each language gets its own translated pages, linked together as translations.
                        <?php else: ?>
                            <?php echo esc_html($plugin_names[$site['plugin']] ?? 'It'); ?> translates the pages itself; the addresses below are used for property links in each language.
                        <?php endif; ?>
                        Properties are shown in the visitor's language automatically.
                    </p>
                <?php endif; ?>

                <?php foreach ($site['languages'] as $lang):
                    $suggest_lang = SPM_Setup_Wizard::suggestion_lang($lang, $site['plugin']);
                    $sugg_slugs = SPM_Page_Defaults::slugs($suggest_lang);
                    $saved = function ($type) use ($opts, $lang, $sugg_slugs) {
                        $map = (array) ($opts['slugs_' . $type] ?? []);
                        return $map[$lang] ?? $sugg_slugs[$type];
                    };
                    $titles_saved = (array) (($opts['page_titles_i18n'] ?? [])[$lang] ?? []);
                    $sugg_titles = SPM_Page_Defaults::titles($suggest_lang);
                    $title = function ($type) use ($titles_saved, $sugg_titles, $lang, $site, $opts) {
                        if (!empty($titles_saved[$type])) return $titles_saved[$type];
                        // A main-language title the admin changed from the English default.
                        $english = ['listings' => 'Properties', 'detail' => 'Property Detail', 'wishlist' => 'Wishlist'];
                        $saved_title = (string) ($opts['page_titles'][$type] ?? '');
                        if ($lang === $site['default'] && $saved_title !== '' && $saved_title !== ($english[$type] ?? '')) return $saved_title;
                        return $sugg_titles[$type];
                    };
                    $name = $site['names'][$lang] ?? '';
                    $prefix = ($multi && $lang !== $site['default']) ? '/' . $lang : '';
                    $home = untrailingslashit(home_url()) . $prefix . '/';
                ?>
                    <fieldset class="spm-wizard-lang" data-lang="<?php echo esc_attr($lang); ?>">
                        <legend><?php echo esc_html(strtoupper($lang)); ?><?php echo $name ? ' &middot; ' . esc_html($name) : ''; ?><?php echo ($multi && $lang === $site['default']) ? ' <span class="spm-badge ok">Main language</span>' : ''; ?></legend>
                        <table class="spm-wizard-table">
                            <thead><tr><th></th><th>Page name</th><th>Web address</th></tr></thead>
                            <tbody>
                            <?php foreach (['listings' => 'Property list', 'detail' => 'Property page', 'wishlist' => 'Saved properties'] as $type => $label): ?>
                                <tr>
                                    <th scope="row"><?php echo esc_html($label); ?></th>
                                    <td><input type="text" name="lang[<?php echo esc_attr($lang); ?>][title_<?php echo esc_attr($type); ?>]" value="<?php echo esc_attr($title($type)); ?>" /></td>
                                    <td class="spm-wizard-slug">
                                        <span class="spm-wizard-home"><?php echo esc_html($home); ?></span><input type="text" name="lang[<?php echo esc_attr($lang); ?>][slug_<?php echo esc_attr($type); ?>]" value="<?php echo esc_attr($saved($type)); ?>" pattern="[a-z0-9-]+" title="Lower-case letters, numbers and dashes" /><?php echo $type === 'detail' ? '<span class="spm-wizard-home">/villa-in-marbella_R123</span>' : '<span class="spm-wizard-home">/</span>'; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                                <tr class="spm-wizard-map-row">
                                    <th scope="row">Map search <em>(optional)</em></th>
                                    <td><input type="text" name="lang[<?php echo esc_attr($lang); ?>][title_map]" value="<?php echo esc_attr($title('map')); ?>" /></td>
                                    <td class="description">Search on a map &mdash; optional, see below.</td>
                                </tr>
                            </tbody>
                        </table>
                    </fieldset>
                <?php endforeach; ?>

                <?php $has_map = (int) ($opts['map_page_id'] ?? 0) && get_post_status((int) $opts['map_page_id']) && get_post_status((int) $opts['map_page_id']) !== 'trash'; ?>
                <?php if ($has_map): ?>
                    <p class="description">Your map search page is kept<?php echo $per_language_pages && $multi ? ' and translated too' : ''; ?>.</p>
                <?php else: ?>
                    <p><label><input type="checkbox" name="create_map" value="1" /> Also create a <strong>map search</strong> page</label></p>
                <?php endif; ?>
                <?php if ($has_legacy): ?>
                    <p><label><input type="checkbox" name="upgrade" value="1" checked /> Let the design I choose in the SPM dashboard apply to my existing property pages <span class="description">(pages you edited yourself are never changed)</span></label></p>
                <?php endif; ?>
                <?php if ($existing_pages): ?>
                    <p class="description">You already have <?php echo (int) $existing_pages; ?> of these pages &mdash; they are kept, not duplicated.</p>
                <?php endif; ?>
            </div>
        </div>

        <p class="spm-wizard-actions">
            <a class="button button-large" href="<?php echo esc_url(SPM_Setup_Wizard::url('connect')); ?>">Back</a>
            <button type="submit" class="button button-primary button-hero" id="spm-wizard-create">Create my pages</button>
        </p>
    </form>

<?php else:
    $results = get_transient('spm_wizard_results_' . get_current_user_id()) ?: ['pages' => [], 'sync' => []];
    $checks = SPM_Health::instance()->checks(true);
    $summary = SPM_Health::summary($checks);
    $listings_url = SPM_Plugin::page_url('listings');
    $labels = ['listings' => 'Property list', 'detail' => 'Property page', 'wishlist' => 'Saved properties', 'map' => 'Map search'];
    $status_text = ['created' => 'Created', 'exists' => 'Already there', 'updated' => 'Updated to dashboard design', 'customised' => 'Kept as you edited it', 'failed' => 'Failed'];
?>
    <div class="spm-card spm-wizard-card">
        <div class="spm-card-body">
            <h2><?php echo $summary['critical'] ? 'Almost done' : 'You\'re all set!'; ?></h2>
            <?php if (!$summary['critical']): ?>
                <p>Your properties are live on your website.</p>
                <p><a class="button button-primary button-hero" href="<?php echo esc_url($listings_url); ?>" target="_blank">View your properties</a></p>
            <?php else: ?>
                <p>One or more things need fixing before properties can show &mdash; see below.</p>
            <?php endif; ?>

            <?php if (!empty($results['pages'])): ?>
                <h3>Pages</h3>
                <table class="widefat striped spm-wizard-results">
                    <thead><tr><th>Page</th><th>Language</th><th>Result</th><th></th></tr></thead>
                    <tbody>
                    <?php foreach ($results['pages'] as $r): ?>
                        <tr>
                            <td><?php echo esc_html(($labels[$r['type']] ?? $r['type']) . ' — ' . ($r['title'] ?? '')); ?></td>
                            <td><?php echo esc_html(strtoupper($r['lang'] ?? '')); ?></td>
                            <td class="spm-result-<?php echo esc_attr($r['status']); ?>"><?php echo esc_html($status_text[$r['status']] ?? $r['status']); ?><?php echo !empty($r['error']) ? ': ' . esc_html($r['error']) : ''; ?></td>
                            <td><?php
                                $links = [];
                                if (!empty($r['url']) && $r['type'] !== 'detail') $links[] = '<a href="' . esc_url($r['url']) . '" target="_blank">View</a>';
                                if (!empty($r['id'])) $links[] = '<a href="' . esc_url(get_edit_post_link($r['id'])) . '">Edit</a>';
                                echo implode(' &middot; ', $links);
                            ?></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            <?php endif; ?>

            <h3>Site health</h3>
            <?php $compact = true; include SPM_DIR . 'admin/views/health-list.php'; ?>

            <h3>Next steps</h3>
            <ul class="spm-wizard-next">
                <li><strong>Choose your design and brand colour</strong> in your SPM dashboard &rarr; <a href="<?php echo esc_url($dashboard_url . '/dashboard/website-design'); ?>" target="_blank">Website Design</a>. Your pages follow it automatically.</li>
                <li>Add the property list page to your site's menu under <a href="<?php echo esc_url(admin_url('nav-menus.php')); ?>">Appearance &rarr; Menus</a>.</li>
                <li>Want a search box on your homepage? Add a <em>Custom HTML</em> block with <code>&lt;div data-spm-widget="site-search"&gt;&lt;/div&gt;</code> &mdash; searches go to your property list.</li>
            </ul>
            <p><a href="<?php echo esc_url(admin_url('admin.php?page=spm-settings')); ?>">Go to SPM settings</a> &middot; <a href="<?php echo esc_url(admin_url('admin.php?page=spm-health')); ?>">Site Health</a></p>
        </div>
    </div>
<?php endif; ?>
</div>
