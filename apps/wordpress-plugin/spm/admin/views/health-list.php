<?php
if (!defined('ABSPATH')) exit;
/** @var array $checks from SPM_Health::checks() */
/** @var bool $compact hide passing checks behind a toggle */
$compact = !empty($compact);
$order = ['critical' => 0, 'recommended' => 1, 'good' => 2];
usort($checks, function ($a, $b) use ($order) { return $order[$a['status']] <=> $order[$b['status']]; });
$good = array_filter($checks, function ($c) { return $c['status'] === 'good'; });
$icons = ['critical' => 'dashicons-dismiss', 'recommended' => 'dashicons-warning', 'good' => 'dashicons-yes-alt'];
?>
<ul class="spm-health-list">
    <?php foreach ($checks as $c):
        if ($compact && $c['status'] === 'good') continue; ?>
        <li class="spm-health-item is-<?php echo esc_attr($c['status']); ?>" data-check="<?php echo esc_attr($c['id']); ?>">
            <span class="dashicons <?php echo esc_attr($icons[$c['status']]); ?>"></span>
            <div class="spm-health-text">
                <strong><?php echo esc_html($c['label']); ?></strong>
                <span><?php echo esc_html($c['message']); ?></span>
            </div>
            <?php if (!empty($c['fix'])): ?>
                <?php if (!empty($c['fix']['action'])): ?>
                    <button type="button" class="button spm-health-fix" data-fix="<?php echo esc_attr($c['fix']['action']); ?>"><?php echo esc_html($c['fix']['label']); ?></button>
                <?php else: ?>
                    <a class="button" href="<?php echo esc_url($c['fix']['url']); ?>"><?php echo esc_html($c['fix']['label']); ?></a>
                <?php endif; ?>
            <?php endif; ?>
        </li>
    <?php endforeach; ?>
    <?php if ($compact && $good): ?>
        <li class="spm-health-item is-good spm-health-good-summary">
            <span class="dashicons dashicons-yes-alt"></span>
            <div class="spm-health-text"><strong><?php echo (int) count($good); ?> checks passed</strong>
                <span><?php echo esc_html(implode(', ', array_map(function ($c) { return $c['label']; }, $good))); ?></span></div>
        </li>
    <?php endif; ?>
</ul>
