/* ============================================================
   Ultra Home v2 — app logic
   Fixes in v2:
   - lock screen now ALWAYS hides after unlock (incl. remembered key)
   - tabs are only restored AFTER the proxy is ready (no 404s)
   - wisp URL auto-normalized (https->wss, trailing slash)
   - reload + fullscreen buttons for the active tab
   - "Recent" row on the home screen
   - library export / import (backup)
   ============================================================ */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ---------- persistent state ---------- */
const LIB_KEY = 'uvapp_library_v1';
const TABS_KEY = 'uvapp_tabs_v2';
const SET_KEY = 'uvapp_settings_v1';
const KEY_KEY = 'uvapp_key';

function load(k, fallback) {
  try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fallback; }
  catch { return fallback; }
}
function save(k, v) { localStorage.setItem(k, JSON.stringify(v)); }

let settings = load(SET_KEY, { dev: false, engine: 'ddg', wisp: null });
let library = load(LIB_KEY, { games: [], apps: [], movies: [] });
['games', 'apps', 'movies'].forEach(c => { if (!Array.isArray(library[c])) library[c] = []; });

/* ---------- tabs ---------- */
let tabs = [];          // {id, kind:'home'} | {id, kind:'proxy', url, title}
let activeTabId = null;
let nextId = 1;
let libCategory = 'games';

const CATS = { games: 'Games', apps: 'Apps', movies: 'Movies' };

const ENGINES = {
  ddg: q => 'https://duckduckgo.com/?q=' + encodeURIComponent(q),
  google: q => 'https://www.google.com/search?q=' + encodeURIComponent(q),
  bing: q => 'https://www.bing.com/search?q=' + encodeURIComponent(q)
};

/* ---------- helpers ---------- */
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(t._tm);
  t._tm = setTimeout(() => { t.hidden = true; }, ms);
}

async function sha256hex(str) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function hostOf(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } }

function firstLetter(name) {
  const c = (name || '?').trim().charAt(0).toUpperCase();
  return /[A-Z0-9]/.test(c) ? c : '?';
}

/* accept any paste format and make it a proper wss:// URL */
function normWisp(u) {
  u = (u || '').toString().trim();
  if (!u) return null;
  if (u.startsWith('https://')) u = 'wss://' + u.slice(8);
  if (u.startsWith('http://')) u = 'ws://' + u.slice(7);
  if (!u.startsWith('wss://') && !u.startsWith('ws://')) u = 'wss://' + u;
  if (!u.endsWith('/')) u += '/';
  return u;
}

/* ---------- cloak gate ---------- */
async function gate() {
  const scr = $('#lockScreen');

  const stored = localStorage.getItem(KEY_KEY);
  if (stored && (await sha256hex(stored)) === CLOAK_HASH) {
    scr.hidden = true;          // v2 fix: ALWAYS hide, even on the fast path
    return true;
  }
  if (stored) localStorage.removeItem(KEY_KEY); // stale/old key

  return new Promise(resolve => {
    const input = $('#lockKey'), err = $('#lockError');
    scr.hidden = false;
    const tryKey = async () => {
      const k = input.value;
      if ((await sha256hex(k)) === CLOAK_HASH) {
        localStorage.setItem(KEY_KEY, k);
        scr.hidden = true;
        resolve(true);
      } else {
        err.hidden = false;
        input.value = '';
        input.focus();
      }
    };
    $('#lockBtn').onclick = tryKey;
    input.onkeydown = e => { if (e.key === 'Enter') tryKey(); };
    setTimeout(() => input.focus(), 60);
  });
}

/* ---------- proxy boot ---------- */
async function bootProxy() {
  const wisp = normWisp(settings.wisp || WISP_URL);
  if (!wisp) {
    toast('No proxy server set — open Settings and paste your server URL');
    return false;
  }
  try {
    await navigator.serviceWorker.register('/uv/sw.js');
    const conn = new BareMux.BareMuxConnection('/baremux/worker.js');
    await conn.setTransport('/epoxy/index.mjs', [{ wisp }]);
    return true;
  } catch (e) {
    console.error(e);
    toast('Proxy failed to start — check the server URL in Settings');
    return false;
  }
}

/* ---------- tabs ---------- */
function wrapOf(id) { return $(`.proxy-wrap[data-tab-id="${id}"]`); }

