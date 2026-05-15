jQuery(function ($) {
    function post(action, btn, onSuccess) {
        if (!window.SPW_ADMIN) return;
        var $btn = $(btn);
        var origText = $btn.text();
        $btn.prop('disabled', true).text('Working…');
        $.post(SPW_ADMIN.ajaxUrl, { action: action, nonce: SPW_ADMIN.nonce }, function (resp) {
            $btn.prop('disabled', false).text(origText);
            onSuccess(resp);
        }).fail(function () {
            $btn.prop('disabled', false).text(origText);
            alert('Request failed.');
        });
    }

    $('#spw-test-conn').on('click', function () {
        var $r = $('#spw-test-result').removeClass('ok err').text('');
        post('spw_test_connection', this, function (resp) {
            if (resp.success) {
                $r.addClass('ok').text('✓ ' + resp.data);
            } else {
                $r.addClass('err').text('✗ ' + (resp.data || 'Failed'));
            }
        });
    });

    $('#spw-sync-now').on('click', function () {
        post('spw_sync_data', this, function (resp) {
            if (resp.success) {
                var results = resp.data.results || {};
                var failures = [];
                Object.keys(results).forEach(function (file) {
                    var r = results[file] || {};
                    if (!r.success) failures.push(file + ': ' + (r.error || 'unknown'));
                });
                console.log('[SPW] sync results', results);
                if (failures.length) {
                    alert('Synced with errors:\n\n' + failures.join('\n'));
                } else {
                    alert('Data synced.');
                }
                location.reload();
            } else {
                alert('Sync failed: ' + (resp.data || 'unknown'));
            }
        });
    });

    $('#spw-clear-cache').on('click', function () {
        if (!confirm('Clear the local data cache? Dropdowns will fall back to live API until next sync.')) return;
        post('spw_clear_cache', this, function (resp) {
            if (resp.success) location.reload();
        });
    });
});
