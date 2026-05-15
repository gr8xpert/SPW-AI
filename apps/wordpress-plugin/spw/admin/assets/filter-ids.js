jQuery(function ($) {
    // Copy any row's ID to clipboard. Falls back to a hidden textarea for
    // older browsers / contexts where the Clipboard API is unavailable.
    function copyToClipboard(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(String(text));
        }
        return new Promise(function (resolve, reject) {
            var ta = document.createElement('textarea');
            ta.value = String(text);
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try {
                document.execCommand('copy');
                resolve();
            } catch (e) { reject(e); }
            finally { document.body.removeChild(ta); }
        });
    }

    $(document).on('click', '.spw-copy-btn', function () {
        var $b = $(this);
        var val = $b.data('copy');
        var orig = $b.text();
        copyToClipboard(val).then(function () {
            $b.text('✓ Copied').addClass('button-primary');
            setTimeout(function () { $b.text(orig).removeClass('button-primary'); }, 1200);
        }).catch(function () {
            $b.text('Copy failed');
            setTimeout(function () { $b.text(orig); }, 1500);
        });
    });

    // Accordion — clicking a section header toggles its body. Section header
    // stays visible at all times so users see all three categories exist.
    $(document).on('click', '.spw-acc-head', function () {
        var $section = $(this).closest('.spw-acc');
        var open = !$section.hasClass('is-open');
        $section.toggleClass('is-open', open);
        $(this).attr('aria-expanded', open ? 'true' : 'false');
    });

    // Live filter — matches a row if either its name or its numeric ID
    // contains the query. When searching, every section that has at least
    // one match auto-opens; sections with zero matches stay (visually) so
    // the user still knows they exist, but their body is collapsed.
    var $search = $('#spw-id-search');
    function applyFilter() {
        var q = ($search.val() || '').toLowerCase().trim();
        $('.spw-id-row').each(function () {
            var $r = $(this);
            var name = String($r.data('name') || '');
            var id   = String($r.data('id') || '');
            var hit  = !q || name.indexOf(q) !== -1 || id.indexOf(q) !== -1;
            $r.toggleClass('spw-hidden', !hit);
        });
        $('.spw-id-cat').each(function () {
            var visible = $(this).find('.spw-id-row').not('.spw-hidden').length;
            $(this).toggleClass('spw-hidden', q !== '' && visible === 0);
        });
        $('.spw-acc').each(function () {
            var $sec = $(this);
            var visible = $sec.find('.spw-id-row').not('.spw-hidden').length;
            if (q !== '') {
                // Auto-open matching sections, close empty ones.
                var hasMatches = visible > 0;
                $sec.toggleClass('is-open', hasMatches);
                $sec.find('.spw-acc-head').attr('aria-expanded', hasMatches ? 'true' : 'false');
                $sec.toggleClass('spw-acc-empty', !hasMatches);
            } else {
                $sec.removeClass('spw-acc-empty');
            }
        });
    }
    $search.on('input', applyFilter);
    if ($search.val()) applyFilter();
});