function persistTabs() {
  save(TABS_KEY, tabs.filter(t => t.kind === 'proxy').map(t => ({ url: t.url, title: t.title })));
}

function makeTabButton(t) {
  const b = document.createElement('button');
  b.className = 'tab' + (t.id === activeTabId ? ' active' : '');
  b.title = t.title || 'New Tab';
  const dot = document.createElement('span');
  dot.className = 'tab-dot' + (t.kind === 'home' ? ' home-dot' : '');
  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = t.kind === 'home' ? 'Home' : (t.title || hostOf(t.url) || '...');
  b.append(dot, title);
  if (t.kind === 'proxy') {
    const x = document.createElement('span');
    x.className = 'tab-close';
    x.textContent = '\u00d7';
    x.onclick = e => { e.stopPropagation(); closeTab(t.id); };
    b.appendChild(x);
  }
  b.onclick = () => activateTab(t.id);
  return b;
}

function renderTabs() {
  const strip = $('#tabStrip');
  strip.innerHTML = '';
  tabs.forEach(t => strip.appendChild(makeTabButton(t)));
}

function activateTab(id) {
  activeTabId = id;
  $$('.proxy-wrap').forEach(w => { w.hidden = (w.dataset.tabId !== String(id)); });
  const homeId = tabs.find(t => t.kind === 'home')?.id;
  $('#view-home').hidden = (id !== homeId);
  $('#view-library').hidden = true;
  renderTabs();
}

function closeTab(id) {
  const t = tabs.find(x => x.id === id);
  if (!t || t.kind === 'home') return;
  tabs = tabs.filter(x => x.id !== id);
  const w = wrapOf(id);
  if (w) w.remove();
  if (activeTabId === id) {
    const home = tabs.find(x => x.kind === 'home');
    activateTab(home.id);
  } else renderTabs();
  persistTabs();
}

function openProxyTab(url) {
  const existing = tabs.find(t => t.kind === 'proxy' && t.url === url);
  if (existing) { activateTab(existing.id); return existing; }

  const t = { id: nextId++, kind: 'proxy', url, title: hostOf(url) };
  tabs.push(t);

  const wrap = document.createElement('div');
  wrap.className = 'proxy-wrap';
  wrap.dataset.tabId = String(t.id);
  wrap.hidden = true;
  const frame = document.createElement('iframe');
  frame.allow = 'autoplay; fullscreen; encrypted-media; clipboard-write; gamepad';
  frame.src = window.__uv$config.prefix + window.__uv$config.encodeUrl(url);
  wrap.appendChild(frame);
  $('#views').appendChild(wrap);

  frame.addEventListener('load', () => {
    try {
      const d = frame.contentDocument;
      if (d && d.title) {
        t.title = d.title;
        if (t.id === activeTabId) renderTabs();
      }
      const loc = frame.contentWindow.location.href;
      const m = loc.split('/uv/service/')[1];
      if (m) t.url = window.__uv$config.decodeUrl(decodeURIComponent(m));
      persistTabs();
    } catch { /* cross-origin edge cases */ }
  });

  activateTab(t.id);
  persistTabs();
  return t;
}

function goHome() {
  const home = tabs.find(t => t.kind === 'home');
  if (home) activateTab(home.id);
}

