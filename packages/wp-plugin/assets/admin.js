/**
 * SPW Sync Admin JavaScript
 */

(function ($) {
    'use strict';

    // Manual Sync button
    $('#spw-manual-sync').on('click', function () {
        var $btn = $(this);
        var $result = $('#spw-sync-result');
        var $container = $btn.closest('.spw-card');

        // Disable button and show loading
        $btn.prop('disabled', true).text(spwSync.strings.syncing);
        $container.addClass('spw-loading');
        $result.hide();

        $.ajax({
            url: spwSync.ajaxUrl,
            type: 'POST',
            data: {
                action: 'spw_manual_sync',
                nonce: spwSync.nonce
            },
            success: function (response) {
                $result.show();

                if (response.success) {
                    $result
                        .removeClass('error info')
                        .addClass('success')
                        .html('<strong>' + spwSync.strings.syncComplete + '</strong><br>' + response.data.message);

                    // Refresh the page after 2 seconds to update status
                    setTimeout(function () {
                        location.reload();
                    }, 2000);
                } else {
                    $result
                        .removeClass('success info')
                        .addClass('error')
                        .html('<strong>' + spwSync.strings.syncError + '</strong><br>' + response.data.message);
                }
            },
            error: function (xhr, status, error) {
                $result
                    .show()
                    .removeClass('success info')
                    .addClass('error')
                    .html('<strong>' + spwSync.strings.syncError + '</strong><br>' + error);
            },
            complete: function () {
                $btn.prop('disabled', false).text('Sync Now');
                $container.removeClass('spw-loading');
            }
        });
    });

    // Check Version button
    $('#spw-check-version').on('click', function () {
        var $btn = $(this);
        var $result = $('#spw-sync-result');
        var $container = $btn.closest('.spw-card');

        // Disable button and show loading
        $btn.prop('disabled', true).text(spwSync.strings.checking);
        $container.addClass('spw-loading');
        $result.hide();

        $.ajax({
            url: spwSync.ajaxUrl,
            type: 'POST',
            data: {
                action: 'spw_check_version',
                nonce: spwSync.nonce
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
                $container.removeClass('spw-loading');
            }
        });
    });

    // Copy button
    $('.spw-copy-btn').on('click', function () {
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
