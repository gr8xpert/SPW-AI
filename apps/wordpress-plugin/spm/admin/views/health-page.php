<?php
if (!defined('ABSPATH')) exit;
$checks = SPM_Health::instance()->checks(true);
$summary = SPM_Health::summary($checks);
?>
<div class="wrap spm-wrap">
    <h1 class="spm-h1">Site Health <span class="spm-ver">v<?php echo esc_html(SPM_VERSION); ?></span></h1>
    <p class="spm-tagline">Everything your website needs to show properties, checked just now. Use the buttons to fix problems in one click.</p>

    <div class="spm-stats spm-stats--3">
        <div class="spm-stat spm-stat--<?php echo $summary['critical'] ? 'err' : 'ok'; ?>">
            <div class="spm-stat-label">Problems</div>
            <div class="spm-stat-value"><?php echo (int) $summary['critical']; ?></div>
        </div>
        <div class="spm-stat spm-stat--<?php echo $summary['recommended'] ? 'warn' : 'ok'; ?>">
            <div class="spm-stat-label">Suggestions</div>
            <div class="spm-stat-value"><?php echo (int) $summary['recommended']; ?></div>
        </div>
        <div class="spm-stat spm-stat--ok">
            <div class="spm-stat-label">Passed</div>
            <div class="spm-stat-value"><?php echo (int) $summary['good']; ?></div>
        </div>
    </div>

    <div class="spm-card">
        <div class="spm-card-body">
            <?php $compact = false; include SPM_DIR . 'admin/views/health-list.php'; ?>
            <p class="spm-btn-row">
                <a class="button" href="<?php echo esc_url(admin_url('admin.php?page=spm-health')); ?>">Check again</a>
                <a class="button" href="<?php echo esc_url(SPM_Setup_Wizard::url()); ?>">Run setup again</a>
            </p>
        </div>
    </div>
</div>