/* ---------- home / search ---------- */
function tickClock() {
  const now = new Date();
  $('#clock').textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  $('#dateLine').textContent = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

function isProbablyUrl(s) {
  return /^https?:\/\//i.test(s) || /^[\w-]+(\.[\w-]+)+([/?#].*)?$/i.test(s);
}

function goSearch(q) {
  q = q.trim();
  if (!q) return;
  let url;
  if (isProbablyUrl(q)) url = /^https?:\/\//i.test(q) ? q : 'https://' + q;
  else url = ENGINES[settings.engine || 'ddg'](q);
  openProxyTab(url);
}

/* ---------- libraries ---------- */
function showLibrary(cat) {
  libCategory = cat;
  $('#libTitle').textContent = CATS[cat];
  renderLibrary();
  $('#view-home').hidden = true;
  $('#view-library').hidden = false;
  $$('.proxy-wrap').forEach(w => { w.hidden = true; });
  renderTabs();
}

function renderLibrary() {
  const grid = $('#libGrid');
  grid.innerHTML = '';
  const items = library[libCategory] || [];

  if (!items.length && !settings.dev) {
    const empty = document.createElement('div');
    empty.className = 'lib-empty';
    empty.innerHTML = `Nothing here yet.<br>Turn on <b>Developer mode</b> in Settings (gear icon) to add ${CATS[libCategory].toLowerCase()}.`;
    grid.appendChild(empty);
  }

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'lib-card';
    if (item.cover) {
      const img = document.createElement('img');
      img.className = 'lib-cover';
      img.loading = 'lazy';
      img.onerror = () => { img.replaceWith(makeFallback(item.name)); };
      img.src = item.cover;
      card.appendChild(img);
    } else {
      card.appendChild(makeFallback(item.name));
    }
    const name = document.createElement('div');
    name.className = 'lib-name';
    name.textContent = item.name || hostOf(item.url);
    name.title = name.textContent;
    card.appendChild(name);

    if (settings.dev) {
      const del = document.createElement('button');
      del.className = 'lib-del';
      del.textContent = '\u00d7';
      del.title = 'Delete';
      del.onclick = e => {
        e.stopPropagation();
        library[libCategory] = library[libCategory].filter(x => x.id !== item.id);
        save(LIB_KEY, library);
        renderLibrary();
        renderHome();
        toast('Deleted');
      };
      card.appendChild(del);
    }
    card.onclick = () => openProxyTab(item.url);
    grid.appendChild(card);
  });

  if (settings.dev) {
    const add = document.createElement('button');
    add.className = 'lib-add';
    add.innerHTML = '<span class="plus">+</span><span>Add ' + CATS[libCategory].toLowerCase() + '</span>';
    add.onclick = () => openAddDialog();
    grid.appendChild(add);
  }
}

function makeFallback(name) {
  const f = document.createElement('div');
  f.className = 'lib-cover-fallback';
  f.textContent = firstLetter(name);
  return f;
}

/* ---------- recent row on home ---------- */
function renderHome() {
  const wrap = $('#recentWrap'), row = $('#recentRow');
  const all = [...library.games, ...library.apps, ...library.movies]
    .sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 6);
  wrap.hidden = all.length === 0;
  row.innerHTML = '';
  all.forEach(it => {
    const chip = document.createElement('button');
    chip.className = 'recent-chip';
    chip.title = it.name || it.url;
    const tile = document.createElement('span');
    tile.className = 'recent-tile';
    tile.textContent = firstLetter(it.name || hostOf(it.url));
    const label = document.createElement('span');
    label.className = 'recent-label';
    label.textContent = it.name || hostOf(it.url);
    chip.append(tile, label);
    chip.onclick = () => openProxyTab(it.url);
    row.appendChild(chip);
  });
}

/* ---------- add dialog (dev mode) ---------- */
let addCoverData = null; // dataURL from upload

function openAddDialog() {
  $('#addCatLabel').textContent = CATS[libCategory];
  $('#addItemName').value = '';
  $('#addItemUrl').value = '';
  $('#addItemCoverUrl').value = '';
  addCoverData = null;
  $('#addDlg').showModal();
}

