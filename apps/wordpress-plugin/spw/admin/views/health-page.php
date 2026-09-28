<?php
if (!defined('ABSPATH')) exit;
$checks = SPW_Health::instance()->checks(true);
$summary = SPW_Health::summary($checks);
?>
<div class="wrap spw-wrap">
    <h1 class="spw-h1">Site Health <span class="spw-ver">v<?php echo esc_html(SPW_VERSION); ?></span></h1>
    <p class="spw-tagline">Everything your website needs to show properties, checked just now. Use the buttons to fix problems in one click.</p>

    <div class="spw-stats spw-stats--3">
        <div class="spw-stat spw-stat--<?php echo $summary['critical'] ? 'err' : 'ok'; ?>">
            <div class="spw-stat-label">Problems</div>
            <div class="spw-stat-value"><?php echo (int) $summary['critical']; ?></div>
        </div>
        <div class="spw-stat spw-stat--<?php echo $summary['recommended'] ? 'warn' : 'ok'; ?>">
            <div class="spw-stat-label">Suggestions</div>
            <div class="spw-stat-value"><?php echo (int) $summary['recommended']; ?></div>
        </div>
        <div class="spw-stat spw-stat--ok">
            <div class="spw-stat-label">Passed</div>
            <div class="spw-stat-value"><?php echo (int) $summary['good']; ?></div>
        </div>
    </div>

    <div class="spw-card">
        <div class="spw-card-body">
            <?php $compact = false; include SPW_DIR . 'admin/views/health-list.php'; ?>
            <p class="spw-btn-row">
                <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=spw-health')); ?>">Check again</a>
                <a class="button" href="<?php echo esc_url(SPW_Setup_Wizard::url()); ?>">Run setup again</a>
            </p>
        </div>
    </div>
</div>
