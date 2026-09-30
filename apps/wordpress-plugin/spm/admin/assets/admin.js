jQuery(function ($) {
    function post(action, btn, onSuccess) {
        if (!window.SPM_ADMIN) return;
        var $btn = $(btn);
        var origText = $btn.text();
        $btn.prop('disabled', true).text('Working…');
        $.post(SPM_ADMIN.ajaxUrl, { action: action, nonce: SPM_ADMIN.nonce }, function (resp) {
            $btn.prop('disabled', false).text(origText);
            onSuccess(resp);
        }).fail(function () {
            $btn.prop('disabled', false).text(origText);
            alert('Request failed.');
        });
    }

    $('#spm-test-conn').on('click', function () {
        var $r = $('#spm-test-result').removeClass('ok err').text('');
        post('spm_test_connection', this, function (resp) {
            if (resp.success) {
                $r.addClass('ok').text('✓ ' + resp.data);
            } else {
                $r.addClass('err').text('✗ ' + (resp.data || 'Failed'));
            }
        });
    });

    $('#spm-sync-now').on('click', function () {
        post('spm_sync_data', this, function (resp) {
            if (resp.success) {
                var results = resp.data.results || {};
                var failures = [];
                Object.keys(results).forEach(function (file) {
                    var r = results[file] || {};
                    if (!r.success) failures.push(file + ': ' + (r.error || 'unknown'));
                });
                console.log('[SPM] sync results', results);
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

    $('#spm-clear-cache').on('click', function () {
        if (!confirm('Clear the local data cache? Dropdowns will fall back to live API until next sync.')) return;
        post('spm_clear_cache', this, function (resp) {
            if (resp.success) location.reload();
        });
    });

    $('#spm-create-pages').on('click', function () {
        post('spm_create_pages', this, function (resp) {
            if (!resp.success) {
                alert('Page creation failed: ' + (resp.data || 'unknown'));
                return;
            }
            var results = (resp.data && resp.data.results) || {};
            var created = [], existed = [], failed = [];
            Object.keys(results).forEach(function (k) {
                var r = results[k] || {};
                var label = (r.title || k) + (r.lang ? ' [' + r.lang + ']' : '');
                if (r.status === 'created' || r.status === 'updated') created.push(label);
                else if (r.status === 'exists' || r.status === 'customised') existed.push(label);
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

    // Site Health one-click fixes.
    $(document).on('click', '.spm-health-fix', function () {
        var $btn = $(this);
        var orig = $btn.text();
        $btn.prop('disabled', true).text('Fixing…');
        $.post(SPM_ADMIN.ajaxUrl, { action: 'spm_health_fix', fix: $btn.data('fix'), nonce: SPM_ADMIN.nonce }, function (resp) {
            if (resp && resp.success) {
                location.reload();
            } else {
                $btn.prop('disabled', false).text(orig);
                alert('That did not work: ' + ((resp && resp.data) || 'unknown error'));
            }
        }).fail(function () {
            $btn.prop('disabled', false).text(orig);
            alert('Request failed.');
        });
    });

    // Setup wizard: page creation and the first sync take a few seconds.
    $('.spm-wizard form').on('submit', function () {
        $(this).find('button[type=submit]').prop('disabled', true).text('Working… this takes a few seconds');
    });

    // Per-language slug table — one row per language with all three slug
    // columns side-by-side. Input names are parallel arrays so PHP can zip
    // index-aligned values back into per-type maps on save.
    $('#spm-slug-add').on('click', function () {
        var base = 'spm_settings[slug_rows]';
        var row = '<tr class="spm-slug-row">'
            + '<td><input type="text" name="' + base + '[lang][]"     value="" size="6" placeholder="es" /></td>'
            + '<td><input type="text" name="' + base + '[listings][]" value="" class="regular-text" placeholder="propiedades" /></td>'
            + '<td><input type="text" name="' + base + '[detail][]"   value="" class="regular-text" placeholder="propiedad" /></td>'
            + '<td><input type="text" name="' + base + '[wishlist][]" value="" class="regular-text" placeholder="favoritos" /></td>'
            + '<td><button type="button" class="button-link-delete spm-slug-remove" aria-label="Remove">&times;</button></td>'
            + '</tr>';
        $('#spm-slug-table tbody').append(row);
        $('#spm-slug-table tbody tr:last input').first().focus();
    });

    $(document).on('click', '.spm-slug-remove', function () {
        var $tr = $(this).closest('tr.spm-slug-row');
        var lang = ($tr.find('input').first().val() || '').toLowerCase().trim();
        // Refuse to drop the 'en' row — it's the cross-language fallback.
        if (lang === 'en') {
            alert('The English (en) row is the fallback and cannot be removed.');
            return;
        }
        $tr.remove();
    });
});

// SPM → Blocks: click a shortcode to copy it.
jQuery(function ($) {
    $(document).on('click', '.spm-copy', function () {
        var $btn = $(this);
        var text = $btn.data('copy');
        var done = function () {
            $btn.addClass('is-copied').find('.spm-copy-hint').text('copied!');
            setTimeout(function () { $btn.removeClass('is-copied').find('.spm-copy-hint').text('copy'); }, 1500);
        };
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(done);
            return;
        }
        var $tmp = $('<textarea>').val(text).css({ position: 'fixed', opacity: 0 }).appendTo('body');
        $tmp[0].select();
        try { document.execCommand('copy'); done(); } catch (e) { window.prompt('Copy this shortcode:', text); }
        $tmp.remove();
    });
});