function guessName(u) {
  const h = hostOf(u);
  if (!h) return '';
  return h.split('.')[0].replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/* ---------- settings ---------- */
function openSettings() {
  $('#wispInput').value = settings.wisp || WISP_URL || '';
  $('#devToggle').checked = !!settings.dev;
  $('#forgetKeyBtn').checked = false;
  $('#settingsDlg').showModal();
}

/* ---------- wiring ---------- */
window.addEventListener('DOMContentLoaded', async () => {
  // cloak first — nothing runs until unlocked
  const ok = await gate();
  if (!ok) return;

  $('#app').hidden = false;

  // home tab always exists and cannot be closed
  tabs = [{ id: nextId++, kind: 'home' }];

  // v2 fix: wait for the service worker + transport BEFORE restoring tabs
  await bootProxy();

  const prev = load(TABS_KEY, []);
  (prev || []).forEach(p => { if (p && p.url) openProxyTab(p.url); });
  goHome();

  tickClock();
  setInterval(tickClock, 1000);
  renderHome();

  // search
  $('#searchForm').addEventListener('submit', e => {
    e.preventDefault();
    goSearch($('#searchInput').value);
    $('#searchInput').value = '';
  });
  $('#engineSel').value = settings.engine || 'ddg';
  $('#engineSel').addEventListener('change', e => {
    settings.engine = e.target.value;
    save(SET_KEY, settings);
  });

  // shortcuts
  $$('.shortcut').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.lib) showLibrary(btn.dataset.lib);
      else if (btn.dataset.url) openProxyTab(btn.dataset.url);
    });
  });

  // library back
  $('#libBack').addEventListener('click', () => {
    $('#view-library').hidden = true;
    $('#view-home').hidden = false;
    renderTabs();
  });

  // settings
  $('#settingsBtn').addEventListener('click', openSettings);
  $('#settingsCancel').addEventListener('click', () => $('#settingsDlg').close());
  $('#settingsSave').addEventListener('click', () => {
    settings.wisp = normWisp($('#wispInput').value) || null;
    settings.dev = $('#devToggle').checked;
    save(SET_KEY, settings);
    if ($('#forgetKeyBtn').checked) localStorage.removeItem(KEY_KEY);
    $('#settingsDlg').close();
    renderLibrary();
    renderHome();
    bootProxy().then(() => toast('Saved — reload the page (Ctrl+Shift+R) to reconnect'));
  });

  // tab controls
  $('#newTabBtn').addEventListener('click', goHome);
  $('#reloadTabBtn').addEventListener('click', () => {
    const t = tabs.find(x => x.id === activeTabId);
    if (!t || t.kind !== 'proxy') { toast('Open a site first'); return; }
    const w = wrapOf(t.id);
    const frame = w && w.querySelector('iframe');
    if (!frame) return;
    try { frame.contentWindow.location.reload(); }
    catch { const src = frame.src; frame.src = 'about:blank'; setTimeout(() => { frame.src = src; }, 50); }
  });
  $('#fsTabBtn').addEventListener('click', () => {
    const t = tabs.find(x => x.id === activeTabId);
    if (!t || t.kind !== 'proxy') { toast('Open a site first'); return; }
    const w = wrapOf(t.id);
    if (w && w.requestFullscreen) {
      w.requestFullscreen().catch(() => toast('Fullscreen was blocked'));
    }
  });

  // add dialog
  $('#addCancel').addEventListener('click', () => $('#addDlg').close());
  $('#addItemCoverFile').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => { addCoverData = r.result; toast('Cover image attached'); };
    r.readAsDataURL(file);
  });
  $('#addSave').addEventListener('click', () => {
    const url = $('#addItemUrl').value.trim();
    if (!/^https?:\/\//i.test(url)) { toast('The link needs to start with https://'); return; }
    const name = $('#addItemName').value.trim() || guessName(url);
    const cover = addCoverData || $('#addItemCoverUrl').value.trim() || null;
    library[libCategory].push({ id: Date.now(), name, url, cover, created: Date.now() });
    save(LIB_KEY, library);
    $('#addDlg').close();
    renderLibrary();
    renderHome();
    toast('Added to ' + CATS[libCategory]);
  });

  // helper searches open proxied tabs so results are usable inside the app
  $('#findGameBtn').addEventListener('click', () => {
    const q = $('#addItemName').value.trim() || $('#addItemUrl').value.trim();
    if (!q) { toast('Type a name first'); return; }
    openProxyTab(ENGINES.ddg(q + ' play online'));
  });
  $('#findCoverBtn').addEventListener('click', () => {
    const q = $('#addItemName').value.trim() || guessName($('#addItemUrl').value.trim());
    if (!q) { toast('Type a name first'); return; }
    openProxyTab('https://duckduckgo.com/?q=' + encodeURIComponent(q + ' cover art') + '&iax=images&ia=images');
  });

  // library backup
  $('#exportLibBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ultra-library.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#importLibBtn').addEventListener('click', () => $('#importLibFile').click());
  $('#importLibFile').addEventListener('change', e => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        let added = 0;
        ['games', 'apps', 'movies'].forEach(c => {
          const inc = Array.isArray(data[c]) ? data[c] : [];
          const ids = new Set(library[c].map(x => x.id));
          inc.forEach(x => {
            if (x && x.url && !ids.has(x.id)) { library[c].push(x); added++; }
          });
        });
        save(LIB_KEY, library);
        renderLibrary();
        renderHome();
        toast(added ? 'Imported ' + added + ' item(s)' : 'Nothing new to import');
      } catch { toast('That file is not a valid library backup'); }
    };
    r.readAsText(f);
    e.target.value = '';
  });
});
