/* Custom Launcher – Apple-TV-style home screen for webOS (plain ES2015, no build step). */
(function () {
  'use strict';

  var SELF = 'io.github.swenz.customlauncher';
  var APP_DIR = '/media/developer/apps/usr/palm/applications/' + SELF;
  var INIT_SCRIPT = '/var/lib/webosbrew/init.d/50-customlauncher';
  var PITCH = 340;        // tile width + gap
  var MAX_SLOT = 4;       // focused tile never moves past the 5th visible slot
  var ROW_H = 304;
  var ROWS_TOP = 118;

  var lang = (navigator.language || 'en').slice(0, 2) === 'de' ? 'de' : 'en';
  var STR = {
    de: {
      apps: 'Apps', sources: 'Quellen', system: 'System', liveTv: 'Live TV', settings: 'Launcher-Einstellungen',
      on: 'An', off: 'Aus', na: 'n. v.',
      autostart: 'Autostart', autostartDesc: 'Launcher nach dem Einschalten und Aufwachen öffnen',
      homeAuto: 'LG Home Auto Launch', homeAutoDesc: 'Für den Launcher „Aus“ – sonst legt sich LG Home darüber',
      showSystem: 'System-Apps anzeigen', showSystemDesc: 'Reihe mit vorinstallierten LG-Apps',
      hint: 'OK = umschalten   ·   Zurück = schließen',
      launchFail: 'Start fehlgeschlagen: ', needRoot: 'Homebrew-Channel-Dienst nicht erreichbar (Root nötig)',
      listFail: 'App-Liste konnte nicht geladen werden'
    },
    en: {
      apps: 'Apps', sources: 'Inputs', system: 'System', liveTv: 'Live TV', settings: 'Launcher Settings',
      on: 'On', off: 'Off', na: 'n/a',
      autostart: 'Autostart', autostartDesc: 'Open the launcher after power-on and wake-up',
      homeAuto: 'LG Home Auto Launch', homeAutoDesc: 'Keep “Off” – otherwise LG Home covers the launcher',
      showSystem: 'Show system apps', showSystemDesc: 'Row with preinstalled LG apps',
      hint: 'OK = toggle   ·   Back = close',
      launchFail: 'Launch failed: ', needRoot: 'Homebrew Channel service not reachable (root required)',
      listFail: 'Could not load the app list'
    }
  };
  var T = STR[lang];

  var SVG = {
    hdmi: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><path d="M12 30h72v20l-12 16H24L12 50z"/><path d="M30 44h36"/></svg>',
    tv: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><rect x="10" y="20" width="76" height="48" rx="7"/><path d="M34 82h28M48 68v14"/></svg>',
    gear: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><circle cx="48" cy="48" r="13"/><path d="M48 10v12M48 74v12M10 48h12M74 48h12M21 21l9 9M66 66l9 9M75 21l-9 9M30 66l-9 9"/></svg>'
  };

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), rowsEl = $('rows');

  var store = {
    get: function (k, def) {
      try { var v = localStorage.getItem('cl.' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem('cl.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var prefs = store.get('prefs', { showSystem: true });
  var rows = [];            // [{key,title,items,offset,el,track,tiles}]
  var focus = { r: 0, c: 0 };
  var mode = 'home';
  var dataSig = '';

  /* ------------------------------------------------------------------ data */

  var MOCK_POINTS = ['Netflix#e50914', 'Prime Video#0578ff', 'Disney+#054553', 'Apple TV#000000', 'YouTube#ff0000',
    'Joyn#003a43', 'RTL+#111111', 'WOW#002c2b', 'Spotify#1db954'].map(function (s) {
    var p = s.split('#'); return { id: 'mock.' + p[0], title: p[0], iconColor: '#' + p[1], systemApp: false };
  }).concat(['Apps#4faa6e', 'Webbrowser#3b6fd6', 'Media Player#7a4fd0'].map(function (s) {
    var p = s.split('#'); return { id: 'mock.' + p[0], title: p[0], iconColor: '#' + p[1], systemApp: true };
  }));

  function defaultInputs() {
    return [1, 2, 3, 4].map(function (n) {
      return { id: 'HDMI_' + n, label: 'HDMI ' + n, port: n, appId: 'com.webos.app.hdmi' + n, hdmiPlugIn: true };
    });
  }

  function loadData() {
    if (!Luna.available) { return Promise.resolve({ points: MOCK_POINTS, inputs: defaultInputs() }); }
    var points = Luna.smartCall('luna://com.webos.applicationManager/listLaunchPoints', {})
      .then(function (r) { return r.launchPoints || []; });
    var inputs = Luna.smartCall('luna://com.webos.service.eim/getAllInputStatus', {})
      .then(function (r) { return (r.devices || []).filter(function (d) { return d.appId; }); })
      .catch(function () { return defaultInputs(); });
    return Promise.all([points, inputs]).then(function (a) { return { points: a[0], inputs: a[1] }; });
  }

  function appItem(p) {
    return {
      key: 'app:' + (p.launchPointId || p.id), kind: 'app', id: p.id, title: p.title || p.id,
      icon: p.largeIcon || p.icon || '', color: p.bgColor || p.iconColor || '#2a2a30', params: p.params
    };
  }

  function buildModel(data) {
    var seen = {};
    var pts = data.points.filter(function (p) {
      if (!p || !p.id || p.id === SELF || seen[p.launchPointId || p.id]) { return false; }
      seen[p.launchPointId || p.id] = 1;
      return true;
    });
    var apps = pts.filter(function (p) { return !p.systemApp; }).map(appItem);
    var system = pts.filter(function (p) { return p.systemApp; }).map(appItem);

    var sources = [{ key: 'tv', kind: 'tv', id: 'com.webos.app.livetv', title: T.liveTv, color: '#2c56c9', port: 'TV' }];
    data.inputs.forEach(function (d) {
      var port = String(d.id || '').replace('_', ' ');
      sources.push({
        key: 'in:' + d.id, kind: 'input', id: d.appId, title: d.label || port, color: '#3d4150',
        port: port, plugged: d.hdmiPlugIn !== false
      });
    });

    var settings = { key: 'settings', kind: 'settings', title: T.settings, color: '#5a5b64' };
    var model = [];
    if (apps.length) { model.push({ key: 'apps', title: T.apps, items: apps }); }
    model.push({ key: 'sources', title: T.sources, items: sources });
    if (prefs.showSystem && system.length) {
      model.push({ key: 'system', title: T.system, items: system.concat([settings]) });
    } else {
      sources.push(settings);
    }
    return model;
  }

  /* ----------------------------------------------------------------- icons */

  var iconMem = {};

  function mimeOf(path) {
    var ext = path.split('.').pop().toLowerCase();
    return ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'svg' ? 'image/svg+xml' : ext === 'webp' ? 'image/webp' : 'image/png';
  }

  /* Icons of other apps are outside our sandbox (file:// is refused), so they are
   * read as root - batched into few exec calls - and cached in localStorage. */
  var iconWaiters = {};
  var iconBatchTimer = null;

  function flushIconBatch() {
    var paths = Object.keys(iconWaiters).filter(function (p) { return !iconWaiters[p].busy; });
    for (var i = 0; i < paths.length; i += 6) { fetchIcons(paths.slice(i, i + 6)); }
  }

  function fetchIcons(paths) {
    paths.forEach(function (p) { iconWaiters[p].busy = true; });
    var cmd = 'for f in ' + paths.map(Luna.shQuote).join(' ') + '; do echo "@@$f"; base64 "$f" 2>/dev/null; done';
    var settle = function (out) {
      var found = {};
      (out || '').split('@@').forEach(function (chunk) {
        var nl = chunk.indexOf('\n');
        if (nl > 0) { found[chunk.slice(0, nl)] = chunk.slice(nl + 1).replace(/\s+/g, ''); }
      });
      paths.forEach(function (p) {
        var w = iconWaiters[p];
        delete iconWaiters[p];
        if (found[p]) {
          var uri = 'data:' + mimeOf(p) + ';base64,' + found[p];
          iconMem[p] = uri;
          if (uri.length < 120000) { store.set('icon:' + p, uri); }
          w.list.forEach(function (cb) { cb[0](uri); });
        } else {
          w.list.forEach(function (cb) { cb[1](new Error('icon')); });
        }
      });
    };
    Luna.exec(cmd, 20000).then(function (r) { settle(r.stdoutString); }, function () { settle(''); });
  }

  function iconViaRoot(path) {
    if (iconMem[path]) { return Promise.resolve(iconMem[path]); }
    if (!Luna.available) { return Promise.reject(new Error('no-bridge')); }
    return new Promise(function (resolve, reject) {
      if (!iconWaiters[path]) { iconWaiters[path] = { busy: false, list: [] }; }
      iconWaiters[path].list.push([resolve, reject]);
      clearTimeout(iconBatchTimer);
      iconBatchTimer = setTimeout(flushIconBatch, 60);
    });
  }

  function isLight(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) { return false; }
    var n = parseInt(m[1], 16);
    return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170;
  }

  /* Many icons carry their own opaque background. Sample the icon's edge and use
   * that colour for the whole tile so the artwork blends in seamlessly. Icons with a
   * transparent background on a plain white tile get a dark tile instead. */
  var sampler = document.createElement('canvas');
  sampler.width = sampler.height = 16;

  function matchTileColor(img, item, card) {
    var color = null;
    try {
      var ctx = sampler.getContext('2d');
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(img, 0, 0, 16, 16);
      var px = [ctx.getImageData(0, 8, 1, 1).data, ctx.getImageData(15, 8, 1, 1).data, ctx.getImageData(8, 0, 1, 1).data];
      var opaque = px.every(function (d) { return d[3] > 245; });
      var same = Math.abs(px[0][0] - px[1][0]) + Math.abs(px[0][1] - px[1][1]) + Math.abs(px[0][2] - px[1][2]) < 24;
      if (opaque && same) {
        color = '#' + [px[0][0], px[0][1], px[0][2]].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
      } else if (!opaque && /^#f{3,6}$/i.test(item.color)) {
        color = '#30313a';
      }
    } catch (e) { /* tainted canvas: keep the colour from the launch point */ }
    if (color && color !== item.color) {
      item.color = color;
      card.style.backgroundColor = color;
      if (currentItem() === item) { setAmbient(color); }
    }
  }

  function attachIcon(art, item) {
    var letter = function () {
      art.innerHTML = '';
      var s = document.createElement('span');
      s.className = 'letter';
      s.textContent = (item.title || '?').trim().charAt(0).toUpperCase();
      if (isLight(item.color)) { s.style.color = 'rgba(0,0,0,.72)'; }
      art.appendChild(s);
    };
    if (!item.icon) { letter(); return; }
    var img = new Image();
    var triedRoot = false;
    img.onload = function () { matchTileColor(img, item, art.parentNode); };
    img.onerror = function () {
      if (triedRoot || item.icon.charAt(0) !== '/') { letter(); return; }
      triedRoot = true;
      iconViaRoot(item.icon).then(function (uri) { img.src = uri; }, letter);
    };
    var known = iconMem[item.icon] || store.get('icon:' + item.icon, null);
    img.src = known || (item.icon.charAt(0) === '/' ? 'file://' + item.icon : item.icon);
    art.appendChild(img);
  }

  /* ---------------------------------------------------------------- render */

  function render(model) {
    var prevKey = currentItem() ? currentItem().key : null;
    rowsEl.innerHTML = '';
    rows = model.map(function (m, r) {
      var el = document.createElement('section');
      el.className = 'row';
      var h = document.createElement('h3');
      h.textContent = m.title;
      var track = document.createElement('div');
      track.className = 'track';
      var tiles = m.items.map(function (item, c) {
        var tile = document.createElement('div');
        tile.className = 'tile' + (item.kind === 'input' && !item.plugged ? ' unplugged' : '');
        tile._pos = { r: r, c: c };
        var card = document.createElement('div');
        card.className = 'card';
        card.style.backgroundColor = item.color;
        var fill = document.createElement('div'); fill.className = 'fill';
        var art = document.createElement('div'); art.className = 'art';
        var shine = document.createElement('div'); shine.className = 'shine';
        if (item.kind === 'app') {
          attachIcon(art, item);
        } else {
          art.innerHTML = SVG[item.kind === 'settings' ? 'gear' : item.kind === 'tv' ? 'tv' : 'hdmi'] +
            (item.port ? '<span class="port"></span>' : '');
          if (item.port) { art.lastChild.textContent = item.port; }
        }
        card.appendChild(art); card.appendChild(fill); card.appendChild(shine);
        var label = document.createElement('div');
        label.className = 'label';
        label.textContent = item.title;
        tile.appendChild(card); tile.appendChild(label);
        track.appendChild(tile);
        return tile;
      });
      el.appendChild(h); el.appendChild(track);
      rowsEl.appendChild(el);
      return { key: m.key, items: m.items, offset: 0, el: el, track: track, tiles: tiles };
    });

    // restore focus on the same item if it still exists
    var pos = { r: 0, c: 0 };
    rows.forEach(function (row, r) {
      row.items.forEach(function (it, c) { if (it.key === prevKey) { pos = { r: r, c: c }; } });
    });
    focus = { r: -1, c: -1 };
    setFocus(pos.r, pos.c, { instant: true });
  }

  function currentItem() {
    var row = rows[focus.r];
    return row ? row.items[focus.c] : null;
  }

  /* ----------------------------------------------------------------- focus */

  var ambientFlip = false;
  var ambientTimer = null;

  function setAmbient(color) {
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(function () {
      var a = $('ambientA'), b = $('ambientB');
      var next = ambientFlip ? a : b, prev = ambientFlip ? b : a;
      ambientFlip = !ambientFlip;
      next.style.backgroundColor = color;
      next.classList.add('on');
      prev.classList.remove('on');
    }, 140);
  }

  function setTilt(tile, x, y) {   // x, y in [-1, 1]
    var s = tile.style;
    s.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
    s.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
    s.setProperty('--px', (x * 9).toFixed(1) + 'px');
    s.setProperty('--py', (y * 6).toFixed(1) + 'px');
    s.setProperty('--sx', (x * 70).toFixed(1) + 'px');
    s.setProperty('--sy', (y * 40).toFixed(1) + 'px');
  }

  var nudgeTimer = null;

  function scrollRow(row, c, instant) {
    var slot = c * PITCH - row.offset;
    if (slot > MAX_SLOT * PITCH) { row.offset = (c - MAX_SLOT) * PITCH; }
    else if (slot < 0) { row.offset = c * PITCH; }
    applyRowOffset(row, instant);
  }

  function applyRowOffset(row, instant) {
    var max = Math.max(0, (row.items.length - MAX_SLOT - 1) * PITCH);
    row.offset = Math.max(0, Math.min(row.offset, max));
    if (instant) { row.track.style.transition = 'none'; }
    row.track.style.transform = 'translate3d(' + (-row.offset) + 'px,0,0)';
    if (instant) { void row.track.offsetWidth; row.track.style.transition = ''; }
  }

  function scrollRows(r) {
    var bottom = ROWS_TOP + (r + 1) * ROW_H + 26;
    var y = Math.max(0, bottom - 1080);
    rowsEl.style.transform = 'translate3d(0,' + (-y) + 'px,0)';
  }

  function setFocus(r, c, opts) {
    opts = opts || {};
    if (!rows.length) { return; }
    r = Math.max(0, Math.min(r, rows.length - 1));
    var row = rows[r];
    c = Math.max(0, Math.min(c, row.items.length - 1));
    if (r === focus.r && c === focus.c) { return; }

    var old = rows[focus.r] && rows[focus.r].tiles[focus.c];
    if (old) { old.classList.remove('focus', 'live', 'pressed'); setTilt(old, 0, 0); }
    if (rows[focus.r] && focus.r !== r) { rows[focus.r].el.classList.remove('active'); }

    var dx = r === focus.r ? Math.sign(c - focus.c) : 0;
    var dy = focus.r >= 0 ? Math.sign(r - focus.r) : 0;
    focus = { r: r, c: c };
    var tile = row.tiles[c];
    row.el.classList.add('active');

    // D-pad parallax: the tile swings in the direction of travel, then settles
    clearTimeout(nudgeTimer);
    if (!opts.pointer && !opts.instant && (dx || dy)) {
      setTilt(tile, dx * 0.9, dy * 0.8);
      nudgeTimer = setTimeout(function () { setTilt(tile, 0, 0); }, 230);
    } else if (!opts.pointer) {
      setTilt(tile, 0, 0);
    }
    tile.classList.add('focus');

    if (!opts.pointer) { scrollRow(row, c, opts.instant); }
    scrollRows(r);
    setAmbient(row.items[c].color);
  }

  function move(dx, dy) {
    if (dx) { setFocus(focus.r, focus.c + dx); return; }
    var nr = focus.r + dy;
    if (nr < 0 || nr >= rows.length) { return; }
    // keep the on-screen column when changing rows
    var slotX = focus.c * PITCH - rows[focus.r].offset;
    var nc = Math.round((slotX + rows[nr].offset) / PITCH);
    setFocus(nr, nc);
  }

  /* ---------------------------------------------------------------- launch */

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3500);
  }

  function activate() {
    var item = currentItem();
    if (!item) { return; }
    var tile = rows[focus.r].tiles[focus.c];
    tile.classList.add('pressed');
    setTimeout(function () { tile.classList.remove('pressed'); }, 160);

    if (item.kind === 'settings') { setTimeout(openSettings, 120); return; }
    if (!Luna.available) { toast('launch ' + item.id); return; }

    stage.classList.add('launching');
    var payload = { id: item.id };
    if (item.params && Object.keys(item.params).length) { payload.params = item.params; }
    Luna.smartCall('luna://com.webos.applicationManager/launch', payload).catch(function (e) {
      stage.classList.remove('launching');
      toast(T.launchFail + (e && e.message || item.id));
    });
    // safety net if the target never takes over the screen
    setTimeout(function () { if (!document.hidden) { stage.classList.remove('launching'); } }, 6000);
  }

  /* -------------------------------------------------------------- settings */

  var optIndex = 0;
  var opts = [
    {
      label: T.autostart, desc: T.autostartDesc, value: null,
      read: function () {
        return Luna.exec('test -x ' + INIT_SCRIPT + ' && echo yes || echo no').then(function (r) {
          return /yes/.test(r.stdoutString);
        });
      },
      write: function (on) {
        var cmd = on
          ? 'mkdir -p /var/lib/webosbrew/init.d && cp ' + APP_DIR + '/autostart.sh ' + INIT_SCRIPT + ' && chmod 755 ' + INIT_SCRIPT +
            ' && ' + INIT_SCRIPT + ' --no-boot-launch; echo done'
          : '[ -x ' + INIT_SCRIPT + ' ] && ' + INIT_SCRIPT + ' --stop; rm -f ' + INIT_SCRIPT + '; echo done';
        return Luna.exec(cmd);
      }
    },
    {
      label: T.homeAuto, desc: T.homeAutoDesc, value: null,
      read: function () {
        return Luna.smartCall('luna://com.webos.settingsservice/getSystemSettings', { category: 'general', keys: ['homeAutoLaunch'] })
          .then(function (r) { return r.settings.homeAutoLaunch === 'on'; });
      },
      write: function (on) {
        return Luna.smartCall('luna://com.webos.settingsservice/setSystemSettings',
          { category: 'general', settings: { homeAutoLaunch: on ? 'on' : 'off' } });
      }
    },
    {
      label: T.showSystem, desc: T.showSystemDesc, value: null,
      read: function () { return Promise.resolve(!!prefs.showSystem); },
      write: function (on) {
        prefs.showSystem = on; store.set('prefs', prefs); dataSig = ''; refresh();
        return Promise.resolve();
      }
    }
  ];

  function renderSettings() {
    $('settingsTitle').textContent = T.settings;
    $('settingsHint').textContent = T.hint;
    var list = $('settingsList');
    list.innerHTML = '';
    opts.forEach(function (o, i) {
      var el = document.createElement('div');
      el.className = 'opt' + (i === optIndex ? ' focus' : '');
      el._opt = i;
      var left = document.createElement('div');
      left.textContent = o.label;
      var small = document.createElement('small');
      small.textContent = o.desc;
      left.appendChild(small);
      var val = document.createElement('div');
      val.className = 'val';
      val.textContent = o.value === null ? '…' : o.value === undefined ? T.na : o.value ? T.on : T.off;
      el.appendChild(left); el.appendChild(val);
      list.appendChild(el);
    });
  }

  function readOption(o) {
    return o.read().then(function (v) { o.value = v; }, function () { o.value = undefined; }).then(renderSettings);
  }

  function openSettings() {
    mode = 'settings';
    optIndex = 0;
    opts.forEach(function (o) { o.value = null; });
    renderSettings();
    $('settings').classList.remove('hidden');
    if (Luna.available) { opts.forEach(readOption); }
    else { opts.forEach(function (o) { o.value = undefined; }); readOption(opts[2]); }
  }

  function closeSettings() {
    mode = 'home';
    $('settings').classList.add('hidden');
  }

  function toggleOption() {
    var o = opts[optIndex];
    if (o.value === null || o.value === undefined) { if (o.value === undefined) { toast(T.needRoot); } return; }
    var target = !o.value;
    o.value = null;
    renderSettings();
    o.write(target).then(function () { return readOption(o); }, function (e) {
      toast((e && e.message) || T.needRoot);
      return readOption(o);
    });
  }

  /* ----------------------------------------------------------------- input */

  var KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461, ESC: 27, BKSP: 8 };

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (mode === 'settings') {
      if (k === KEY.UP) { optIndex = Math.max(0, optIndex - 1); renderSettings(); }
      else if (k === KEY.DOWN) { optIndex = Math.min(opts.length - 1, optIndex + 1); renderSettings(); }
      else if (k === KEY.OK) { toggleOption(); }
      else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BKSP) { closeSettings(); }
      else { return; }
      e.preventDefault();
      return;
    }
    if (k === KEY.LEFT) { move(-1, 0); }
    else if (k === KEY.RIGHT) { move(1, 0); }
    else if (k === KEY.UP) { move(0, -1); }
    else if (k === KEY.DOWN) { move(0, 1); }
    else if (k === KEY.OK) { activate(); }
    else if (k === KEY.BACK || k === KEY.ESC || k === KEY.BKSP) { setFocus(0, 0); }   // a launcher has nowhere to go back to
    else { return; }
    e.preventDefault();
  });

  function tileOf(target) {
    while (target && target !== document) {
      if (target._pos) { return target; }
      target = target.parentNode;
    }
    return null;
  }

  // Magic Remote pointer: hover focuses, the focused tile tilts towards the cursor
  document.addEventListener('mousemove', function (e) {
    if (mode !== 'home') { return; }
    var tile = tileOf(e.target);
    if (!tile) { return; }
    var p = tile._pos;
    if (p.r !== focus.r || p.c !== focus.c) { setFocus(p.r, p.c, { pointer: true }); }
    var rect = tile.firstChild.getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    clearTimeout(nudgeTimer);
    tile.classList.add('live');
    setTilt(tile, Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, y)));
  });

  document.addEventListener('mouseout', function (e) {
    var tile = tileOf(e.target);
    if (tile && !tileOf(e.relatedTarget)) { tile.classList.remove('live'); setTilt(tile, 0, 0); }
  });

  document.addEventListener('click', function (e) {
    if (mode === 'settings') {
      var t = e.target;
      while (t && t !== document && t._opt === undefined) { t = t.parentNode; }
      if (t && t._opt !== undefined) { optIndex = t._opt; renderSettings(); toggleOption(); }
      else if (e.target === $('settings')) { closeSettings(); }
      return;
    }
    var tile = tileOf(e.target);
    if (!tile) { return; }
    setFocus(tile._pos.r, tile._pos.c, { pointer: true });
    activate();
  });

  // Magic Remote wheel scrolls the hovered row sideways
  document.addEventListener('wheel', function (e) {
    if (mode !== 'home') { return; }
    var tile = tileOf(e.target);
    var row = rows[tile ? tile._pos.r : focus.r];
    if (!row) { return; }
    row.offset += (e.deltaY > 0 || e.deltaX > 0 ? 1 : -1) * PITCH;
    applyRowOffset(row);
    e.preventDefault();
  }, { passive: false });

  /* ------------------------------------------------------------- lifecycle */

  function refresh() {
    return loadData().then(function (data) {
      store.set('data', data);
      var sig = JSON.stringify(data) + '|' + prefs.showSystem;
      if (sig === dataSig) { return; }
      dataSig = sig;
      render(buildModel(data));
    }, function () {
      if (!rows.length) { render(buildModel({ points: [], inputs: defaultInputs() })); }
      toast(T.listFail);
    });
  }

  function tick() {
    var d = new Date();
    $('time').textContent = d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    $('date').textContent = d.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long' });
  }

  function enter() {
    stage.classList.remove('launching');
    stage.classList.add('entering');
    void stage.offsetWidth;
    requestAnimationFrame(function () { stage.classList.remove('entering'); });
  }

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) { enter(); tick(); refresh(); }
  });
  document.addEventListener('webOSRelaunch', function () {
    if (mode === 'settings') { closeSettings(); }
    try { if (window.PalmSystem && PalmSystem.activate) { PalmSystem.activate(); } } catch (e) {}
    enter(); refresh();
  });
  window.addEventListener('resize', fit);

  fit();
  tick();
  setInterval(tick, 10000);

  // paint instantly from the last known list, then update from the TV
  var cached = store.get('data', null);
  if (cached && cached.points && Luna.available) {
    dataSig = JSON.stringify(cached) + '|' + prefs.showSystem;
    render(buildModel(cached));
  }
  enter();
  refresh();
})();
