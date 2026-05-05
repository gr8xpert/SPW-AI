/**
 * SPM Sync Admin JavaScript
 */

(function ($) {
    'use strict';

    // Manual Sync button
    $('#spm-manual-sync').on('click', function () {
        var $btn = $(this);
        var $result = $('#spm-sync-result');
        var $container = $btn.closest('.spm-card');

        // Disable button and show loading
        $btn.prop('disabled', true).text(spmSync.strings.syncing);
        $container.addClass('spm-loading');
        $result.hide();

        $.ajax({
            url: spmSync.ajaxUrl,
            type: 'POST',
            data: {
                action: 'spm_manual_sync',
                nonce: spmSync.nonce
            },
            success: function (response) {
                $result.show();

                if (response.success) {
                    $result
                        .removeClass('error info')
                        .addClass('success')
                        .html('<strong>' + spmSync.strings.syncComplete + '</strong><br>' + response.data.message);

                    // Refresh the page after 2 seconds to update status
                    setTimeout(function () {
                        location.reload();
                    }, 2000);
                } else {
                    $result
                        .removeClass('success info')
                        .addClass('error')
                        .html('<strong>' + spmSync.strings.syncError + '</strong><br>' + response.data.message);
                }
            },
            error: function (xhr, status, error) {
                $result
                    .show()
                    .removeClass('success info')
                    .addClass('error')
                    .html('<strong>' + spmSync.strings.syncError + '</strong><br>' + error);
            },
            complete: function () {
                $btn.prop('disabled', false).text('Sync Now');
                $container.removeClass('spm-loading');
            }
        });
    });

    // Check Version button
    $('#spm-check-version').on('click', function () {
        var $btn = $(this);
        var $result = $('#spm-sync-result');
        var $container = $btn.closest('.spm-card');

        // Disable button and show loading
        $btn.prop('disabled', true).text(spmSync.strings.checking);
        $container.addClass('spm-loading');
        $result.hide();

        $.ajax({
            url: spmSync.ajaxUrl,
            type: 'POST',
            data: {
                action: 'spm_check_version',
                nonce: spmSync.nonce
            },
            success: function (response) {
                $result.show();

                if (response.success) {
                    var data = response.data;
                    var message = 'Local: v' + data.local_version + ' | Remote: v' + data.remote_version;

                    if (data.needs_sync) {
                        $result
                            .removeClass('success error')
                            .addClass('info')
                            .html('<strong>Update Available!</strong><br>' + message + '<br>Click "Sync Now" to update.');
                    } else {
                        $result
                            .removeClass('error info')
                            .addClass('success')
                            .html('<strong>Up to date!</strong><br>' + message);
                    }
                } else {
                    $result
                        .removeClass('success info')
                        .addClass('error')
                        .html('<strong>Error:</strong> ' + response.data.message);
                }
            },
            error: function (xhr, status, error) {
                $result
                    .show()
                    .removeClass('success info')
                    .addClass('error')
                    .html('<strong>Error:</strong> ' + error);
            },
            complete: function () {
                $btn.prop('disabled', false).text('Check Updates');
                $container.removeClass('spm-loading');
            }
        });
    });

    // Copy button
    $('.spm-copy-btn').on('click', function () {
        var $btn = $(this);
        var textToCopy = $btn.data('copy');

        // Use Clipboard API if available
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(function () {
                showCopied($btn);
            }).catch(function () {
                fallbackCopy(textToCopy, $btn);
            });
        } else {
            fallbackCopy(textToCopy, $btn);
        }
    });

    function fallbackCopy(text, $btn) {
        var $temp = $('<textarea>');
        $('body').append($temp);
        $temp.val(text).select();

        try {
            document.execCommand('copy');
            showCopied($btn);
        } catch (err) {
            alert('Failed to copy. Please copy manually.');
        }

        $temp.remove();
    }

    function showCopied($btn) {
        var originalText = $btn.text();
        $btn.addClass('copied').text('Copied!');

        setTimeout(function () {
            $btn.removeClass('copied').text(originalText);
        }, 2000);
    }

    // Toggle password visibility
    $('input[type="password"]').each(function () {
        var $input = $(this);
        var $toggle = $('<button type="button" class="button button-small" style="margin-left: 8px;">Show</button>');

        $toggle.on('click', function () {
            if ($input.attr('type') === 'password') {
                $input.attr('type', 'text');
                $toggle.text('Hide');
            } else {
                $input.attr('type', 'password');
                $toggle.text('Show');
            }
        });

        $input.after($toggle);
    });

})(jQuery);
