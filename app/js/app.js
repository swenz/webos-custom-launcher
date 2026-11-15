/* Custom Launcher – tvOS-style home screen for webOS (plain ES2015, no build step). */
(function () {
  'use strict';

  var SELF = 'io.github.swenz.customlauncher';
  var APP_DIR = '/media/developer/apps/usr/palm/applications/' + SELF;
  var CONF_DIR = '/var/lib/webosbrew/customlauncher';
  var INIT_SCRIPT = '/var/lib/webosbrew/init.d/50-customlauncher';
  var HOME_BIN = '/usr/bin/com.webos.app.home';

  // layout on the 1920x1080 canvas (proportions taken from the tvOS home screen)
  var COLS = 6, TILE_H = 151, PITCH_X = 298, PITCH_Y = 262, MARGIN_X = 89;
  var SHELF_Y = 745;      // grid top while the dock (first row) is focused
  var GRID_Y = 190;       // grid top once you move below the dock (leaves room for the clock)
  var HOLD_MS = 550;      // long press on OK starts moving a tile

  var lang = (navigator.language || 'en').slice(0, 2) === 'de' ? 'de' : 'en';
  var STR = {
    de: {
      liveTv: 'Live TV', settings: 'Launcher-Einstellungen',
      on: 'An', off: 'Aus', na: 'n. v.',
      replaceHome: 'LG Home ersetzen', replaceHomeDesc: 'Home-Taste öffnet diesen Launcher statt des LG-Startbildschirms',
      homeAuto: 'Beim Einschalten öffnen', homeAutoDesc: 'LG-Option „Home Auto Launch“ – zeigt den Startbildschirm nach dem Einschalten',
      showSystem: 'System-Apps anzeigen', showSystemDesc: 'Vorinstallierte LG-Apps im Raster zeigen',
      resetOrder: 'Sortierung zurücksetzen', resetOrderDesc: 'Standard-Reihenfolge wiederherstellen', reset: 'Zurücksetzen',
      hint: 'OK = umschalten   ·   Zurück = schließen',
      moveHint: 'Pfeiltasten: verschieben   ·   OK: fertig',
      ccPower: 'Ausschalten', ccWifi: 'WLAN', ccLan: 'LAN', ccOffline: 'Nicht verbunden',
      ccScreen: 'Bildschirm', ccScreenSub: 'ausschalten', ccSettings: 'TV-Einstellungen', ccDashboard: 'Home Dashboard', ccReboot: 'Neustart', ccSound: 'Ton an', ccMuted: 'Stumm', ccVolume: 'Stufe ',
      ccSleep: 'Sleep-Timer', ccMin: ' Min.',
      launchFail: 'Start fehlgeschlagen: ', needRoot: 'Homebrew-Channel-Dienst nicht erreichbar (Root nötig)',
      listFail: 'App-Liste konnte nicht geladen werden'
    },
    en: {
      liveTv: 'Live TV', settings: 'Launcher Settings',
      on: 'On', off: 'Off', na: 'n/a',
      replaceHome: 'Replace LG Home', replaceHomeDesc: 'The Home button opens this launcher instead of the LG home screen',
      homeAuto: 'Open at power-on', homeAutoDesc: 'LG option “Home Auto Launch” – shows the home screen after power-on',
      showSystem: 'Show system apps', showSystemDesc: 'Show preinstalled LG apps in the grid',
      resetOrder: 'Reset order', resetOrderDesc: 'Restore the default arrangement', reset: 'Reset',
      hint: 'OK = toggle   ·   Back = close',
      moveHint: 'Arrow keys: move   ·   OK: done',
      ccPower: 'Power Off', ccWifi: 'Wi-Fi', ccLan: 'LAN', ccOffline: 'Not connected',
      ccScreen: 'Screen', ccScreenSub: 'turn off', ccSettings: 'TV settings', ccDashboard: 'Home Dashboard', ccReboot: 'Restart', ccSound: 'Sound on', ccMuted: 'Muted', ccVolume: 'Level ',
      ccSleep: 'Sleep Timer', ccMin: ' min',
      launchFail: 'Launch failed: ', needRoot: 'Homebrew Channel service not reachable (root required)',
      listFail: 'Could not load the app list'
    }
  };
  var T = STR[lang];

  var SVG = {   // keyed by tile kind
    input: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><path d="M12 30h72v20l-12 16H24L12 50z"/><path d="M30 44h36"/></svg>',
    tv: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><rect x="10" y="20" width="76" height="48" rx="7"/><path d="M34 82h28M48 68v14"/></svg>',
    settings: '<svg viewBox="0 0 96 96" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"><circle cx="48" cy="48" r="13"/><path d="M48 10v12M48 74v12M10 48h12M74 48h12M21 21l9 9M66 66l9 9M75 21l-9 9M30 66l-9 9"/></svg>'
  };

  var $ = function (id) { return document.getElementById(id); };
  var stage = $('stage'), gridEl = $('grid');

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) { e.className = cls; }
    if (text !== undefined) { e.textContent = text; }
    return e;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rowOf(i) { return Math.floor(i / COLS); }
  function hexToInt(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    return m ? parseInt(m[1], 16) : null;
  }
  /* Nearest node, starting at the given one, that carries the expando property. */
  function owner(node, prop) {
    while (node && node !== document && node[prop] === undefined) { node = node.parentNode; }
    return node === document ? null : node;
  }
  /* Two stacked layers that cross-fade: a CSS image fades in on the idle layer, null fades both out. */
  function crossfader(a, b) {
    var flip = false;
    return function (image) {
      var next = flip ? a : b, prev = flip ? b : a;
      if (image) {
        flip = !flip;
        next.style.backgroundImage = image;
        next.classList.add('on');
      } else {
        next.classList.remove('on');
      }
      prev.classList.remove('on');
    };
  }

  var store = {
    get: function (k, def) {
      try { var v = localStorage.getItem('cl.' + k); return v === null ? def : JSON.parse(v); } catch (e) { return def; }
    },
    set: function (k, v) { try { localStorage.setItem('cl.' + k, JSON.stringify(v)); } catch (e) {} }
  };

  var prefs = store.get('prefs', { showSystem: true });
  var items = [];           // ordered tiles: [{key, kind, id, title, icon, color, el, ...}]
  var focus = -1;           // index into items
  var mode = 'home';        // home | move | settings | cc
  var dataSig = '';         // what the grid was last built from, see sigOf()

  /* ------------------------------------------------------------------ data */

  function mockPoints(list, systemApp) {
    return list.map(function (s) {
      var p = s.split('#');
      return { id: 'mock.' + p[0], title: p[0], iconColor: '#' + p[1], systemApp: systemApp };
    });
  }
  var MOCK_POINTS = mockPoints(['Netflix#e50914', 'Prime Video#0578ff', 'Disney+#054553', 'Apple TV#000000', 'YouTube#ff0000',
    'Joyn#003a43', 'RTL+#111111', 'WOW#002c2b', 'Spotify#1db954'], false)
    .concat(mockPoints(['Apps#4faa6e', 'Webbrowser#3b6fd6', 'Media Player#7a4fd0'], true));

  function defaultInputs() {
    return [1, 2, 3, 4].map(function (n) {
      return { id: 'HDMI_' + n, label: 'HDMI ' + n, port: n, appId: 'com.webos.app.hdmi' + n, hdmiPlugIn: true };
    });
  }

  function sigOf(data) { return JSON.stringify(data) + '|' + prefs.showSystem; }

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

  /* One flat list like tvOS: apps, then inputs, then system apps; the user's own order wins. */
  function buildModel(data) {
    var seen = {};
    var pts = data.points.filter(function (p) {
      if (!p || !p.id || p.id === SELF || seen[p.launchPointId || p.id]) { return false; }
      seen[p.launchPointId || p.id] = 1;
      return true;
    });
    var list = pts.filter(function (p) { return !p.systemApp; }).map(appItem);

    list.push({ key: 'tv', kind: 'tv', id: 'com.webos.app.livetv', title: T.liveTv, color: '#2c56c9', port: 'TV' });
    data.inputs.forEach(function (d) {
      var port = String(d.id || '').replace('_', ' ');
      list.push({
        key: 'in:' + d.id, kind: 'input', id: d.appId, title: d.label || port, color: '#3d4150',
        port: port, plugged: d.hdmiPlugIn !== false
      });
    });
    if (prefs.showSystem) { list = list.concat(pts.filter(function (p) { return p.systemApp; }).map(appItem)); }
    list.push({ key: 'settings', kind: 'settings', title: T.settings, color: '#5a5b64' });

    var order = store.get('order', []);
    var rank = {};
    order.forEach(function (k, i) { rank[k] = i; });
    list.forEach(function (it, i) { it._rank = rank[it.key] !== undefined ? rank[it.key] : order.length + i; });
    list.sort(function (a, b) { return a._rank - b._rank; });
    return list;
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
    var n = hexToInt(hex);
    return n !== null && (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 170;
  }

  /* Many icons carry their own opaque box, sometimes smaller than the image.
   * Find the box (bounding box of opaque pixels); if its border is a solid, uniform
   * colour, use that colour for the whole tile so the artwork blends in seamlessly.
   * Icons that are just a glyph on a transparent background keep the colour from
   * the launch point - except on plain white, where they get a dark tile instead. */
  var SAMPLE = 32;
  var sampler = document.createElement('canvas');
  sampler.width = sampler.height = SAMPLE;

  function boxColor(img) {
    var ctx = sampler.getContext('2d');
    ctx.clearRect(0, 0, SAMPLE, SAMPLE);
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    var d = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    var x0 = SAMPLE, y0 = SAMPLE, x1 = -1, y1 = -1, x, y;
    for (y = 0; y < SAMPLE; y++) {
      for (x = 0; x < SAMPLE; x++) {
        if (d[(y * SAMPLE + x) * 4 + 3] > 245) {
          if (x < x0) { x0 = x; } if (x > x1) { x1 = x; }
          if (y < y0) { y0 = y; } if (y > y1) { y1 = y; }
        }
      }
    }
    if (x1 - x0 < SAMPLE / 2 || y1 - y0 < SAMPLE / 2) { return null; }   // no sizeable opaque area
    // walk the border one pixel inside the box (skips anti-aliased / rounded edges)
    var ring = [];
    for (x = x0 + 2; x <= x1 - 2; x++) { ring.push([x, y0 + 1], [x, y1 - 1]); }
    for (y = y0 + 2; y <= y1 - 2; y++) { ring.push([x0 + 1, y], [x1 - 1, y]); }
    var ref = null, good = 0;
    ring.forEach(function (p) {
      var i = (p[1] * SAMPLE + p[0]) * 4;
      if (d[i + 3] <= 245) { return; }
      if (!ref) { ref = [d[i], d[i + 1], d[i + 2]]; }
      if (Math.abs(d[i] - ref[0]) + Math.abs(d[i + 1] - ref[1]) + Math.abs(d[i + 2] - ref[2]) < 30) { good++; }
    });
    // 60 %: artwork may touch the box edge in places (a logo running edge to edge)
    if (!ref || good < ring.length * 0.6) { return null; }
    return '#' + ref.map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  function matchTileColor(img, item, card) {
    var color = null;
    try {
      color = boxColor(img);
      if (!color && /^#f{3,6}$/i.test(item.color)) { color = '#30313a'; }
    } catch (e) { /* tainted canvas: keep the colour from the launch point */ }
    if (color && color !== item.color) {
      item.color = color;
      card.style.backgroundColor = color;
      if (items[focus] === item) { setAmbient(color); }
    }
  }

  function attachIcon(art, item) {
    var letter = function () {
      art.innerHTML = '';
      var s = el('span', 'letter', (item.title || '?').trim().charAt(0).toUpperCase());
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

  function makeTile(item) {
    var tile = el('div', 'tile' + (item.kind === 'input' && !item.plugged ? ' unplugged' : ''));
    tile._item = item;
    var card = el('div', 'card');
    card.style.backgroundColor = item.color;
    var art = el('div', 'art');
    if (item.kind === 'app') {
      attachIcon(art, item);
    } else {
      art.innerHTML = SVG[item.kind];
      if (item.port) { art.appendChild(el('span', 'port', item.port)); }
    }
    card.appendChild(art);
    card.appendChild(el('div', 'fill'));
    card.appendChild(el('div', 'shine'));
    tile.appendChild(el('div', 'shadow'));
    tile.appendChild(card);
    tile.appendChild(el('div', 'label', item.title));
    item.el = tile;
    return tile;
  }

  /* Tiles are absolutely positioned by index, so re-ordering animates by itself. */
  function layout() {
    items.forEach(function (it, i) {
      var x = MARGIN_X + (i % COLS) * PITCH_X;
      var y = rowOf(i) * PITCH_Y;
      it.el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
      it.el.classList.toggle('dock', i < COLS);
    });
  }

  /* ------------------------------------------------------------- wallpaper */

  /* Like the tvOS top shelf: the focused app's own artwork fills the background.
   * art-sync.sh copies the images the apps ship into our folder (see there). */
  var artMap = store.get('art', {});
  var artTimer = null, artShown = null, artSynced = false;
  var fadeArt = crossfader($('artA'), $('artB'));

  function syncArt() {
    if (!Luna.available) { return; }
    var entries = [];
    items.forEach(function (it) {
      var m = it.kind === 'app' && /^(\/.*\/applications\/[^/]+)\//.exec(it.icon || '');
      if (m) { entries.push(Luna.shQuote(it.id + '|' + m[1])); }
    });
    if (!entries.length) { return; }
    Luna.exec('sh ' + APP_DIR + '/art-sync.sh ' + APP_DIR + ' ' + entries.join(' '), 60000).then(function (r) {
      var map = {};
      (r.stdoutString || '').split('\n').forEach(function (line) {
        var p = line.split('|');
        if (p.length === 2 && p[1]) { map[p[0]] = p[1]; }
      });
      artMap = map;
      store.set('art', map);
      showArt();
    }, function () {});
  }

  function showArt() {
    clearTimeout(artTimer);
    artTimer = setTimeout(function () {
      var it = items[focus];
      var file = it && it.kind === 'app' ? artMap[it.id] : null;
      if (file === artShown) { return; }
      if (!file) {
        artShown = null;
        fadeArt(null);
        stage.classList.remove('has-art');
        return;
      }
      var img = new Image();
      var ready = function () {
        if (!items[focus] || artMap[items[focus].id] !== file) { return; }   // focus moved on
        artShown = file;
        fadeArt('url("art/' + file + '")');
        stage.classList.add('has-art');
      };
      img.src = 'art/' + file;
      // decode() keeps the 1080p image decode from stalling the focus animation
      if (img.decode) { img.decode().then(ready, function () { delete artMap[it.id]; }); }
      else { img.onload = ready; img.onerror = function () { delete artMap[it.id]; }; }
    }, 320);
  }

  function render(model) {
    var prevKey = items[focus] ? items[focus].key : null;
    gridEl.innerHTML = '<div id="dock"></div>';
    items = model;
    items.forEach(function (it) { gridEl.appendChild(makeTile(it)); });
    layout();
    var idx = 0;
    items.forEach(function (it, i) { if (it.key === prevKey) { idx = i; } });
    focus = -1;
    setFocus(idx);
    // the control center owns the highlight while it is open (closeCC restores it)
    if (mode === 'cc' && items[focus]) { items[focus].el.classList.remove('focus'); }
  }

  /* ----------------------------------------------------------------- focus */

  var ambientTimer = null;
  var fadeAmbient = crossfader($('ambientA'), $('ambientB'));

  function glow(color) {
    var n = hexToInt(color);
    if (n === null) { n = 0x333333; }
    var rgb = (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255);
    return 'radial-gradient(ellipse 70% 75% at 50% 35%, rgba(' + rgb + ',.95), rgba(' + rgb + ',0))';
  }

  function setAmbient(color) {
    clearTimeout(ambientTimer);
    ambientTimer = setTimeout(function () { fadeAmbient(glow(color)); }, 140);
  }

  function setTilt(tile, x, y) {   // x, y in [-1, 1]
    var s = tile.style;
    s.setProperty('--ry', (x * 9).toFixed(2) + 'deg');
    s.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
    s.setProperty('--px', (x * 8).toFixed(1) + 'px');
    s.setProperty('--py', (y * 5).toFixed(1) + 'px');
    s.setProperty('--sx', (x * 60).toFixed(1) + 'px');
    s.setProperty('--sy', (y * 34).toFixed(1) + 'px');
  }

  var nudgeTimer = null;

  /* Row 0 is the dock: it sits at the bottom of the screen over the wallpaper.
   * Moving below it slides the whole grid up, like the tvOS home screen. */
  function scrollGrid() {
    var r = rowOf(focus);
    var y;
    if (r === 0 && mode !== 'move') {
      y = SHELF_Y;
      stage.classList.remove('scrolled', 'deep');
    } else {
      var overflow = GRID_Y + r * PITCH_Y + TILE_H + 90 - 1080;
      y = GRID_Y - Math.max(0, overflow);
      stage.classList.add('scrolled');
      stage.classList.toggle('deep', overflow > 0);
    }
    gridEl.style.transform = 'translate3d(0,' + y + 'px,0)';
  }

  function setFocus(i, how) {
    how = how || {};
    if (!items.length) { return; }
    i = clamp(i, 0, items.length - 1);
    if (i === focus) { return; }

    var old = items[focus] && items[focus].el;
    if (old) { old.classList.remove('focus', 'live', 'pressed'); setTilt(old, 0, 0); }

    var dx = 0, dy = 0;
    if (focus >= 0) {
      dy = Math.sign(rowOf(i) - rowOf(focus));
      dx = dy ? 0 : Math.sign(i - focus);
    }
    focus = i;
    var tile = items[i].el;

    // D-pad parallax: the tile swings in the direction of travel, then settles
    clearTimeout(nudgeTimer);
    if (!how.pointer && (dx || dy)) {
      setTilt(tile, dx * 0.9, dy * 0.8);
      nudgeTimer = setTimeout(function () { setTilt(tile, 0, 0); }, 230);
    } else if (!how.pointer) {
      setTilt(tile, 0, 0);
    }
    tile.classList.add('focus');
    scrollGrid();
    setAmbient(items[i].color);
    showArt();
  }

  function neighbour(dx, dy) {
    var col = focus % COLS;
    if (dx) {
      var c = col + dx;
      return (c < 0 || c >= COLS || focus + dx >= items.length) ? focus : focus + dx;
    }
    var t = focus + dy * COLS;
    if (t < 0) { return focus; }
    if (t >= items.length) {
      // last row is shorter: land on its last tile if there is a row below at all
      return rowOf(items.length - 1) > rowOf(focus) ? items.length - 1 : focus;
    }
    return t;
  }

  function move(dx, dy) { setFocus(neighbour(dx, dy)); }

  /* ------------------------------------------------------------ reordering */

  var toastTimer = null;
  function toast(msg, ms) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 3500);
  }

  function startMove() {
    if (mode !== 'home' || focus < 0) { return; }
    mode = 'move';
    stage.classList.add('moving');
    items[focus].el.classList.add('moving');
    scrollGrid();
    toast(T.moveHint, 6000);
  }

  function carry(dx, dy) {
    var to = neighbour(dx, dy);
    if (to === focus) { return; }
    var it = items.splice(focus, 1)[0];
    items.splice(to, 0, it);
    focus = to;
    layout();
    scrollGrid();
  }

  function endMove() {
    if (mode !== 'move') { return; }
    mode = 'home';
    stage.classList.remove('moving');
    items[focus].el.classList.remove('moving');
    store.set('order', items.map(function (it) { return it.key; }));
    $('toast').classList.remove('show');
    scrollGrid();
  }

  /* ---------------------------------------------------------------- launch */

  function activate() {
    var item = items[focus];
    if (!item) { return; }
    var tile = item.el;
    tile.classList.add('pressed');
    setTimeout(function () { tile.classList.remove('pressed'); }, 160);

    if (item.kind === 'settings') {
      setTimeout(function () { if (mode === 'home') { openSettings(); } }, 120);
      return;
    }
    if (!Luna.available) { toast('launch ' + item.id); return; }

    launchApp(item.id, item.params && Object.keys(item.params).length ? item.params : null);
  }

  function launchApp(id, params, overlay) {
    closeCC();
    // overlays (LG settings) draw on top of the launcher: keep it visible
    if (!overlay) { stage.classList.add('launching'); }
    var payload = { id: id };
    if (params) { payload.params = params; }
    Luna.smartCall('luna://com.webos.applicationManager/launch', payload).catch(function (e) {
      stage.classList.remove('launching');
      toast(T.launchFail + (e && e.message || id));
    });
    // safety net if the target never takes over the screen
    setTimeout(function () { if (!document.hidden) { stage.classList.remove('launching'); } }, 6000);
  }

  /* -------------------------------------------------------------- settings */

  var INSTALL_HOOK = 'mkdir -p ' + CONF_DIR + ' /var/lib/webosbrew/init.d' +
    ' && cp ' + APP_DIR + '/home-stub.sh ' + CONF_DIR + '/home-stub' +
    ' && cp ' + APP_DIR + '/boot-hook.sh ' + INIT_SCRIPT +
    ' && chmod 755 ' + CONF_DIR + '/home-stub ' + INIT_SCRIPT +
    ' && ' + INIT_SCRIPT + ' --no-boot-launch';
  var REMOVE_HOOK = '[ -x ' + INIT_SCRIPT + ' ] && ' + INIT_SCRIPT + ' --stop; rm -rf ' + INIT_SCRIPT + ' ' + CONF_DIR;

  function rebuild() { dataSig = ''; refresh(); return Promise.resolve(); }

  var SETTINGS_SERVICE = 'luna://com.webos.settingsservice/';
  function getSetting(category, key) {
    return Luna.smartCall(SETTINGS_SERVICE + 'getSystemSettings', { category: category, keys: [key] })
      .then(function (r) { return r.settings[key]; });
  }
  function setSetting(category, key, value) {
    var settings = {};
    settings[key] = value;
    return Luna.smartCall(SETTINGS_SERVICE + 'setSystemSettings', { category: category, settings: settings });
  }

  var optIndex = 0;
  var opts = [
    {
      label: T.replaceHome, desc: T.replaceHomeDesc, value: null,
      read: function () {
        return Luna.exec('test -x ' + INIT_SCRIPT + ' && grep -q " ' + HOME_BIN + ' " /proc/mounts && echo yes || echo no')
          .then(function (r) { return /yes/.test(r.stdoutString); });
      },
      write: function (on) { return Luna.exec((on ? INSTALL_HOOK : REMOVE_HOOK) + '; echo done'); }
    },
    {
      label: T.homeAuto, desc: T.homeAutoDesc, value: null,
      read: function () {
        return getSetting('general', 'homeAutoLaunch').then(function (v) { return v === 'on'; });
      },
      write: function (on) { return setSetting('general', 'homeAutoLaunch', on ? 'on' : 'off'); }
    },
    {
      label: T.showSystem, desc: T.showSystemDesc, value: null, local: true,
      read: function () { return Promise.resolve(!!prefs.showSystem); },
      write: function (on) {
        prefs.showSystem = on; store.set('prefs', prefs);
        return rebuild();
      }
    },
    {
      label: T.resetOrder, desc: T.resetOrderDesc, value: null, local: true, action: T.reset,
      read: function () { return Promise.resolve(true); },
      write: function () {
        store.set('order', []);
        return rebuild();
      }
    }
  ];

  function renderSettings() {
    var list = $('settingsList');
    list.innerHTML = '';
    opts.forEach(function (o, i) {
      var row = el('div', 'opt' + (i === optIndex ? ' focus' : ''));
      row._opt = i;
      var left = el('div', '', o.label);
      left.appendChild(el('small', '', o.desc));
      row.appendChild(left);
      row.appendChild(el('div', 'val',
        o.action || (o.value === null ? '…' : o.value === undefined ? T.na : o.value ? T.on : T.off)));
      list.appendChild(row);
    });
  }

  function readOption(o) {
    return o.read().then(function (v) { o.value = v; }, function () { o.value = undefined; }).then(renderSettings);
  }

  function openSettings() {
    mode = 'settings';
    optIndex = 0;
    opts.forEach(function (o) { o.value = null; });
    $('settings').classList.remove('hidden');
    opts.forEach(function (o) {
      if (Luna.available || o.local) { readOption(o); } else { o.value = undefined; }
    });
    renderSettings();
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
    o.write(target).catch(failToast).then(function () { return readOption(o); });
  }

  /* After an app update the installed hook may be outdated: refresh it silently. */
  function syncHook() {
    if (!Luna.available) { return; }
    Luna.exec('if [ -x ' + INIT_SCRIPT + ' ]; then cmp -s ' + APP_DIR + '/boot-hook.sh ' + INIT_SCRIPT +
      ' && cmp -s ' + APP_DIR + '/home-stub.sh ' + CONF_DIR + '/home-stub || { ' + INIT_SCRIPT + ' --stop; ' + INSTALL_HOOK + '; }; fi; echo ok')
      .catch(function () {});
  }

  /* -------------------------------------------------------- control center */

  var ICON = {
    power: '<path d="M24 6v16"/><path d="M14.5 11.5a14 14 0 1 0 19 0"/>',
    wifi: '<path d="M6 19a26 26 0 0 1 36 0"/><path d="M12 26a17 17 0 0 1 24 0"/><path d="M18 33a8.500 8.500 0 0 1 12 0"/><circle cx="24" cy="39" r="1.500"/>',
    lan: '<rect x="18" y="6" width="12" height="10" rx="2"/><rect x="6" y="32" width="12" height="10" rx="2"/><rect x="30" y="32" width="12" height="10" rx="2"/><path d="M24 16v8M12 32v-8h24v8"/>',
    screen: '<rect x="6" y="9" width="36" height="24" rx="4"/><path d="M17 41h14M24 33v8M14 15l20 12"/>',
    sound: '<path d="M8 19h7l9-8v26l-9-8H8z"/><path d="M31 17a10 10 0 0 1 0 14M36 12a17 17 0 0 1 0 24"/>',
    muted: '<path d="M8 19h7l9-8v26l-9-8H8z"/><path d="M32 19l10 10M42 19L32 29"/>',
    sleep: '<circle cx="24" cy="26" r="15"/><path d="M24 17v9l6 4M19 6h10"/>',
    gear: '<circle cx="24" cy="24" r="6.5"/><path d="M24 5v6M24 37v6M5 24h6M37 24h6M10.5 10.5l4.5 4.5M33 33l4.5 4.5M37.5 10.5L33 15M15 33l-4.5 4.5"/>',
    house: '<path d="M7 22L24 8l17 14"/><path d="M12 19v20h24V19"/><path d="M20 39V28h8v11"/>',
    reboot: '<path d="M39 24a15 15 0 1 1-5-11"/><path d="M35 5v9h-9"/>',
    sliders: '<path d="M6 14h20M34 14h8M6 34h8M22 34h20"/><circle cx="30" cy="14" r="4"/><circle cx="18" cy="34" r="4"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.200" stroke-linecap="round" stroke-linejoin="round">' + ICON[name] + '</svg>';
  }

  var SLEEP_STEPS = ['off', '30', '60', '90', '120'];
  var ccState = { net: null, muted: null, volume: null, sleep: null };
  var ccFocus = 0;
  var screenOff = false;

  /* Closed, only the clock pill shows. "Up" from the dock unfolds the panel below it:
   * a 4-column grid of glass tiles (x, y, w, h in cells), as in the tvOS control center.
   * icon, title, sub and on are plain values, or functions where they depend on ccState. */
  var ccItems = [
    { id: 'power', x: 0, y: 0, w: 2, h: 2, kind: 'big', icon: 'power', title: T.ccPower,
      run: function () {
        closeCC();
        Luna.smartCall('luna://com.webos.service.tvpower/power/powerOff', { reason: 'remoteKey' }).catch(failToast);
      } },
    { id: 'net', x: 2, y: 0, w: 2, h: 1, kind: 'pill',
      icon: function () { return ccState.net && ccState.net.type === 'lan' ? 'lan' : 'wifi'; },
      title: function () { return ccState.net && ccState.net.type === 'lan' ? T.ccLan : T.ccWifi; },
      sub: function () { return !ccState.net ? '…' : ccState.net.type ? ccState.net.name : T.ccOffline; },
      on: function () { return !!(ccState.net && ccState.net.type); },
      run: function () { launchApp('com.palm.app.settings', { target: 'network' }, true); } },
    { id: 'sound', x: 2, y: 1, w: 2, h: 1, kind: 'pill',
      icon: function () { return ccState.muted ? 'muted' : 'sound'; },
      title: function () { return ccState.muted ? T.ccMuted : T.ccSound; },
      sub: function () { return ccState.volume === null ? '…' : T.ccVolume + ccState.volume; },
      on: function () { return ccState.muted === false; },
      run: function () {
        var target = !ccState.muted;
        Luna.smartCall('luna://com.webos.service.apiadapter/audio/setMute', { mute: target })
          .catch(function () { return Luna.smartCall('luna://com.webos.audio/setMuted', { muted: target }); })
          .then(function () { ccState.muted = target; renderCC(); }, failToast);
      } },
    { id: 'screen', x: 0, y: 2, w: 2, h: 1, kind: 'pill', icon: 'screen', title: T.ccScreen, sub: T.ccScreenSub,
      run: function () {
        closeCC();
        // wait for the OK key to be released: any key event turns the screen back on
        setTimeout(function () {
          Luna.smartCall('luna://com.webos.service.tvpower/power/turnOffScreen', {}).then(function () { screenOff = true; }, failToast);
        }, 700);
      } },
    { id: 'sleep', x: 2, y: 2, w: 2, h: 1, kind: 'pill', icon: 'sleep', title: T.ccSleep,
      sub: function () { return ccState.sleep === null ? '…' : ccState.sleep === 'off' ? T.off : ccState.sleep + T.ccMin; },
      on: function () { return !!ccState.sleep && ccState.sleep !== 'off'; },
      run: function () {
        var i = SLEEP_STEPS.indexOf(ccState.sleep);
        var next = SLEEP_STEPS[(i + 1) % SLEEP_STEPS.length];
        setSetting('time', 'sleepTimer', next)
          .then(function () { ccState.sleep = next; renderCC(); }, failToast);
      } },
    { id: 'launcher', x: 0, y: 3, w: 1, h: 1, kind: 'round', icon: 'gear', title: T.settings,
      run: function () { closeCC(); openSettings(); } },
    { id: 'tvsettings', x: 1, y: 3, w: 1, h: 1, kind: 'round', icon: 'sliders', title: T.ccSettings,
      run: function () { launchApp('com.palm.app.settings', null, true); } },
    { id: 'dashboard', x: 2, y: 3, w: 1, h: 1, kind: 'round', icon: 'house', title: T.ccDashboard,
      run: function () { launchApp('com.webos.app.homeconnect'); } },
    { id: 'reboot', x: 3, y: 3, w: 1, h: 1, kind: 'round', icon: 'reboot', title: T.ccReboot,
      run: function () {
        closeCC();
        Luna.smartCall('luna://com.webos.service.sleep/shutdown/machineReboot', { reason: 'remoteKey' }).catch(failToast);
      } }
  ];
  var CC_DEFAULT = 1;   // never land on "Power Off" by default
  var CC_CELL = 96, CC_GAP = 20;   // 4 cells + 3 gaps = the 444px of #cc in style.css

  function ccVal(v) { return typeof v === 'function' ? v() : v; }

  function failToast(e) { toast((e && e.message) || T.needRoot); }

  function renderCC() {
    var box = $('ccGrid');
    box.innerHTML = '';
    ccItems.forEach(function (it, i) {
      var tile = el('div', 'cc ' + it.kind + (mode === 'cc' && i === ccFocus ? ' focus' : '') + (ccVal(it.on) ? ' on' : ''));
      tile.style.left = (it.x * (CC_CELL + CC_GAP)) + 'px';
      tile.style.top = (it.y * (CC_CELL + CC_GAP)) + 'px';
      tile.style.width = (it.w * CC_CELL + (it.w - 1) * CC_GAP) + 'px';
      tile.style.height = (it.h * CC_CELL + (it.h - 1) * CC_GAP) + 'px';
      tile._cc = i;
      tile.innerHTML = '<span class="ic">' + icon(ccVal(it.icon)) + '</span>';
      var txt = el('span', 'tx');
      txt.appendChild(el('b', '', ccVal(it.title)));
      if (it.sub) { txt.appendChild(el('small', '', ccVal(it.sub))); }
      tile.appendChild(txt);
      box.appendChild(tile);
    });
  }

  function loadCCState() {
    if (!Luna.available) {
      ccState = { net: { type: 'wifi', name: 'Home' }, muted: false, volume: 12, sleep: 'off' };
      renderCC();
      return;
    }
    Luna.smartCall('luna://com.webos.service.connectionmanager/getStatus', {}).then(function (r) {
      var wired = r.wired || {}, wifi = r.wifi || {};
      ccState.net = wired.state === 'connected' ? { type: 'lan', name: wired.ipAddress || '' }
        : wifi.state === 'connected' ? { type: 'wifi', name: wifi.displayName || wifi.ssid || '' }
        : { type: null };
      renderCC();
    }, function () {});
    Luna.smartCall('luna://com.webos.service.apiadapter/audio/getStatus', {}).then(function (r) {
      ccState.muted = !!r.mute;
      ccState.volume = r.volume;
      renderCC();
    }, function () {});
    getSetting('time', 'sleepTimer').then(function (v) {
      ccState.sleep = v;
      renderCC();
    }, function () {});
  }

  function openCC() {
    if (mode !== 'home') { return; }
    mode = 'cc';
    ccFocus = CC_DEFAULT;
    if (items[focus]) { items[focus].el.classList.remove('focus'); }
    stage.classList.add('cc-open');
    renderCC();
    loadCCState();
  }

  function closeCC() {
    if (mode !== 'cc') { return; }
    mode = 'home';
    stage.classList.remove('cc-open');
    if (items[focus]) { items[focus].el.classList.add('focus'); }
  }

  /* Spatial navigation: nearest tile whose centre lies in the pressed direction.
   * Leaving the panel at the bottom closes it. */
  function ccMove(dx, dy) {
    var cur = ccItems[ccFocus];
    var cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    var best = -1, bestScore = 1e9;
    ccItems.forEach(function (it, i) {
      if (i === ccFocus) { return; }
      var ox = it.x + it.w / 2 - cx, oy = it.y + it.h / 2 - cy;
      var along = dx ? ox * dx : oy * dy;
      if (along <= 0.1) { return; }
      var across = Math.abs(dx ? oy : ox);
      var overlap = dx
        ? Math.min(it.y + it.h, cur.y + cur.h) - Math.max(it.y, cur.y)
        : Math.min(it.x + it.w, cur.x + cur.w) - Math.max(it.x, cur.x);
      var score = along + across * 2 + (overlap > 0 ? 0 : 10);
      if (score < bestScore) { bestScore = score; best = i; }
    });
    if (best >= 0) { ccFocus = best; renderCC(); }
    else if (dy > 0) { closeCC(); }
  }

  /* ----------------------------------------------------------------- input */

  var KEY = { OK: 13, BACK: 461, ESC: 27, BKSP: 8 };
  var ARROWS = { 37: [-1, 0], 38: [0, -1], 39: [1, 0], 40: [0, 1] };   // key code -> [dx, dy]
  var okTimer = null, okDown = false, okConsumed = false;

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    var isBack = k === KEY.BACK || k === KEY.ESC || k === KEY.BKSP;
    var dir = ARROWS[k];

    // "Screen off" from the control center: the first key only wakes the screen
    if (screenOff) {
      screenOff = false;
      Luna.smartCall('luna://com.webos.service.tvpower/power/turnOnScreen', {}).catch(function () {});
      e.preventDefault();
      return;
    }

    if (mode === 'cc') {
      if (dir) { ccMove(dir[0], dir[1]); }
      else if (k === KEY.OK) { if (!e.repeat) { ccItems[ccFocus].run(); } }
      else if (isBack) { closeCC(); }
      else { return; }
      e.preventDefault();
      return;
    }

    if (mode === 'settings') {
      if (dir && dir[1]) { optIndex = clamp(optIndex + dir[1], 0, opts.length - 1); renderSettings(); }
      else if (k === KEY.OK) { if (!e.repeat) { toggleOption(); } }
      else if (isBack) { closeSettings(); }
      else { return; }
      e.preventDefault();
      return;
    }

    if (mode === 'move') {
      if (dir) { carry(dir[0], dir[1]); }
      else if (k === KEY.OK) { if (!e.repeat && !okDown) { okDown = true; okConsumed = true; endMove(); } }
      else if (isBack) { endMove(); }
      else { return; }
      e.preventDefault();
      return;
    }

    if (dir && dir[1] < 0 && focus < COLS) { openCC(); }   // up from the dock
    else if (dir) { move(dir[0], dir[1]); }
    else if (k === KEY.OK) {
      // short press launches (on key-up), holding the key picks the tile up
      if (!okDown) {
        okDown = true; okConsumed = false;
        okTimer = setTimeout(function () { okConsumed = true; startMove(); }, HOLD_MS);
      }
    }
    else if (isBack) { setFocus(0); }   // a launcher has nowhere to go back to
    else { return; }
    e.preventDefault();
  });

  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== KEY.OK) { return; }
    clearTimeout(okTimer);
    var fire = okDown && !okConsumed && mode === 'home';
    okDown = false;
    if (fire) { activate(); }
  });

  function tileOf(target) { return owner(target, '_item'); }

  // Magic Remote pointer: hover focuses, the focused tile tilts towards the cursor
  document.addEventListener('mousemove', function (e) {
    if (mode === 'cc') {
      var c = owner(e.target, '_cc');
      if (c && c._cc !== ccFocus) { ccFocus = c._cc; renderCC(); }
      return;
    }
    if (mode !== 'home') { return; }
    var tile = tileOf(e.target);
    if (!tile) { return; }
    var i = items.indexOf(tile._item);
    if (i !== focus) {
      // hovering must not make the grid jump between dock and grid position
      var sameZone = (rowOf(i) === 0) === (rowOf(focus) === 0);
      if (!sameZone) { return; }
      setFocus(i, { pointer: true });
    }
    var rect = tile.childNodes[1].getBoundingClientRect();
    var x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    var y = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    clearTimeout(nudgeTimer);
    tile.classList.add('live');
    setTilt(tile, clamp(x, -1, 1), clamp(y, -1, 1));
  });

  document.addEventListener('mouseout', function (e) {
    var tile = tileOf(e.target);
    if (tile && !tileOf(e.relatedTarget)) { tile.classList.remove('live'); setTilt(tile, 0, 0); }
  });

  var pressTimer = null, longPressed = false;
  document.addEventListener('mousedown', function (e) {
    var tile = tileOf(e.target);
    longPressed = false;
    if (mode !== 'home' || !tile) { return; }
    pressTimer = setTimeout(function () {
      longPressed = true;
      setFocus(items.indexOf(tile._item), { pointer: true });
      startMove();
    }, HOLD_MS);
  });
  document.addEventListener('mouseup', function () { clearTimeout(pressTimer); });

  document.addEventListener('click', function (e) {
    if (longPressed) { longPressed = false; return; }
    if (mode === 'cc') {
      var c = owner(e.target, '_cc');
      if (c) { ccFocus = c._cc; renderCC(); ccItems[ccFocus].run(); }
      else { closeCC(); }
      return;
    }
    if (mode === 'home' && $('top').contains(e.target)) { openCC(); return; }
    if (mode === 'settings') {
      var t = owner(e.target, '_opt');
      if (t) { optIndex = t._opt; renderSettings(); toggleOption(); }
      else if (e.target === $('settings')) { closeSettings(); }
      return;
    }
    if (mode === 'move') { endMove(); return; }
    var tile = tileOf(e.target);
    if (!tile) { return; }
    setFocus(items.indexOf(tile._item), { pointer: true });
    activate();
  });

  // Magic Remote wheel moves a row up or down
  var wheelLock = 0;
  document.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (mode !== 'home' || Date.now() < wheelLock) { return; }
    wheelLock = Date.now() + 180;
    move(0, e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  /* ------------------------------------------------------------- lifecycle */

  var refreshing = null;

  function refresh() {
    if (mode === 'move') { return Promise.resolve(); }
    if (refreshing) { return refreshing; }   // one load at a time; it reads prefs and order when it lands
    var done = function () { refreshing = null; };
    refreshing = loadData().then(function (data) {
      if (mode === 'move') { return; }   // picked up meanwhile: the next refresh catches up
      var sig = sigOf(data);
      var changed = sig !== dataSig;
      if (changed) {
        dataSig = sig;
        store.set('data', data);
        render(buildModel(data));
      }
      if (changed || !artSynced) { artSynced = true; syncArt(); }
    }, function () {
      if (!items.length) { render(buildModel({ points: [], inputs: defaultInputs() })); }
      toast(T.listFail);
    });
    refreshing.then(done, done);
    return refreshing;
  }

  var clockFormat = new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit' });
  var clockText = '';

  function tick() {
    var text = clockFormat.format(new Date());
    if (text !== clockText) { clockText = text; $('time').textContent = text; }
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
    if (!document.hidden) { enter(); tick(); refresh(); loadCCState(); }
  });
  document.addEventListener('webOSRelaunch', function () {
    // Home button while the launcher is already showing: back to the first tile
    var wasVisible = !document.hidden;
    if (mode === 'settings') { closeSettings(); }
    if (mode === 'move') { endMove(); }
    if (mode === 'cc') { closeCC(); }
    try { if (window.PalmSystem && PalmSystem.activate) { PalmSystem.activate(); } } catch (e) {}
    if (wasVisible) { setFocus(0); } else { enter(); }
    refresh();
  });
  window.addEventListener('resize', fit);

  fit();
  tick();
  $('settingsTitle').textContent = T.settings;
  $('settingsHint').textContent = T.hint;
  renderCC();
  loadCCState();
  setInterval(tick, 10000);
  // apps installed or removed while the launcher is showing
  setInterval(function () { if (!document.hidden && mode === 'home') { refresh(); } }, 120000);

  // paint instantly from the last known list, then update from the TV
  var cached = store.get('data', null);
  if (cached && cached.points && Luna.available) {
    dataSig = sigOf(cached);
    render(buildModel(cached));
  }
  enter();
  refresh();
  syncHook();
})();
