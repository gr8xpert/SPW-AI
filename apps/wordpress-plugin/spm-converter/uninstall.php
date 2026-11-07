<?php
// Removes the converter's settings and history table. Converted pages stay as they
// are, and so do the run logs in uploads/spm-converter-logs/ (see SPMC_Log).
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

global $wpdb;
$wpdb->query("DROP TABLE IF EXISTS {$wpdb->prefix}spmc_log");
foreach (['spmc_db_version', 'spmc_id_map', 'spmc_tag_targets', 'spmc_designs', 'spmc_old_domain', 'spmc_strip_scripts', 'spmc_open_page', 'spmc_log_token'] as $o) delete_option($o);
foreach (['location', 'type', 'feature'] as $k) delete_transient('spmc_old_' . $k);
delete_transient('spmc_old_source');
