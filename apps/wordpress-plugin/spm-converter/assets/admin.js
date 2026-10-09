/* Move to SPM — one screen: scan on open, answer what we couldn't work out, convert. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var KIND = { location: 'Location', type: 'Property type', feature: 'Feature' };
  var KINDS = { location: 'Locations', type: 'Property types', feature: 'Features' };
  var HOW = { map: 'your choice', skip: 'skipped', name: 'same name', parent: 'same name + parent', close: 'similar name', none: 'no match', many: 'several matches', nolist: 'old names unknown' };
  var TARGETS = ['site-listing', 'site-search', 'site-map', 'site-carousel']
    .concat(range('listing-template-', 17), range('search-template-', 6), range('carousel-template-', 6), range('map-template-', 3));
  var STEPS = ['#spmc-checking', '#spmc-none', '#spmc-found', '#spmc-working', '#spmc-done'];
  var scan = null;
  var lastRun = '';
  var oldPlugins = (window.SPMC && SPMC.oldPlugins) || [];

  function range(prefix, n) {
    var out = [];
    for (var i = 1; i <= n; i++) out.push(prefix + (i < 10 ? '0' : '') + i);
    return out;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  function post(action, data) {
    var body = new FormData();
    body.append('action', 'spmc_' + action);
    body.append('nonce', SPMC.nonce);
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    });
    return fetch(SPMC.ajax, { method: 'POST', body: body, credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.success) throw new Error((j && j.data && j.data.message) || 'Something went wrong. Reload the page and try again.');
        return j.data;
      });
  }

  var STEP_OF = { '#spmc-checking': 0, '#spmc-found': 1, '#spmc-working': 2, '#spmc-done': 4, '#spmc-none': 4 };
  var msgTimer = null;

  function show(step) {
    STEPS.forEach(function (s) { var el = $(s); if (el) el.hidden = s !== step; });
    var at = STEP_OF[step];
    $$('#spmc-steps li').forEach(function (li, i) {
      li.classList.toggle('is-done', i < at);
      li.classList.toggle('is-active', i === at);
    });
    // Loader: cycle its messages, restart the "taking long" hint.
    clearInterval(msgTimer);
    var el = $(step);
    var msg = el && el.querySelector('.spmc-loader-msg');
    var slow = el && el.querySelector('.spmc-slow');
    if (slow) { slow.style.animation = 'none'; void slow.offsetHeight; slow.style.animation = ''; }
    if (msg) {
      var msgs = msg.dataset.msgs.split('|');
      var i = 0;
      msg.textContent = msgs[0];
      msgTimer = setInterval(function () {
        msg.classList.add('is-fading');
        setTimeout(function () {
          i = (i + 1) % msgs.length;
          msg.textContent = msgs[i];
          msg.classList.remove('is-fading');
        }, 250);
      }, 2200);
    }
  }

  function status(sel, text, bad) {
    var el = $(sel);
    if (!el) return;
    el.textContent = text;
    el.classList.toggle('is-bad', !!bad);
  }

  function changedItems() {
    return scan ? scan.items.filter(function (it) { return it.changed; }) : [];
  }

  /* ---------------------------------------------------------- main flow */

  function runScan() {
    if (!$('#spmc-checking')) return Promise.resolve();
    show('#spmc-checking');
    return post('scan').then(function (d) {
      scan = d;
      counts(d.counts);
      renderAdvanced(d);
      renderMain(d);
    }).catch(function (e) {
      show('#spmc-found');
      $('#spmc-found-title').textContent = 'Could not scan the site';
      $('#spmc-found-sub').textContent = e.message;
      $('#spmc-go').hidden = true;
    });
  }

  function renderMain(d) {
    var items = changedItems();
    if (!items.length) {
      show('#spmc-none');
      lastSteps('#spmc-none-last', false);
      return;
    }
    var inm = 0;
    var spw = 0;
    items.forEach(function (it) {
      if (it.systems.indexOf('Inmotech') >= 0) inm++;
      if (it.systems.indexOf('SPW') >= 0) spw++;
    });
    var pages = items.length;
    $('#spmc-found-count').textContent = pages;
    $('#spmc-found-unit').textContent = pages === 1 ? 'place' : 'places';
    $('#spmc-found-title').textContent = 'Old property codes found on your site';
    $('#spmc-found-sub').textContent = 'One click turns them into Smart Property Manager. Your text, images and layout stay as they are.';
    $('#spmc-found-chips').innerHTML = (inm ? '<span class="spmc-chip"><i></i>Inmotech · ' + inm + '</span>' : '') +
      (spw ? '<span class="spmc-chip spmc-chip--spw"><i></i>Smart Property Widget · ' + spw + '</span>' : '');
    $('#spmc-page-list').innerHTML = items.map(function (it) {
      return '<li>' + (it.url ? '<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a>' : esc(it.title)) + '</li>';
    }).join('');
    $('#spmc-go').hidden = false;
    $('#spmc-go').textContent = 'Convert ' + plural(pages, 'place');
    renderQuestions(d.ids);
    show('#spmc-found');
  }

  function renderQuestions(ids) {
    var html = '';
    var n = 0;
    var nolist = false;
    Object.keys(KIND).forEach(function (kind) {
      var block = ids[kind];
      if (!block) return;
      block.rows.forEach(function (r) {
        if (!r.help) return;
        n++;
        if (r.how === 'nolist') nolist = true;
        var name = r.old_label ? '“' + r.old_label + '”' : 'number ' + r.old;
        var hint = r.how === 'close' ? 'We think this is <b>' + esc(r.new_label) + '</b> — change it if not.'
          : r.how === 'many' ? 'Smart Property Manager has more than one with this name — choose the right one.'
          : (r.how === 'nolist' || !r.old_label) ? 'We don\'t know its name — the page it is used on may tell you.'
          : 'Not found in Smart Property Manager by that name.';
        var opts = r.candidates.length ? r.candidates : block.choices;
        html += '<div class="spmc-q' + (r.how === 'close' ? ' is-answered' : '') + '"><label><span class="spmc-q-title">' + KIND[kind] + ' ' + esc(name) + ' from your old site</span>' +
          (r.where.length ? '<span class="spmc-q-where">Used on: ' + r.where.map(esc).join(', ') + '</span>' : '') +
          '<span class="spmc-q-hint">' + hint + '</span>' +
          '<select class="spmc-answer" data-kind="' + kind + '" data-old="' + r.old + '">' +
          '<option value="">Choose…</option>' +
          opts.map(function (o) { return '<option value="' + o.id + '"' + (r.how === 'close' && o.id === r.new ? ' selected' : '') + '>' + esc(o.label) + '</option>'; }).join('') +
          (r.how === 'close' && !opts.some(function (o) { return o.id === r.new; }) ? '<option value="' + r.new + '" selected>' + esc(r.new_label) + '</option>' : '') +
          '<option value="-1">Skip — don\'t filter by this</option></select></label></div>';
      });
    });
    $('#spmc-help').hidden = !n;
    $('#spmc-nolist').hidden = !nolist;
    $('#spmc-help-title').textContent = n ? plural(n, 'thing needs', 'things need') + ' your help' : '';
    $('#spmc-questions').innerHTML = html;
    unanswered();
  }

  function unanswered() {
    var open = $$('.spmc-answer').filter(function (s) { return s.value === ''; }).length;
    $('#spmc-go-note').textContent = open
      ? plural(open, 'question') + ' not answered — ' + (open === 1 ? 'that filter' : 'those filters') + ' will be left out. You can undo everything with one click.'
      : 'Nothing is lost — you can undo this with one click.';
  }

  document.addEventListener('change', function (e) {
    if (e.target.classList && e.target.classList.contains('spmc-answer')) {
      e.target.closest('.spmc-q').classList.toggle('is-answered', e.target.value !== '');
      unanswered();
    }
  });

  function answers() {
    var ids = {};
    $$('.spmc-answer').forEach(function (s) {
      if (s.value === '') return;
      ids[s.dataset.kind] = ids[s.dataset.kind] || {};
      ids[s.dataset.kind][s.dataset.old] = parseInt(s.value, 10);
    });
    return ids;
  }

  function selectedItems() {
    // Advanced → "What will change" can untick places.
    var off = {};
    $$('.spmc-item').forEach(function (c) { if (!c.checked) off[c.dataset.i] = true; });
    var out = [];
    scan.items.forEach(function (it, i) {
      if (it.changed && !off[i]) out.push({ kind: it.kind, id: it.id, label: it.label });
    });
    return out;
  }

  function convert() {
    var items = selectedItems();
    if (!items.length) return;
    show('#spmc-working');
    post('save', { ids: answers() })
      .then(function () { return post('convert', { items: items }); })
      .then(function (d) {
        lastRun = d.run;
        var firstUrl = (changedItems().filter(function (i) { return i.url; })[0] || {}).url;
        $('#spmc-done-title').textContent = 'Done — ' + plural(d.done, 'place') + ' now use' + (d.done === 1 ? 's' : '') + ' Smart Property Manager';
        $('#spmc-done-sub').innerHTML = (d.other.length ? esc(plural(d.other.length, 'place') + ' could not be changed: ' + d.other.join('; ')) + '<br>' : '') +
          (firstUrl ? '<a href="' + esc(firstUrl) + '" target="_blank" rel="noopener">Open a converted page</a> to check it.' : '');
        lastSteps('#spmc-done-last', true);
        show('#spmc-done');
        loadRuns();
      })
      .catch(function (e) { window.alert(e.message); show('#spmc-found'); });
  }

  /** What's left to do: switch off the old plugin, clear the cache. */
  function lastSteps(sel, converted) {
    var html = '';
    if (oldPlugins.length) {
      html += '<div class="spmc-todo" id="spmc-todo-plugin"><span class="dashicons dashicons-admin-plugins"></span><div><b>Switch off the old plugin</b>' +
        '<small>' + esc(oldPlugins.join(', ')) + ' would show its own property widget next to SPM.</small></div>' +
        '<button class="button button-primary" id="spmc-off">Switch it off</button></div>';
    }
    if (converted) {
      html += '<div class="spmc-todo"><span class="dashicons dashicons-update"></span><div><b>Clear your website cache</b>' +
        '<small>In WP Rocket, LiteSpeed, Cloudflare or your host, so visitors see the change.</small></div></div>';
    }
    $(sel).innerHTML = html ? '<h4>Last steps</h4>' + html : '';
  }

  document.addEventListener('click', function (e) {
    if (e.target.id === 'spmc-off') {
      e.target.disabled = true;
      post('deactivate').then(function (d) {
        oldPlugins = [];
        var box = $('#spmc-todo-plugin');
        box.classList.add('is-done');
        box.innerHTML = '<span class="dashicons dashicons-yes-alt"></span><div><b>Old plugin switched off</b><small>' + esc(d.off.join(', ') || 'Nothing was left to switch off.') + '</small></div>';
      }).catch(function (err) { window.alert(err.message); e.target.disabled = false; });
    }
  });

  if ($('#spmc-go')) {
    $('#spmc-go').addEventListener('click', convert);
    $('#spmc-undo-last').addEventListener('click', function () {
      if (!lastRun || !window.confirm('Put the old codes back?')) return;
      post('undo', { run: lastRun }).then(function (d) {
        window.alert(d.kept.length ? 'Done. Left alone because they were edited since: ' + d.kept.join(', ') : 'Done — the old codes are back.');
        loadRuns();
        runScan();
      }).catch(function (err) { window.alert(err.message); });
    });
    $('#spmc-domain-go').addEventListener('click', function () {
      var btn = this;
      btn.disabled = true;
      post('save', { settings: { old_domain: $('#spmc-domain').value } })
        .then(function () { return post('reload'); })
        .then(runScan)
        .catch(function (err) { window.alert(err.message); })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------------------------------------------------------- advanced */

  function counts(c) {
    Object.keys(KINDS).forEach(function (k) {
      var o = document.querySelector('[data-count="old-' + k + '"]');
      var n = document.querySelector('[data-count="new-' + k + '"]');
      if (o) o.textContent = c[k].old;
      if (n) n.textContent = c[k].new;
    });
    var src = document.querySelector('[data-count="old-source"]');
    if (src) src.textContent = c.old_source ? 'Old lists from: ' + c.old_source : 'No old lists found yet.';
  }

  function renderAdvanced(d) {
    var box = $('#spmc-results');
    if (!d.items.length) {
      box.innerHTML = '<p>No old codes found.</p>';
    } else {
      box.innerHTML = '<div class="spmc-scroll"><table class="spmc-table spmc-items"><tbody>' + d.items.map(function (it, i) {
        return '<tr><td class="spmc-check">' + (it.changed ? '<input type="checkbox" class="spmc-item" data-i="' + i + '" checked>' : '') + '</td>' +
          '<td><strong>' + esc(it.label) + '</strong> <span class="spmc-tag">' + esc(it.systems.join(' + ')) + '</span>' +
          (it.warnings.length ? ' <span class="spmc-warn">' + plural(it.warnings.length, 'note') + '</span>' : '') +
          (it.changed ? '' : ' <em>(nothing to change)</em>') +
          '<details><summary>' + plural(it.changes.length, 'code') + '</summary>' +
          it.changes.map(function (c) {
            return '<div class="spmc-change"><div class="spmc-before"><b>Before</b><code>' + esc(c.before) + '</code></div>' +
              '<div class="spmc-after"><b>After</b><code>' + (c.after === '' ? '<em>(removed)</em>' : esc(c.after)) + '</code></div>' +
              (c.notes.length ? '<ul class="spmc-notes">' + c.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '') + '</div>';
          }).join('') + '</details></td></tr>';
      }).join('') + '</tbody></table></div>';
    }

    var html = '';
    Object.keys(KINDS).forEach(function (kind) {
      var block = d.ids[kind];
      if (!block || !block.rows.length) return;
      html += '<h3>' + KINDS[kind] + '</h3><table class="spmc-table spmc-ids"><thead><tr><th>Old ID</th><th>Old name</th><th>SPM</th><th>Matched by</th></tr></thead><tbody>';
      block.rows.forEach(function (r) {
        var opts = r.candidates.length ? r.candidates : block.choices;
        html += '<tr class="' + (r.help ? 'spmc-missing' : '') + '"><td>' + r.old + '</td><td>' + esc(r.old_label || '—') + '</td><td>' +
          '<select class="spmc-pick" data-kind="' + kind + '" data-old="' + r.old + '"><option value="">' + (r.new ? esc(r.new_label) + ' (' + r.new + ')' : '— pick —') + '</option>' +
          opts.map(function (o) { return '<option value="' + o.id + '">' + esc(o.label) + ' (' + o.id + ')</option>'; }).join('') +
          '<option value="-1">Skip</option>' + (r.how === 'map' || r.how === 'skip' ? '<option value="0">Clear my choice</option>' : '') +
          '</select></td><td>' + esc(HOW[r.how] || r.how) + '</td></tr>';
      });
      html += '</tbody></table>';
    });
    $('#spmc-ids').innerHTML = html || '<p class="description">The codes found use no location, type or feature IDs.</p>';

    $('#spmc-tags').innerHTML = d.tags && d.tags.length
      ? '<h3>Inmotech shortcodes</h3><p class="description">The SPM block each one becomes. "site-…" follows the design picked in the SPM dashboard.</p>' +
        '<table class="spmc-table spmc-ids"><thead><tr><th>Shortcode</th><th>Becomes</th></tr></thead><tbody>' +
        d.tags.map(function (row) {
          return '<tr><td><code>[' + esc(row.tag) + ']</code></td><td><select class="spmc-target" data-tag="' + esc(row.tag) + '">' +
            TARGETS.map(function (x) {
              return '<option value="' + x + '"' + (x === row.target ? ' selected' : '') + '>' + x + (x === row.default ? ' (default)' : '') + '</option>';
            }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table>'
      : '';
  }

  $('#spmc-save-ids').addEventListener('click', function () {
    var ids = {};
    $$('.spmc-pick').forEach(function (s) {
      if (s.value === '') return;
      ids[s.dataset.kind] = ids[s.dataset.kind] || {};
      ids[s.dataset.kind][s.dataset.old] = parseInt(s.value, 10);
    });
    var tags = {};
    $$('.spmc-target').forEach(function (s) { tags[s.dataset.tag] = s.value; });
    status('#spmc-ids-status', 'Saving…');
    post('save', { ids: ids, tags: tags })
      .then(function () { status('#spmc-ids-status', 'Saved.'); return runScan(); })
      .catch(function (e) { status('#spmc-ids-status', e.message, true); });
  });

  $('#spmc-save-settings').addEventListener('click', function () {
    var btn = this;
    btn.disabled = true;
    status('#spmc-settings-status', 'Saving…');
    post('save', { settings: { old_domain: $('#spmc-old-domain').value, strip_scripts: $('#spmc-strip').checked } })
      .then(function () { return post('reload'); })
      .then(function (d) { counts(d.counts); status('#spmc-settings-status', 'Saved.'); return runScan(); })
      .catch(function (e) { status('#spmc-settings-status', e.message, true); })
      .then(function () { btn.disabled = false; });
  });

  function loadRuns() {
    post('runs').then(function (d) {
      var box = $('#spmc-runs');
      if (!d.runs.length) { box.innerHTML = '<p class="description">Nothing converted yet.</p>'; return; }
      box.innerHTML = '<table class="spmc-table"><thead><tr><th>When</th><th>Changed</th><th></th></tr></thead><tbody>' +
        d.runs.map(function (r) {
          var state = r.done > 0 ? '' : (r.undone > 0 ? 'Undone' : '');
          if (r.kept > 0) state += (state ? ', ' : '') + r.kept + ' kept (edited since)';
          return '<tr><td>' + esc(r.created_at) + '</td><td><details><summary>' + plural(+r.items, 'place') + '</summary><ul>' +
            r.items_list.map(function (i) { return '<li>' + esc(i.label) + ' <em>' + esc(i.status) + '</em></li>'; }).join('') + '</ul></details></td>' +
            '<td>' + (r.done > 0 ? '<button class="button spmc-undo" data-run="' + esc(r.run_id) + '">Undo</button>' : esc(state)) + '</td></tr>';
        }).join('') + '</tbody></table>';
    }).catch(function (e) { $('#spmc-runs').textContent = e.message; });
  }

  $('#spmc-runs').addEventListener('click', function (e) {
    var btn = e.target.closest('.spmc-undo');
    if (!btn || !window.confirm('Put back the old codes from this run? Places edited since are left alone.')) return;
    btn.disabled = true;
    post('undo', { run: btn.dataset.run }).then(function (d) {
      window.alert('Undone: ' + d.undone + (d.kept.length ? '\nLeft alone (edited since): ' + d.kept.join(', ') : ''));
      loadRuns();
      runScan();
    }).catch(function (err) { window.alert(err.message); btn.disabled = false; });
  });

  $('#spmc-try').addEventListener('click', function () {
    post('try', { text: $('#spmc-try-in').value }).then(function (d) {
      $('#spmc-try-out').innerHTML = '<pre class="spmc-code">' + esc(d.output) + '</pre>' +
        (d.notes.length ? '<ul class="spmc-notes">' + d.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '');
    }).catch(function (e) { $('#spmc-try-out').textContent = e.message; });
  });

  loadRuns();
  if (SPMC.ready) runScan();
})();
