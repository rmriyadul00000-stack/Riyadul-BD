/* ============================================================
   Admin shell: sidebar, top bar, preview banner, theme, search palette.
   Pure chrome — it knows nothing about orders or products. admin.js
   hands it the navigation, a `go` function and a `search` function.
   ============================================================ */

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

let O = null;
let counts = {};
let current = 'dash';

export function initShell(opts) {
  O = opts;
  renderSide();
  renderTop();
  renderModeBar();
  wirePalette();
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) || e.target.isContentEditable;
    if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) { e.preventDefault(); openPalette(); }
  });
}

/* ---------- sidebar ---------- */
function renderSide() {
  const { groups, svg, esc, admin, mode } = O;
  const who = mode === 'live' ? (admin.name || admin.email || 'Admin') : 'Preview';
  const sub = mode === 'live' ? (admin.email || '') : 'Sample data';
  $('#side').innerHTML = `
    <div class="mark">${svg('leaf')}<span><b>Riyadul BD</b><small>ADMIN</small></span></div>
    <div class="side-nav">
    ${groups.map(g => `<div class="group-label">${g.label}</div>${g.items.map(([k, label, icon]) =>
      `<button data-nav="${k}" class="${k === current ? 'on' : ''}">${svg(icon)}<span class="lbl">${label}</span>${counts[k] ? `<span class="count">${counts[k]}</span>` : ''}</button>`).join('')}`).join('')}
    </div>
    <div class="side-user">
      <span class="avatar">${esc(String(who).trim()[0] || 'A').toUpperCase()}</span>
      <span class="who"><b>${esc(who)}</b><small>${esc(sub)}</small></span>
      <button data-nav="signout" class="icon-btn" title="Sign out" aria-label="Sign out">${svg('out')}</button>
    </div>`;
  $('#side').onclick = e => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    if (b.dataset.nav === 'signout') return O.signOut();
    O.go(b.dataset.nav);
  };
  $('#side-scrim').onclick = () => document.body.classList.remove('side-open');
}

/* ---------- top bar ---------- */
function renderTop() {
  const { svg, mode } = O;
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  $('#topbar').innerHTML = `
    <button class="icon-btn only-mobile" id="tb-menu" aria-label="Open menu">${svg('menu')}</button>
    <div class="crumb"><span>Admin</span><b id="tb-title"></b></div>
    <button class="tb-search" id="tb-search">${svg('search')}<span>Search orders, customers, products…</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd></button>
    <div class="tb-actions">
      <span class="mode-pill ${mode === 'live' ? 'live' : 'preview'}" title="${mode === 'live' ? 'Connected to the database' : 'Sample data in this browser'}">${mode === 'live' ? 'Live' : 'Preview'}</span>
      <button class="icon-btn" id="tb-refresh" title="Reload this page’s data" aria-label="Reload data">${svg('refresh')}</button>
      <button class="icon-btn" id="tb-theme" title="Switch light / dark" aria-label="Switch theme"></button>
      <a class="btn ghost sm hide-mobile" href="/index.html" target="_blank" rel="noopener">View store ${svg('ext')}</a>
    </div>`;
  $('#tb-menu').onclick = () => document.body.classList.add('side-open');
  $('#tb-search').onclick = openPalette;
  $('#tb-refresh').onclick = () => O.go(current);
  const paintTheme = () => { $('#tb-theme').innerHTML = svg(theme() === 'light' ? 'moon' : 'sun'); };
  $('#tb-theme').onclick = () => {
    const next = theme() === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rb.admin.theme', next); } catch {}
    paintTheme();
    window.dispatchEvent(new Event('rb-theme'));
  };
  paintTheme();
}
const theme = () => document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';

function renderModeBar() {
  const bar = $('#modebar');
  if (O.mode === 'live') return;
  bar.classList.remove('hide');
  bar.innerHTML = `
    <span><b>Preview.</b> ${O.mode === 'offline'
      ? 'The database is paused or unreachable. You are looking at sample data kept in this browser — nothing here is real and nothing is saved to the shop.'
      : 'No database is connected. You are looking at sample data kept in this browser.'}</span>
    <span class="modebar-actions">
      ${O.mode === 'offline' ? '<button class="link-btn" id="mb-retry">Check database again</button>' : ''}
      <button class="link-btn" id="mb-reset">Reset sample data</button>
    </span>`;
  const retry = $('#mb-retry'); if (retry) retry.onclick = O.retryBackend;
  $('#mb-reset').onclick = () => { if (confirm('Reset the sample data in this browser?')) O.resetPreview(); };
}

export function setShellView(key) {
  current = key;
  $$('#side [data-nav]').forEach(x => x.classList.toggle('on', x.dataset.nav === key));
  const t = $('#tb-title'); if (t && O) t.textContent = O.labels[key] || '';
  document.title = (O && O.labels[key] ? O.labels[key] + ' · ' : '') + 'Riyadul BD Admin';
  document.body.classList.remove('side-open');
}

export function setShellCounts(next) {
  counts = { ...counts, ...next };
  $$('#side [data-nav]').forEach(b => {
    const n = counts[b.dataset.nav];
    let tag = b.querySelector('.count');
    if (!n) { if (tag) tag.remove(); return; }
    if (!tag) { tag = document.createElement('span'); tag.className = 'count'; b.appendChild(tag); }
    tag.textContent = n > 99 ? '99+' : n;
  });
}

/* ---------- search palette ---------- */
let results = [], at = 0, seq = 0;

function openPalette() {
  $('#palette').classList.add('on');
  const q = $('#palette-q'); q.value = ''; q.focus();
  runSearch('');
}
function closePalette() { $('#palette').classList.remove('on'); }

async function runSearch(q) {
  const mine = ++seq;
  let found = [];
  try { found = await O.search(q); } catch { found = []; }
  if (mine !== seq) return;
  results = found; at = 0; paintResults();
}

function paintResults() {
  const list = $('#palette-list');
  if (!results.length) { list.innerHTML = '<div class="palette-empty">Nothing matches.</div>'; return; }
  let group = null;
  list.innerHTML = results.map((r, i) => {
    const head = r.group !== group ? `<div class="palette-group">${O.esc(r.group)}</div>` : '';
    group = r.group;
    return `${head}<button class="palette-item ${i === at ? 'on' : ''}" data-i="${i}"><b>${O.esc(r.title)}</b>${r.sub ? `<small>${O.esc(r.sub)}</small>` : ''}</button>`;
  }).join('');
  const on = list.querySelector('.palette-item.on'); if (on) on.scrollIntoView({ block: 'nearest' });
}

function pick(i) {
  const r = results[i]; if (!r) return;
  closePalette(); r.run();
}

function wirePalette() {
  const box = $('#palette'), q = $('#palette-q');
  let timer;
  q.oninput = () => { clearTimeout(timer); timer = setTimeout(() => runSearch(q.value), 90); };
  q.onkeydown = e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); at = Math.min(results.length - 1, at + 1); paintResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); at = Math.max(0, at - 1); paintResults(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(at); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePalette(); }
  };
  box.onclick = e => {
    if (e.target === box) return closePalette();
    const b = e.target.closest('[data-i]'); if (b) pick(Number(b.dataset.i));
  };
}
