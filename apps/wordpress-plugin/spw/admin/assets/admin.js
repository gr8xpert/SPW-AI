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

    $('#spw-create-pages').on('click', function () {
        post('spw_create_pages', this, function (resp) {
            if (!resp.success) {
                alert('Page creation failed: ' + (resp.data || 'unknown'));
                return;
            }
            var results = (resp.data && resp.data.results) || {};
            var created = [], existed = [], failed = [];
            Object.keys(results).forEach(function (k) {
                var r = results[k] || {};
                var label = r.title || k;
                if (r.status === 'created') created.push(label);
                else if (r.status === 'exists') existed.push(label);
                else failed.push(label + ' (' + (r.error || 'unknown') + ')');
            });
            var lines = [];
            if (created.length) lines.push('Created: ' + created.join(', '));
            if (existed.length) lines.push('Already existed: ' + existed.join(', '));
            if (failed.length)  lines.push('Failed: ' + failed.join(', '));
            alert(lines.join('\n\n') || 'No changes.');
            location.reload();
        });
    });

    // Per-language slug table — one row per language with all three slug
    // columns side-by-side. Input names are parallel arrays so PHP can zip
    // index-aligned values back into per-type maps on save.
    $('#spw-slug-add').on('click', function () {
        var base = 'spw_settings[slug_rows]';
        var row = '<tr class="spw-slug-row">'
            + '<td><input type="text" name="' + base + '[lang][]"     value="" size="6" placeholder="es" /></td>'
            + '<td><input type="text" name="' + base + '[listings][]" value="" class="regular-text" placeholder="propiedades" /></td>'
            + '<td><input type="text" name="' + base + '[detail][]"   value="" class="regular-text" placeholder="propiedad" /></td>'
            + '<td><input type="text" name="' + base + '[wishlist][]" value="" class="regular-text" placeholder="favoritos" /></td>'
            + '<td><button type="button" class="button-link-delete spw-slug-remove" aria-label="Remove">&times;</button></td>'
            + '</tr>';
        $('#spw-slug-table tbody').append(row);
        $('#spw-slug-table tbody tr:last input').first().focus();
    });

    $(document).on('click', '.spw-slug-remove', function () {
        var $tr = $(this).closest('tr.spw-slug-row');
        var lang = ($tr.find('input').first().val() || '').toLowerCase().trim();
        // Refuse to drop the 'en' row — it's the cross-language fallback.
        if (lang === 'en') {
            alert('The English (en) row is the fallback and cannot be removed.');
            return;
        }
        $tr.remove();
    });
});
