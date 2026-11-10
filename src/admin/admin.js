/* ============================================================
   Riyadul BD — admin panel
   Access is decided by Supabase: the account must sign in and have a
   row in the `admins` table. Nothing about who is an admin lives in
   this file.

   When the database is paused or not connected the panel opens in
   PREVIEW: sample data kept in this browser, behind a placeholder
   passcode, so the screens can be reviewed. Nothing in preview is real
   and nothing is sent anywhere.
   ============================================================ */

import { RB_DB, rbUnitCost, rbPromoState, rbEffPrice, rbResolveForShop } from '../lib/db';
import { loadBiz, analyze } from './biz';
import { esc, money, moneyD, when, whenFull } from './format';

const DEMO_PASS = 'riyadul2026';   // preview passcode; also used to confirm logo changes in preview
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const slugify = s => String(s).toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);

import { ICON } from './icons';

const svg = n => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n] || ''}</svg>`;

const ORDER_STEPS = ['pending', 'confirmed', 'shipped', 'delivered'];
const STATUSES = [...ORDER_STEPS, 'cancelled'];

/* ===================== SMALL SHARED UTILITIES (v2) ===================== */
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/* effective discount % for a product: an explicit override wins, else it's
   worked out from the lowest-priced variant's Was vs Price */
function effectiveDiscount(p) {
  if (p.discount_pct != null && p.discount_pct !== '') return Number(p.discount_pct);
  const vs = (p.variants || []).filter(v => v.mrp && v.price && v.mrp > v.price);
  if (!vs.length) return null;
  const v = vs.reduce((a, b) => (a.price < b.price ? a : b));
  return Math.round((v.mrp - v.price) / v.mrp * 100);
}

/* tiny CSV export, no dependency */
function toCSV(rows, headers) {
  const esc2 = v => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [headers.map(h => esc2(h.label)).join(','), ...rows.map(r => headers.map(h => esc2(h.get(r))).join(','))].join('\n');
}
function downloadFile(name, text, mime) {
  const blob = new Blob([text], { type: mime || 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/* inline SVG line/area chart — no charting library, keeps the panel fully
   self-contained. `points` is an array of numbers; `labels` align 1:1. */
function lineChart(points, labels, opts) {
  opts = opts || {};
  const w = opts.w || 640, h = opts.h || 180, pad = 26;
  const max = Math.max(1, ...points), min = 0;
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const y = v => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 1.6);
  const pts = points.map((v, i) => [pad + i * stepX, y(v)]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ` L${pts[pts.length - 1][0].toFixed(1)} ${h - pad} L${pts[0][0].toFixed(1)} ${h - pad} Z`;
  const gridN = 4;
  const grid = Array.from({ length: gridN + 1 }, (_, i) => {
    const gy = pad * 0.4 + (h - pad * 1.6) * (i / gridN);
    return `<line class="grid-line" x1="${pad}" x2="${w - pad}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
  }).join('');
  const showEvery = Math.max(1, Math.ceil(labels.length / (opts.maxLabels || 7)));
  const labelsSvg = labels.map((l, i) => i % showEvery ? '' :
    `<text class="axis-label" x="${pts[i][0].toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(l)}</text>`).join('');
  const dots = pts.map((p, i) => `<circle class="dot" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3" data-i="${i}"/>`).join('');
  return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Trend chart">
    <defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--a-leaf-2)" stop-opacity=".35"/><stop offset="100%" stop-color="var(--a-leaf-2)" stop-opacity="0"/>
    </linearGradient></defs>
    ${grid}<path class="area" d="${area}"/><path class="line" d="${line}"/>${dots}${labelsSvg}
  </svg>`;
}

function toast(msg, bad) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3400);
}

/* ---------- modal ---------- */
const modal = {
  open(title, bodyHtml, footHtml) {
    $('#modal-title').textContent = title;
    $('#modal-body').onclick = null;
    $('#modal-body').innerHTML = bodyHtml;
    $('#modal-foot').innerHTML = footHtml || '';
    $('#modal').classList.add('on'); $('#scrim').classList.add('on');
  },
  close() { $('#modal').classList.remove('on'); $('#scrim').classList.remove('on'); }
};
function confirmDelete(what, onYes) {
  modal.open('Delete ' + what, `<p>This removes <b>${esc(what)}</b> for good. There is no undo.</p>`,
    `<button class="btn ghost" id="cd-no">Keep it</button><button class="btn red" id="cd-yes">Delete</button>`);
  $('#cd-no').onclick = () => modal.close();
  $('#cd-yes').onclick = async () => { await onYes(); modal.close(); };
}

/* ---------- progress line ---------- */
function progressLine(status) {
  if (status === 'cancelled') return `<div class="progress cancelled"><span class="pstep done">Cancelled</span></div>`;
  const at = Math.max(0, ORDER_STEPS.indexOf(status));
  return `<div class="progress">${ORDER_STEPS.map((s, i) =>
    `<span class="pstep ${i < at ? 'done' : i === at ? 'now' : ''}">${s[0].toUpperCase() + s.slice(1)}</span>`).join('')}</div>`;
}

/* ===================== BRIDGE TO THE REACT SHELL =====================
   The screens below are the original DOM-based admin views. The React shell
   (sidebar, top bar, sign-in, dashboard, routing) hosts them: it renders the
   #view container and the modal markup, calls mountView(), and passes in a
   navigate function. Screens are being ported to React one by one. */
let navigate = () => {};
export function setLegacyNavigate(fn) { navigate = fn; }
const go = (key, arg) => navigate(key, arg);

let domReady = false;
export function initLegacyDom() {
  if (domReady) return;
  domReady = true;
  $('#modal-x').onclick = () => modal.close();
  $('#scrim').onclick = () => modal.close();
  document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.close(); });
}

export function mountView(key, arg) {
  if (window.RB_POLL_TIMER) { clearInterval(window.RB_POLL_TIMER); window.RB_POLL_TIMER = null; }
  window.RB_CURRENT_VIEW = key;
  const view = $('#view');
  view.onclick = null; view.onchange = null; view.oninput = null; view.onkeydown = null;
  return views[key](arg);
}
export function unmountView() {
  if (window.RB_POLL_TIMER) { clearInterval(window.RB_POLL_TIMER); window.RB_POLL_TIMER = null; }
  window.RB_CURRENT_VIEW = null;
  modal.close();
}
export const legacyKeys = () => Object.keys(views);

/* ===================== VIEWS ===================== */
const views = {};

/* ---------- products ---------- */
views.products = async function () {
  const view = $('#view');
  view.innerHTML = `<div class="bar"><div><h1>Products</h1><p>Loading…</p></div></div>`;
  const [pr, cr] = await Promise.all([RB_DB.products(true), RB_DB.categories(true)]);
  let products = pr.data || [];
  const cats = cr.data || [];
  let q = '', filterCat = '', quick = '';
  let sortKey = null, sortDir = 1;
  const selected = new Set();

  view.innerHTML = `
    <div class="bar">
      <div><h1>Products</h1><p>Add what came in, hide what ran out, keep the stock numbers honest.</p></div>
      <button class="btn" id="new-product">Add product</button>
    </div>
    <div class="toolbar" style="justify-content:space-between">
      <div class="chips" id="p-quick">
        <button class="chip ${quick === '' ? 'on' : ''}" data-q="">All</button>
        <button class="chip ${quick === 'live' ? 'on' : ''}" data-q="live">Live</button>
        <button class="chip ${quick === 'hidden' ? 'on' : ''}" data-q="hidden">Hidden</button>
        <button class="chip warn ${quick === 'low' ? 'on' : ''}" data-q="low">Low stock</button>
        <button class="chip bad ${quick === 'out' ? 'on' : ''}" data-q="out">Out of stock</button>
        <button class="chip ${quick === 'featured' ? 'on' : ''}" data-q="featured">Featured</button>
        <button class="chip ${quick === 'hotdeal' ? 'on' : ''}" data-q="hotdeal">Hot Deals</button>
      </div>
      <select id="p-cat"><option value="">All aisles</option>${cats.map(c => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>
    </div>
    <div class="toolbar"><input type="search" id="p-q" placeholder="Search by name, SKU or farm"></div>
    <div class="bulkbar" id="p-bulkbar">
      <b id="p-sel-n">0 selected</b>
      <button class="btn ghost sm" id="p-bulk-show">Show</button>
      <button class="btn ghost sm" id="p-bulk-hide">Hide</button>
      <select id="p-bulk-cat"><option value="">Move to aisle…</option>${cats.map(c => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>
      <button class="btn ghost sm" id="p-bulk-cat-apply">Apply</button>
      <button class="btn red sm" id="p-bulk-del">Delete</button>
      <div class="spacer"></div>
      <button class="btn ghost sm" id="p-bulk-clear">Clear selection</button>
    </div>
    <div class="tablewrap"><table>
      <thead><tr>
        <th class="chkcol"><input type="checkbox" class="headchk" id="p-checkall"></th>
        <th></th>
        <th>SKU</th>
        <th class="sortable" data-k="name">Product <span class="arrow">↕</span></th>
        <th>Aisle</th><th>From</th>
        <th class="sortable" data-k="price">Price <span class="arrow">↕</span></th>
        <th class="sortable" data-k="stock">Stock <span class="arrow">↕</span></th>
        <th>Status</th><th></th></tr></thead>
      <tbody id="p-rows"></tbody>
    </table></div>`;

  const stockOf = p => (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
  const priceOf = p => Math.min(...(p.variants || [{ price: 0 }]).map(v => v.price));

  function updateBulkBar() {
    $('#p-bulkbar').classList.toggle('on', selected.size > 0);
    $('#p-sel-n').textContent = selected.size + ' selected';
  }

  function paint() {
    let list = products.filter(p => {
      const s = q.toLowerCase();
      if (filterCat && p.cat !== filterCat) return false;
      if (quick === 'live' && p.active === false) return false;
      if (quick === 'hidden' && p.active !== false) return false;
      if (quick === 'low' && !(stockOf(p) > 0 && stockOf(p) <= 5)) return false;
      if (quick === 'out' && stockOf(p) !== 0) return false;
      if (quick === 'featured' && !p.featured) return false;
      if (quick === 'hotdeal' && !p.hot_deal) return false;
      return !s || p.name.toLowerCase().includes(s) || (p.farm || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s);
    });
    if (sortKey) {
      list.sort((a, b) => {
        const av = sortKey === 'price' ? priceOf(a) : sortKey === 'stock' ? stockOf(a) : a.name.toLowerCase();
        const bv = sortKey === 'price' ? priceOf(b) : sortKey === 'stock' ? stockOf(b) : b.name.toLowerCase();
        return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir;
      });
    }
    $('#p-rows').innerHTML = list.length ? list.map(p => `
      <tr>
        <td class="chkcol"><input type="checkbox" class="rowchk" data-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''}></td>
        <td><img class="thumb" src="${(p.images || [])[0] || ''}" alt=""></td>
        <td><span class="pill">${esc(p.sku || '—')}</span></td>
        <td><a href="#" class="item-link" data-item="${p.id}"><b>${esc(p.name)}</b></a><br><small style="color:var(--a-mute)">${esc(p.name_bn || '')}</small>
          ${p.featured ? ' <span class="pill confirmed">Featured</span>' : ''}${p.hot_deal ? ' <span class="pill pending">Hot deal</span>' : ''} ${promoBadge(p)}</td>
        <td>${esc((cats.find(c => c.slug === p.cat) || {}).name || p.cat)}</td>
        <td>${esc(p.origin || '—')}</td>
        <td>${money(minEffPrice(p))}${effectiveDiscount(p) ? ` <span class="pill cancelled">-${effectiveDiscount(p)}%</span>` : ''}</td>
        <td><span class="pill ${stockOf(p) === 0 ? 'zero' : stockOf(p) <= 5 ? 'low' : ''}">${stockOf(p)}</span></td>
        <td><span class="pill ${p.active === false ? 'off' : ''}">${p.active === false ? 'Hidden' : 'Live'}</span></td>
        <td><div class="rowactions">
          <button class="btn ghost sm" data-edit="${p.id}">Edit</button>
          <button class="btn ghost sm" data-toggle="${p.id}">${p.active === false ? 'Show' : 'Hide'}</button>
          <button class="btn red sm" data-del="${p.id}">Delete</button>
        </div></td>
      </tr>`).join('') : `<tr><td colspan="10"><div class="empty">No products match that.</div></td></tr>`;
    $$('th.sortable').forEach(th => th.classList.toggle('active', th.dataset.k === sortKey));
    updateBulkBar();
  }
  paint();

  $('#p-q').oninput = e => { q = e.target.value.trim(); paint(); };
  $('#p-cat').onchange = e => { filterCat = e.target.value; paint(); };
  $('#p-quick').onclick = e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    quick = b.dataset.q; paint();
  };
  $$('th.sortable').forEach(th => th.onclick = () => {
    if (sortKey === th.dataset.k) sortDir *= -1; else { sortKey = th.dataset.k; sortDir = 1; }
    paint();
  });
  $('#new-product').onclick = () => editProduct(null, cats, reload);

  $('#p-checkall').onchange = e => {
    const rows = $$('.rowchk');
    if (e.target.checked) rows.forEach(r => selected.add(r.dataset.id)); else selected.clear();
    paint();
  };
  $('#p-bulk-clear').onclick = () => { selected.clear(); paint(); };
  $('#p-bulk-show').onclick = () => bulkSetActive(true);
  $('#p-bulk-hide').onclick = () => bulkSetActive(false);
  async function bulkSetActive(active) {
    if (!selected.size) return;
    await Promise.all([...selected].map(id => {
      const p = products.find(x => x.id === id);
      return RB_DB.saveProduct({ ...p, active });
    }));
    toast(`${selected.size} product(s) ${active ? 'made live' : 'hidden'}.`);
    selected.clear(); await reload();
  }
  $('#p-bulk-cat-apply').onclick = async () => {
    const cat = $('#p-bulk-cat').value;
    if (!cat) return toast('Choose an aisle first.', true);
    if (!selected.size) return;
    await Promise.all([...selected].map(id => {
      const p = products.find(x => x.id === id);
      return RB_DB.saveProduct({ ...p, cat });
    }));
    toast(`${selected.size} product(s) moved.`);
    selected.clear(); await reload();
  };
  $('#p-bulk-del').onclick = () => {
    if (!selected.size) return;
    confirmDelete(`${selected.size} product(s)`, async () => {
      await Promise.all([...selected].map(id => RB_DB.deleteProduct(id)));
      toast('Products deleted.'); selected.clear(); await reload();
    });
  };

  $('#p-rows').onclick = async e => {
    const it = e.target.closest('[data-item]');
    if (it) { e.preventDefault(); return openItem(it.dataset.item, { onChange: reload }); }
    const ed = e.target.closest('[data-edit]'), tg = e.target.closest('[data-toggle]'), dl = e.target.closest('[data-del]');
    if (ed) editProduct(products.find(p => p.id === ed.dataset.edit), cats, reload);
    if (tg) {
      const p = products.find(x => x.id === tg.dataset.toggle);
      const r = await RB_DB.saveProduct({ ...p, active: p.active === false });
      toast(r.ok ? (p.active === false ? 'Product is live.' : 'Product hidden.') : r.error, !r.ok);
      reload();
    }
    if (dl) {
      const p = products.find(x => x.id === dl.dataset.del);
      confirmDelete(p.name, async () => {
        const r = await RB_DB.deleteProduct(p.id);
        toast(r.ok ? 'Product deleted.' : r.error, !r.ok); reload();
      });
    }
  };
  $('#p-rows').addEventListener('change', e => {
    const chk = e.target.closest('.rowchk'); if (!chk) return;
    if (chk.checked) selected.add(chk.dataset.id); else selected.delete(chk.dataset.id);
    updateBulkBar();
  });
  async function reload() { if (window.RB_CURRENT_VIEW !== 'products') return; products = (await RB_DB.products(true)).data || []; paint(); }
};

function editProduct(p, cats, done) {
  const isNew = !p;
  p = p || { name: '', name_bn: '', slug: '', cat: (cats[0] || {}).slug || '', farm: '', origin: '', variants: [{ label: '', price: 0, mrp: 0, stock: 0 }], images: [], certified: false, featured: false, hot_deal: false, hot_deal_sort: 0, discount_pct: null, active: true, description: '', benefits: [], storage_tip: '' };
  let images = (p.images || []).slice();
  let variants = (p.variants || []).map(v => ({ ...v }));

  const rowDiscount = v => (v.mrp && v.price && v.mrp > v.price) ? Math.round((v.mrp - v.price) / v.mrp * 100) : '';
  /* show the promotion as one % if every size already agrees, otherwise start blank rather than guess */
  const promoPcts = variants.filter(v => Number(v.promo_price) > 0).map(v => {
    const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0;
    return base ? Math.round((base - Number(v.promo_price)) / base * 100) : null;
  }).filter(x => x != null);
  const promoPct = promoPcts.length && promoPcts.every(x => x === promoPcts[0]) ? promoPcts[0] : '';
  const vRow = (v, i) => `
    <div class="variant v2" data-i="${i}">
      <input placeholder="500 g / 1 kg / 1 piece" value="${esc(v.label)}" data-f="label">
      <input type="number" min="0" placeholder="Price" value="${v.price || ''}" data-f="price">
      <input type="number" min="0" placeholder="Was" value="${v.mrp || ''}" data-f="mrp">
      <span class="disc"><input type="number" min="0" max="95" placeholder="Auto" value="${rowDiscount(v)}" data-f="disc"></span>
      <input type="number" min="0" placeholder="Stock" value="${v.stock || 0}" data-f="stock">
      <button type="button" data-rm="${i}" aria-label="Remove size">×</button>
    </div>`;

  modal.open(isNew ? 'Add product' : 'Edit product', `
    ${!isNew ? `<p style="margin:-4px 0 12px"><span class="pill">SKU ${esc(p.sku || '—')}</span> <small style="color:var(--a-mute)">assigned automatically, can't be changed</small></p>` : ''}
    <div class="grid2">
      <div class="field"><label for="f-name">Name</label><input id="f-name" value="${esc(p.name)}"></div>
      <div class="field"><label for="f-namebn">Name in Bangla</label><input id="f-namebn" value="${esc(p.name_bn || '')}"></div>
    </div>
    <div class="grid3">
      <div class="field"><label for="f-cat">Aisle</label><select id="f-cat">
        ${cats.map(c => `<option value="${c.slug}" ${c.slug === p.cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></div>
      <div class="field"><label for="f-farm">Farm</label><input id="f-farm" value="${esc(p.farm || '')}"></div>
      <div class="field"><label for="f-origin">Grown in</label><input id="f-origin" value="${esc(p.origin || '')}"></div>
    </div>

    <div class="field"><label>Sizes, stock &amp; pricing</label>
      <div class="vhead v2"><span>Label</span><span>Price</span><span>Was</span><span>Discount</span><span>Stock</span><span></span></div>
      <div class="variants" id="f-variants">${variants.map(vRow).join('')}</div>
      <button class="btn ghost sm" type="button" id="add-variant" style="margin-top:8px">Add another size</button>
      <small class="linked-hint">Price, Was and Discount are linked for each size: set “Was” then type a Discount % to set Price automatically, or type a Price to see the Discount work itself out.</small>
    </div>

    <div class="field"><label>Photos</label>
      <div class="drop" id="drop">Click to choose photos, or paste an image URL below</div>
      <input type="file" id="file" accept="image/*" multiple class="hide">
      <div style="display:flex;gap:8px;margin-top:8px">
        <input id="img-url" placeholder="https://…" style="flex:1;padding:9px 11px;border:1.5px solid var(--a-line);border-radius:8px">
        <button class="btn ghost sm" type="button" id="add-url">Add</button>
      </div>
      <div class="imgs" id="f-images"></div>
    </div>

    <div class="field"><label for="f-desc">Description</label><textarea id="f-desc">${esc(p.description || '')}</textarea></div>
    <div class="field"><label for="f-benefits">Selling points</label>
      <textarea id="f-benefits" placeholder="One per line">${esc((p.benefits || []).join('\n'))}</textarea></div>
    <div class="field"><label for="f-storage">Storage advice</label><input id="f-storage" value="${esc(p.storage_tip || '')}"></div>

    <label class="check"><input type="checkbox" id="f-certified" ${p.certified ? 'checked' : ''}> Certified organic</label>
    <label class="check"><input type="checkbox" id="f-featured" ${p.featured ? 'checked' : ''}> Show on the home page</label>
    <label class="check"><input type="checkbox" id="f-active" ${p.active !== false ? 'checked' : ''}> Visible in the shop</label>
    <div class="grid2" style="align-items:end">
      <div class="field"><label for="f-discount">Discount badge % (override)</label>
        <input id="f-discount" type="number" min="0" max="95" placeholder="Auto from Was/Price" value="${p.discount_pct ? p.discount_pct : ''}"></div>
      <small style="padding-bottom:10px">Only overrides the badge shown on the shop. Leave blank to show whatever the sizes above work out to. It never changes a size's actual Price — use the per-size Discount column for that.</small>
    </div>
    <div id="f-badge-preview"></div>

    <div class="card" style="margin:16px 0;background:var(--a-panel-2)">
      <h3 style="font-size:.95rem;margin-bottom:4px">Scheduled promotion</h3>
      <p class="hint">Optional. While this is running, every size's price is “Was (or Price) minus this %”. The moment the end time passes,
        every size returns to the default Price/Was you set above and the badge resets — nothing to undo by hand. Leave the % empty to remove any promotion.</p>
      <div class="grid3">
        <div class="field"><label for="f-promo-pct">Promotion discount %</label><input id="f-promo-pct" type="number" min="0" max="95" value="${esc(String(promoPct))}" placeholder="e.g. 20"></div>
        <div class="field"><label for="f-promo-start">Starts</label><input id="f-promo-start" type="datetime-local" value="${toLocalInput(p.promo_start)}"></div>
        <div class="field"><label for="f-promo-end">Ends</label><input id="f-promo-end" type="datetime-local" value="${toLocalInput(p.promo_end)}"></div>
      </div>
      <label class="check"><input type="checkbox" id="f-promo-auto" ${p.hot_deal_auto ? 'checked' : ''}> Also remove from Hot Deals automatically when it ends</label>
      <div id="f-promo-status"></div>
    </div>

    <div class="grid2" style="align-items:end;margin-top:6px">
      <label class="check"><input type="checkbox" id="f-hotdeal" ${p.hot_deal ? 'checked' : ''}> Show in Hot Deals</label>
      <div class="field"><label for="f-hotsort">Hot Deals order</label><input id="f-hotsort" type="number" min="0" value="${p.hot_deal_sort || 0}"></div>
    </div>
  `, `<button class="btn ghost" id="pm-cancel">Cancel</button><button class="btn" id="pm-save">${isNew ? 'Add product' : 'Save changes'}</button>`);

  const paintImages = () => {
    $('#f-images').innerHTML = images.map((src, i) =>
      `<figure><img src="${src}" alt=""><button type="button" data-rmimg="${i}" aria-label="Remove photo">×</button></figure>`).join('');
  };
  paintImages();
  $('#f-images').onclick = e => {
    const b = e.target.closest('[data-rmimg]'); if (!b) return;
    images.splice(Number(b.dataset.rmimg), 1); paintImages();
  };
  $('#drop').onclick = () => $('#file').click();
  $('#file').onchange = async e => {
    for (const f of e.target.files) {
      const r = await RB_DB.uploadImage(f, 'product-media');
      if (r.ok) images.push(r.data); else toast(r.error, true);
    }
    paintImages();
  };
  $('#add-url').onclick = () => {
    const u = $('#img-url').value.trim();
    if (u) { images.push(u); $('#img-url').value = ''; paintImages(); }
  };

  const paintVariants = () => { $('#f-variants').innerHTML = variants.map(vRow).join(''); };
  $('#add-variant').onclick = () => { variants.push({ label: '', price: 0, mrp: 0, stock: 0 }); paintVariants(); };
  $('#f-variants').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    if (variants.length === 1) return toast('Keep at least one size.', true);
    variants.splice(Number(b.dataset.rm), 1); paintVariants(); updateBadgePreview();
  };

  /* Price, Was (mrp) and Discount% stay in sync for each size, both ways:
     typing a Discount recomputes Price from Was; typing Price or Was
     recomputes the Discount shown. Nothing is forced without a Was set. */
  $('#f-variants').oninput = e => {
    const row = e.target.closest('.variant'); if (!row) return;
    const i = Number(row.dataset.i), f = e.target.dataset.f;
    const v = variants[i];
    if (f === 'label') { v.label = e.target.value; return; }
    if (f === 'disc') {
      const d = clamp(Number(e.target.value || 0), 0, 95);
      if (v.mrp) {
        v.price = Math.round(v.mrp * (1 - d / 100));
        const priceInput = row.querySelector('[data-f="price"]');
        if (priceInput) priceInput.value = v.price;
      }
    } else {
      v[f] = Number(e.target.value || 0);
      if (f === 'price' || f === 'mrp') {
        const d = rowDiscount(v);
        const discInput = row.querySelector('[data-f="disc"]');
        if (discInput && document.activeElement !== discInput) discInput.value = d;
      }
    }
    updateBadgePreview();
  };

  function updateBadgePreview() {
    const forced = $('#f-discount').value === '' ? null : Number($('#f-discount').value);
    const d = forced != null ? forced : effectiveDiscount({ variants, discount_pct: null });
    $('#f-badge-preview').innerHTML = d
      ? `<span class="badge-preview">🏷 ${d}% OFF ${forced != null ? '(forced)' : '(from sizes above)'}</span>`
      : `<span class="badge-preview off">No badge — set “Was” higher than “Price” on a size, or force a %</span>`;
  }
  $('#f-discount').oninput = updateBadgePreview;
  updateBadgePreview();

  function updatePromoStatus() {
    const pct = $('#f-promo-pct').value, start = $('#f-promo-start').value, end = $('#f-promo-end').value;
    const box = $('#f-promo-status');
    if (!pct) { box.innerHTML = '<p class="hint">No promotion set.</p>'; return; }
    if (end && new Date(end) <= (start ? new Date(start) : new Date())) {
      box.innerHTML = '<p class="hint neg">The end time has to be after the start time.</p>'; return;
    }
    const preview = { promo_start: fromLocalInput(start), promo_end: fromLocalInput(end), variants: [{ promo_price: 1 }] };
    const st = rbPromoState(preview);
    const text = st === 'scheduled' ? `Starts ${when(preview.promo_start)}` : st === 'expired' ? 'This window has already passed — pick a later end time.'
      : end ? `Running now — ends ${whenFull(preview.promo_end)}` : 'Running now — no end time, so it stays on until you clear it.';
    box.innerHTML = `<p class="hint ${st === 'expired' ? 'neg' : ''}">${text}</p>`;
  }
  ['#f-promo-pct', '#f-promo-start', '#f-promo-end'].forEach(sel => { $(sel).oninput = updatePromoStatus; });
  updatePromoStatus();

  $('#pm-cancel').onclick = () => modal.close();
  $('#pm-save').onclick = async () => {
    const name = $('#f-name').value.trim();
    if (!name) return toast('Give the product a name.', true);
    variants = variants.filter(v => v.label.trim());
    if (!variants.length) return toast('Add at least one size with a label.', true);

    const promoPctVal = $('#f-promo-pct').value === '' ? null : clamp(Number($('#f-promo-pct').value), 0, 95);
    const promoStartVal = fromLocalInput($('#f-promo-start').value);
    const promoEndVal = fromLocalInput($('#f-promo-end').value);
    if (promoEndVal && promoStartVal && new Date(promoEndVal) <= new Date(promoStartVal)) return toast('The promotion end has to be after the start.', true);
    const variantsOut = promoPctVal == null
      ? variants.map(v => { const c = { ...v }; delete c.promo_price; return c; })
      : variants.map(v => { const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0; return { ...v, promo_price: Math.round(base * (1 - promoPctVal / 100)) }; });

    const payload = {
      ...p, name,
      name_bn: $('#f-namebn').value.trim(),
      slug: p.slug || slugify(name),
      cat: $('#f-cat').value,
      farm: $('#f-farm').value.trim(),
      origin: $('#f-origin').value.trim(),
      variants: variantsOut, images,
      description: $('#f-desc').value.trim(),
      benefits: $('#f-benefits').value.split('\n').map(s => s.trim()).filter(Boolean),
      storage_tip: $('#f-storage').value.trim(),
      certified: $('#f-certified').checked,
      featured: $('#f-featured').checked,
      hot_deal: $('#f-hotdeal').checked,
      hot_deal_sort: Number($('#f-hotsort').value || 0),
      discount_pct: $('#f-discount').value === '' ? null : Number($('#f-discount').value),
      promo_start: promoPctVal == null ? null : promoStartVal,
      promo_end: promoPctVal == null ? null : promoEndVal,
      hot_deal_auto: $('#f-promo-auto').checked,
      active: $('#f-active').checked
    };
    const r = await RB_DB.saveProduct(payload);
    if (!r.ok) return toast(r.error, true);
    toast(isNew ? 'Product added.' : 'Changes saved.');
    modal.close(); done();
  };
}

/* ---------- categories ---------- */
views.categories = async function () {
  const view = $('#view');
  view.innerHTML = `<div class="bar"><div><h1>Categories</h1><p>Loading…</p></div></div>`;
  let cats = (await RB_DB.categories(true)).data || [];
  const products = (await RB_DB.products(true)).data || [];

  view.innerHTML = `
    <div class="bar"><div><h1>Categories</h1>
      <p>Name, icon, image, order and visibility. Saving here changes the shop straight away.</p></div>
      <button class="btn" id="new-cat">Add category</button></div>
    <div class="stats" style="margin-bottom:16px">
      <div class="stat"><span>Aisles</span><b>${cats.length}</b><i>${cats.filter(c => c.active !== false).length} live</i></div>
      <div class="stat"><span>Products catalogued</span><b>${products.length}</b><i>across all aisles</i></div>
      <div class="stat"><span>Empty aisles</span><b>${cats.filter(c => !products.some(p => p.cat === c.slug)).length}</b><i>no products assigned yet</i></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th>Icon</th><th>Name</th><th>Image</th><th>URL</th><th>Order</th><th>Products</th><th>Status</th><th></th></tr></thead>
      <tbody id="c-rows"></tbody></table></div>`;

  function paint() {
    cats.sort((a, b) => (a.sort || 0) - (b.sort || 0));
    $('#c-rows').innerHTML = cats.map(c => `
      <tr>
        <td><span class="cat-icon">${c.icon_svg || ''}</span></td>
        <td><a href="#" class="item-link" data-cat="${esc(c.slug)}"><b>${esc(c.name)}</b></a><br><small style="color:var(--a-mute)">${esc(c.name_bn || '')}</small></td>
        <td>${c.image_url ? `<img class="thumb" src="${c.image_url}" alt="">` : '<small style="color:var(--a-mute)">—</small>'}</td>
        <td><code>/category/${esc(c.slug)}</code></td>
        <td>${c.sort || 0}</td>
        <td>${products.filter(p => p.cat === c.slug).length}</td>
        <td><span class="pill ${c.active === false ? 'off' : ''}">${c.active === false ? 'Hidden' : 'Live'}</span></td>
        <td><div class="rowactions">
          <button class="btn ghost sm" data-cat="${esc(c.slug)}">Performance</button>
          <button class="btn ghost sm" data-edit="${c.id}">Edit</button>
          <button class="btn red sm" data-del="${c.id}">Delete</button></div></td>
      </tr>`).join('');
  }
  paint();

  view.onclick = e => {
    const b = e.target.closest('[data-cat]');
    if (b) { e.preventDefault(); openCategory(b.dataset.cat, { onChange: async () => { if (window.RB_CURRENT_VIEW !== 'categories') return; products.splice(0); products.push(...(await RB_DB.products(true)).data || []); paint(); } }); }
  };

  function edit(c) {
    const isNew = !c;
    c = c || { name: '', name_bn: '', slug: '', icon_svg: '', image_url: '', desktop_banner_url: '', mobile_banner_url: '', sort: cats.length + 1, active: true };
    let image = c.image_url || '';
    let deskBanner = c.desktop_banner_url || '';
    let mobBanner = c.mobile_banner_url || '';

    modal.open(isNew ? 'Add category' : 'Edit category', `
      <div class="grid2">
        <div class="field"><label for="c-name">Name</label><input id="c-name" value="${esc(c.name || '')}"></div>
        <div class="field"><label for="c-bn">Name in Bangla</label><input id="c-bn" value="${esc(c.name_bn || '')}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="c-slug">URL name</label><input id="c-slug" value="${esc(c.slug || '')}" placeholder="leave blank to generate"></div>
        <div class="field"><label for="c-sort">Position</label><input id="c-sort" type="number" value="${c.sort || 0}"></div>
      </div>
      <div class="field"><label for="c-svg">Icon (SVG markup)</label>
        <textarea id="c-svg" spellcheck="false" placeholder="&lt;svg viewBox=&quot;0 0 24 24&quot;&gt;…&lt;/svg&gt;">${esc(c.icon_svg || '')}</textarea>
        <small>Use <code>stroke="currentColor"</code> or <code>fill="currentColor"</code> so the icon picks up the shop colours.</small>
        <div class="svg-preview" id="c-preview">${c.icon_svg || ''}</div>
      </div>
      <div class="field"><label>Category image</label>
        <div class="drop" id="c-drop">Click to upload an image for this aisle</div>
        <input type="file" id="c-file" accept="image/*" class="hide">
        <div style="display:flex;gap:8px;margin-top:8px">
          <input id="c-url" placeholder="https://…" style="flex:1;padding:9px 11px;border:1.5px solid var(--a-line);border-radius:8px">
          <button class="btn ghost sm" type="button" id="c-addurl">Use URL</button>
        </div>
        <div class="imgs" id="c-images"></div>
        <small>Used on the small "shop by category" tile and as a fallback if no banner is set. Leave empty to show the SVG icon there instead.</small>
      </div>
      <div class="field"><label>Homepage category banner</label>
        <small>Shown on the homepage above this category's products. Upload both — the site swaps between them by screen size.</small>
        <div class="banner-pair">
          <div class="banner-slot">
            <h4>Desktop — 1:1 square</h4>
            <div class="banner-preview ${deskBanner ? '' : 'empty'}" id="c-desk-preview">${deskBanner ? `<img src="${deskBanner}" alt="">` : ''}</div>
            <div class="drop" id="c-desk-drop">Click to upload</div>
            <input type="file" id="c-desk-file" accept="image/*" class="hide">
            <div style="display:flex;gap:8px;margin-top:8px">
              <input id="c-desk-url" placeholder="https://…" style="flex:1;padding:8px 10px;border:1.5px solid var(--a-line);border-radius:7px">
              <button class="btn ghost sm" type="button" id="c-desk-addurl">Use URL</button>
            </div>
          </div>
          <div class="banner-slot">
            <h4>Mobile — 16:9 wide</h4>
            <div class="banner-preview wide ${mobBanner ? '' : 'empty'}" id="c-mob-preview">${mobBanner ? `<img src="${mobBanner}" alt="">` : ''}</div>
            <div class="drop" id="c-mob-drop">Click to upload</div>
            <input type="file" id="c-mob-file" accept="image/*" class="hide">
            <div style="display:flex;gap:8px;margin-top:8px">
              <input id="c-mob-url" placeholder="https://…" style="flex:1;padding:8px 10px;border:1.5px solid var(--a-line);border-radius:7px">
              <button class="btn ghost sm" type="button" id="c-mob-addurl">Use URL</button>
            </div>
          </div>
        </div>
      </div>
      <label class="check"><input type="checkbox" id="c-active" ${c.active !== false ? 'checked' : ''}> Visible in the shop</label>`,
      `<button class="btn ghost" id="cm-cancel">Cancel</button><button class="btn" id="cm-save">Save</button>`);

    const paintImg = () => {
      $('#c-images').innerHTML = image
        ? `<figure><img src="${image}" alt=""><button type="button" id="c-rmimg" aria-label="Remove image">×</button></figure>` : '';
      const rm = $('#c-rmimg');
      if (rm) rm.onclick = () => { image = ''; paintImg(); };
    };
    paintImg();

    const paintBanner = (which) => {
      const val = which === 'desk' ? deskBanner : mobBanner;
      const box = $(`#c-${which}-preview`);
      box.classList.toggle('empty', !val);
      box.innerHTML = val ? `<img src="${val}" alt="">` : '';
    };

    $('#c-svg').oninput = e => { $('#c-preview').innerHTML = e.target.value; };
    $('#c-drop').onclick = () => $('#c-file').click();
    $('#c-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const r = await RB_DB.uploadImage(f, 'category-media');
      if (!r.ok) return toast(r.error, true);
      image = r.data; paintImg();
    };
    $('#c-addurl').onclick = () => {
      const u = $('#c-url').value.trim();
      if (u) { image = u; $('#c-url').value = ''; paintImg(); }
    };

    $('#c-desk-drop').onclick = () => $('#c-desk-file').click();
    $('#c-desk-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const r = await RB_DB.uploadImage(f, 'category-media');
      if (!r.ok) return toast(r.error, true);
      deskBanner = r.data; paintBanner('desk');
    };
    $('#c-desk-addurl').onclick = () => {
      const u = $('#c-desk-url').value.trim();
      if (u) { deskBanner = u; $('#c-desk-url').value = ''; paintBanner('desk'); }
    };

    $('#c-mob-drop').onclick = () => $('#c-mob-file').click();
    $('#c-mob-file').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      const r = await RB_DB.uploadImage(f, 'category-media');
      if (!r.ok) return toast(r.error, true);
      mobBanner = r.data; paintBanner('mob');
    };
    $('#c-mob-addurl').onclick = () => {
      const u = $('#c-mob-url').value.trim();
      if (u) { mobBanner = u; $('#c-mob-url').value = ''; paintBanner('mob'); }
    };

    $('#cm-cancel').onclick = () => modal.close();
    $('#cm-save').onclick = async () => {
      const name = $('#c-name').value.trim();
      if (!name) return toast('Give the category a name.', true);
      const r = await RB_DB.saveCategory({
        ...c, name, name_bn: $('#c-bn').value.trim(),
        slug: $('#c-slug').value.trim() || slugify(name),
        sort: Number($('#c-sort').value || 0),
        icon_svg: $('#c-svg').value.trim(),
        image_url: image,
        desktop_banner_url: deskBanner,
        mobile_banner_url: mobBanner,
        active: $('#c-active').checked
      });
      if (!r.ok) return toast(r.error, true);
      toast('Category saved.'); modal.close();
      cats = (await RB_DB.categories(true)).data || []; paint();
    };
  }

  $('#new-cat').onclick = () => edit(null);
  $('#c-rows').onclick = e => {
    const ed = e.target.closest('[data-edit]'), dl = e.target.closest('[data-del]');
    if (ed) edit(cats.find(c => c.id === ed.dataset.edit));
    if (dl) {
      const c = cats.find(x => x.id === dl.dataset.del);
      const count = products.filter(p => p.cat === c.slug).length;
      if (count) return toast(`Move the ${count} product(s) in this aisle first.`, true);
      confirmDelete(c.name, async () => {
        await RB_DB.deleteCategory(c.id);
        cats = (await RB_DB.categories(true)).data || []; paint(); toast('Category deleted.');
      });
    }
  };
};

/* ===================== BUSINESS ENGINE =====================
   Everything money-related is computed here from live data, never stored:
   landed cost per unit, effective (promo-aware) price, margin, realized and
   potential profit per size / item / category, wastage and expenses.
   Change a cost or a price and every screen follows on the next load. */
const COST_FIELDS = [
  ['cost', 'Buying cost', 'Price paid to the farm or supplier'],
  ['cost_transport', 'Transport', 'Getting it to you'],
  ['cost_packaging', 'Packaging', 'Boxes, jars, labels'],
  ['cost_labor', 'Labor', 'Cleaning, sorting, packing time'],
  ['cost_storage', 'Storage', 'Cold room, rent share, electricity'],
  ['cost_other', 'Other', 'Anything else (explain in the note)']
];
const LOG_LABEL = { purchase: 'Stock in', adjustment: 'Adjustment', wastage: 'Wastage', expense: 'Expense', note: 'Note',
  sale: 'Sale', return: 'Return', price_change: 'Price change', cost_change: 'Cost change' };
const LOG_PILL = { purchase: 'confirmed', adjustment: 'shipped', wastage: 'cancelled', expense: 'low', note: 'off',
  sale: 'delivered', return: 'pending', price_change: 'shipped', cost_change: 'shipped' };

const sgn = n => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
const profitTxt = n => `<b class="${sgn(n)}">${n < 0 ? '−' : ''}${moneyD(Math.abs(n))}</b>`;
const pctTxt = n => n == null ? '—' : (Math.round(n * 10) / 10) + '%';
const toLocalInput = iso => {
  if (!iso) return '';
  const d = new Date(iso), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const fromLocalInput = v => v ? new Date(v).toISOString() : null;
function timeLeft(iso) {
  const ms = new Date(iso) - Date.now(), abs = Math.abs(ms);
  const d = Math.floor(abs / 864e5), h = Math.floor(abs % 864e5 / 36e5), m = Math.floor(abs % 36e5 / 6e4);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}
const promoBadge = p => {
  const st = rbPromoState(p);
  if (st === 'none') return '';
  if (st === 'active') return `<span class="pill promo-on" title="Ends ${p.promo_end ? whenFull(p.promo_end) : 'never'}">Promo${p.promo_end ? ' · ' + timeLeft(p.promo_end) + ' left' : ''}</span>`;
  if (st === 'scheduled') return `<span class="pill shipped">Starts in ${timeLeft(p.promo_start)}</span>`;
  return `<span class="pill off">Promo ended</span>`;
};
const minEffPrice = p => Math.min(...((p.variants || []).length ? p.variants.map(v => rbEffPrice(p, v)) : [0]));
const minDefPrice = p => Math.min(...((p.variants || []).length ? p.variants.map(v => Number(v.price) || 0) : [0]));

const upgradeBanner = biz => biz.needsUpgrade ? `
  <div class="notice"><b>One-time database step needed.</b> Run <code>sql/pending/2026-11-10_run_when_supabase_resumes.sql</code> in the Supabase SQL editor to switch on
  cost history, wastage, expenses and real profit tracking. Until then this page shows costs and stock but no history.</div>` : '';


/* ---------- item detail popup: overview, costs, stock + history, notes, performance ---------- */
async function openItem(productId, opts) {
  opts = opts || {};
  const state = { tab: opts.tab || 'overview', biz: null, changed: false };
  modal.open('Loading…', '<div class="empty">Loading item…</div>', '');
  $('#modal').classList.add('xl');

  async function refresh() { state.biz = await loadBiz(); paint(); }
  const foot = `<button class="btn ghost" id="im-edit">Edit product</button><button class="btn" id="im-close">Close</button>`;

  function paint() {
    const biz = state.biz, p = biz.products.find(x => x.id === productId);
    if (!p) { modal.close(); return toast('That product no longer exists.', true); }
    const A = analyze(biz), pa = A.P[p.id] || A.blank();
    const cat = biz.cats.find(c => c.slug === p.cat);
    const logs = biz.logs.filter(l => l.product_id === p.id);
    const TABS = [['overview', 'Overview'], ['costs', 'Costs'], ['stock', 'Stock & history'], ['notes', 'Notes'], ['perf', 'Performance']];

    modal.open(p.name, `
      ${upgradeBanner(biz)}
      <p class="item-sub"><span class="pill">${esc(p.sku || '—')}</span> ${esc(cat ? cat.name : p.cat)} · ${esc(p.farm || '—')}
        ${p.active === false ? '<span class="pill off">Hidden</span>' : '<span class="pill">Live</span>'}
        ${p.hot_deal ? '<span class="pill pending">Hot deal</span>' : ''} ${promoBadge(p)}</p>
      <div class="seg" id="im-tabs" style="margin-bottom:14px">${TABS.map(([k, l]) => `<button data-t="${k}" class="${state.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div id="im-body">${tabHtml(state.tab, p, pa, A, biz, logs)}</div>`, foot);
    $('#modal').classList.add('xl');
    $('#im-close').onclick = () => modal.close();
    $('#im-edit').onclick = () => { obs.disconnect(); modal.close(); $('#modal').classList.remove('xl'); editProduct(p, biz.cats, () => { state.changed = true; if (opts.onChange) opts.onChange(); }); };
    $('#im-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; state.tab = b.dataset.t; paint(); };
    bindTab(state.tab, p, biz, logs);
  }

  function tabHtml(tab, p, pa, A, biz, logs) {
    if (tab === 'overview') {
      const variants = p.variants || [];
      return `
      <div class="kv">
        <div><span>Stock on hand</span><b>${pa.stockUnits} units</b></div>
        <div><span>Stock value (at cost)</span><b>${moneyD(pa.stockCost)}</b></div>
        <div><span>Stock value (at price)</span><b>${moneyD(pa.stockValue)}</b></div>
        <div><span>Potential profit</span>${profitTxt(pa.potential)}</div>
        <div><span>Sold &amp; delivered</span><b>${pa.units} units</b></div>
        <div><span>Revenue</span><b>${moneyD(pa.revenue)}</b></div>
        <div><span>Gross profit</span>${profitTxt(pa.gross)}</div>
        <div><span>Margin</span><b>${pctTxt(pa.margin)}</b></div>
        <div><span>Wastage loss</span><b class="${pa.waste ? 'neg' : ''}">${moneyD(pa.waste)}</b></div>
        <div><span>Expenses</span><b class="${pa.expenses ? 'neg' : ''}">${moneyD(pa.expenses)}</b></div>
        <div><span>Net profit</span>${profitTxt(pa.net)}</div>
        <div><span>Still in transit</span><b>${pa.pUnits} units · ${profitTxt(pa.pGross)}</b></div>
      </div>
      ${pa.estUnits ? `<p class="hint">${pa.estUnits} sold unit(s) come from orders placed before cost tracking, so their cost is estimated from today's cost.</p>` : ''}
      <div class="tablewrap" style="margin-top:12px"><table>
        <thead><tr><th>Size</th><th>Stock</th><th>Unit cost</th><th>Price now</th><th>Profit / unit</th><th>Margin</th><th>Potential</th><th>Sold</th><th>Realized profit</th></tr></thead>
        <tbody>${variants.map(v => {
          const uc = rbUnitCost(v), pr = rbEffPrice(p, v), pu = pr - uc, va = A.V[p.id + '|' + v.label] || A.blank();
          return `<tr>
            <td><b>${esc(v.label)}</b></td><td>${v.stock || 0}</td><td>${moneyD(uc)}</td>
            <td>${moneyD(pr)}${pr !== Number(v.price) ? ` <small class="strike">${moneyD(v.price)}</small>` : ''}</td>
            <td>${profitTxt(pu)}</td><td>${pctTxt(pr ? pu / pr * 100 : null)}</td>
            <td>${profitTxt(pu * (Number(v.stock) || 0))}</td><td>${va.units}</td><td>${profitTxt(va.gross)}</td></tr>`;
        }).join('')}</tbody></table></div>`;
    }

    if (tab === 'costs') {
      return `
      <p class="hint">Enter what one unit of each size costs you, broken down. Landed cost is the sum, and it drives every profit figure and is saved on each order at the time of sale.</p>
      <div id="cost-sizes">${(p.variants || []).map((v, i) => `
        <div class="card cost-card" data-i="${i}">
          <div class="cost-head"><b>${esc(v.label)}</b><span>Selling price <b>${moneyD(rbEffPrice(p, v))}</b></span></div>
          <div class="cost-grid">${COST_FIELDS.map(([k, l, tip]) => `
            <label class="field"><span>${l}</span><input type="number" min="0" step="0.01" data-k="${k}" value="${v[k] || ''}" placeholder="0" title="${esc(tip)}"></label>`).join('')}
          </div>
          <label class="field"><span>Note about these costs</span><input data-k="cost_other_note" value="${esc(v.cost_other_note || '')}" placeholder="e.g. new supplier from March, includes ice packs"></label>
          <div class="cost-sum">Landed cost <b data-sum>${moneyD(rbUnitCost(v))}</b> · Profit / unit <span data-profit></span> · Margin <span data-margin></span></div>
        </div>`).join('')}</div>
      <button class="btn" id="cost-save" style="margin-top:12px">Save costs</button>
      <h3 style="margin:24px 0 6px">One-off expense</h3>
      <p class="hint">Money spent on this item that isn't per unit (a cold-room week, a lab test, a damaged batch write-off). It counts against this item's net profit.</p>
      <div class="inline-form">
        <label class="field"><span>Amount (৳)</span><input type="number" min="0" step="0.01" id="ex-amount"></label>
        <label class="field grow"><span>What was it for?</span><input id="ex-note" placeholder="Reason"></label>
        <button class="btn" id="ex-add">Add expense</button>
      </div>`;
    }

    if (tab === 'stock') {
      const sizeOpts = (p.variants || []).map(v => `<option value="${esc(v.label)}">${esc(v.label)} (${v.stock || 0} in stock)</option>`).join('');
      return `
      <div class="actions-grid">
        <div class="card"><h3>Stock in</h3>
          <div class="inline-form col">
            <label class="field"><span>Size</span><select id="si-size">${sizeOpts}</select></label>
            <label class="field"><span>Quantity received</span><input type="number" min="1" id="si-qty"></label>
            <label class="field"><span>Buying cost per unit (৳)</span><input type="number" min="0" step="0.01" id="si-cost"></label>
            <label class="field"><span>Update buying cost by</span><select id="si-mode">
              <option value="avg">Weighted average with current stock</option><option value="latest">Using this batch's cost</option><option value="keep">Leave cost unchanged</option></select></label>
            <label class="field"><span>Note</span><input id="si-note" placeholder="Supplier, invoice number…"></label>
            <button class="btn" id="si-go">Add stock</button>
          </div></div>
        <div class="card"><h3>Record wastage</h3>
          <div class="inline-form col">
            <label class="field"><span>Size</span><select id="ws-size">${sizeOpts}</select></label>
            <label class="field"><span>Units lost</span><input type="number" min="1" id="ws-qty"></label>
            <label class="field"><span>Reason</span><input id="ws-note" placeholder="Spoiled, damaged, expired…"></label>
            <button class="btn red" id="ws-go">Record loss</button>
            <small>Removes the units from stock and books their landed cost as a loss.</small>
          </div></div>
        <div class="card"><h3>Correct the count</h3>
          <div class="inline-form col">
            <label class="field"><span>Size</span><select id="ad-size">${sizeOpts}</select></label>
            <label class="field"><span>Actual count on the shelf</span><input type="number" min="0" id="ad-qty"></label>
            <label class="field"><span>Reason</span><input id="ad-note" placeholder="Stock take, counting mistake…"></label>
            <button class="btn ghost" id="ad-go">Set stock</button>
          </div></div>
      </div>
      <h3 style="margin:22px 0 8px">History</h3>${historyTable(logs, biz)}`;
    }

    if (tab === 'notes') {
      const notes = logs.filter(l => l.kind === 'note');
      return `
      <div class="inline-form">
        <label class="field grow"><span>Add a note</span><textarea id="nt-text" rows="2" placeholder="Supplier details, quality remarks, seasonal timing, reminders…"></textarea></label>
        <button class="btn" id="nt-add">Save note</button>
      </div>
      <div class="timeline" style="margin-top:16px">${notes.length ? notes.map(n => `
        <div class="tl-item"><div class="tl-meta">${whenFull(n.created_at)}${n.created_by ? ' · ' + esc(n.created_by) : ''}
          <button class="link-btn" data-delnote="${n.id}">delete</button></div><div>${esc(n.note)}</div></div>`).join('') : '<div class="empty">No notes yet.</div>'}</div>`;
    }

    /* performance */
    const months = Object.keys(A.monthly).sort().slice(-6);
    const series = months.map(m => { const x = A.monthly[m].byProd[p.id] || { revenue: 0, cogs: 0 }; return x.revenue - x.cogs; });
    const revSeries = months.map(m => (A.monthly[m].byProd[p.id] || { revenue: 0 }).revenue);
    return `
      <div class="kv">
        <div><span>Units sold (delivered)</span><b>${pa.units}</b></div>
        <div><span>Revenue</span><b>${moneyD(pa.revenue)}</b></div>
        <div><span>Cost of goods</span><b>${moneyD(pa.cogs)}</b></div>
        <div><span>Gross profit</span>${profitTxt(pa.gross)}</div>
      </div>
      ${months.length > 1 ? `
        <div class="card chartcard" style="margin-top:14px"><h3>Gross profit by month</h3><p class="sub">Delivered orders, last ${months.length} months with sales.</p>
          ${lineChart(series, months.map(m => m.slice(2)), { w: 640, h: 170 })}</div>
        <div class="card chartcard" style="margin-top:14px"><h3>Revenue by month</h3>
          ${lineChart(revSeries, months.map(m => m.slice(2)), { w: 640, h: 170 })}</div>`
        : '<div class="empty" style="margin-top:14px">Trends appear once this item has sales in two or more months.</div>'}`;
  }

  function historyTable(logs, biz) {
    if (biz.needsUpgrade) return '<div class="empty">History is switched on by running the file in sql/pending/.</div>';
    if (!logs.length) return '<div class="empty">Nothing recorded yet.</div>';
    return `<div class="tablewrap"><table><thead><tr><th>When</th><th>Type</th><th>Size</th><th>Qty</th><th>Amount</th><th>Note</th></tr></thead><tbody>
      ${logs.slice(0, 200).map(l => `<tr><td>${whenFull(l.created_at)}</td>
        <td><span class="pill ${LOG_PILL[l.kind] || ''}">${LOG_LABEL[l.kind] || l.kind}</span></td>
        <td>${esc(l.variant_label || '—')}</td><td>${l.qty || ''}</td>
        <td>${l.amount ? moneyD(l.amount) : ''}${l.unit_cost != null && l.kind !== 'note' ? `<br><small class="a-mute">@ ${moneyD(l.unit_cost)}</small>` : ''}</td>
        <td>${esc(l.note || '')}${l.created_by ? `<br><small class="a-mute">${esc(l.created_by)}</small>` : ''}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  async function saveVariants(p, variants) {
    const r = await RB_DB.saveProduct({ ...p, variants });
    if (!r.ok) { toast(r.error, true); return false; }
    state.changed = true; return true;
  }
  async function logIt(entry) { const r = await RB_DB.addInventoryLog({ product_id: productId, ...entry }); if (!r.ok && !state.warned) { state.warned = true; toast('Saved, but history could not be written (run the file in sql/pending/).', true); } }

  function bindTab(tab, p, biz, logs) {
    if (tab === 'costs') {
      const recalc = card => {
        const v = p.variants[Number(card.dataset.i)];
        const cost = COST_FIELDS.reduce((s, [k]) => s + (Number(card.querySelector(`[data-k="${k}"]`).value) || 0), 0);
        const price = rbEffPrice(p, v), pu = price - cost;
        card.querySelector('[data-sum]').textContent = moneyD(cost);
        card.querySelector('[data-profit]').innerHTML = profitTxt(pu);
        card.querySelector('[data-margin]').textContent = pctTxt(price ? pu / price * 100 : null);
      };
      $$('.cost-card').forEach(recalc);
      $('#cost-sizes').oninput = e => { const c = e.target.closest('.cost-card'); if (c) recalc(c); };
      $('#cost-save').onclick = async () => {
        const variants = p.variants.map((v, i) => {
          const card = $(`.cost-card[data-i="${i}"]`), nv = { ...v };
          COST_FIELDS.forEach(([k]) => { nv[k] = Number(card.querySelector(`[data-k="${k}"]`).value) || 0; });
          nv.cost_other_note = card.querySelector('[data-k="cost_other_note"]').value.trim();
          return nv;
        });
        if (!(await saveVariants(p, variants))) return;
        for (let i = 0; i < variants.length; i++) {
          const before = rbUnitCost(p.variants[i]), after = rbUnitCost(variants[i]);
          if (before !== after) await logIt({ kind: 'cost_change', variant_label: variants[i].label, unit_cost: after, note: `Landed cost ${moneyD(before)} → ${moneyD(after)}${variants[i].cost_other_note ? ' · ' + variants[i].cost_other_note : ''}` });
        }
        toast('Costs saved.'); await refresh();
      };
      $('#ex-add').onclick = async () => {
        const amount = Number($('#ex-amount').value || 0), note = $('#ex-note').value.trim();
        if (!amount || !note) return toast('Enter an amount and a reason.', true);
        await logIt({ kind: 'expense', amount, note }); toast('Expense recorded.'); await refresh();
      };
    }
    if (tab === 'stock') {
      const findV = label => p.variants.find(v => v.label === label);
      $('#si-go').onclick = async () => {
        const v = findV($('#si-size').value), qty = Math.round(Number($('#si-qty').value || 0)), cost = Number($('#si-cost').value || 0);
        if (!v || qty < 1) return toast('Enter how many units arrived.', true);
        const mode = $('#si-mode').value, oldStock = Number(v.stock) || 0, oldCost = Number(v.cost) || 0;
        let newCost = oldCost;
        if (mode === 'latest') newCost = cost;
        if (mode === 'avg') newCost = oldStock > 0 ? Math.round((oldStock * oldCost + qty * cost) / (oldStock + qty) * 100) / 100 : cost;
        const variants = p.variants.map(x => x === v ? { ...x, stock: oldStock + qty, cost: newCost } : x);
        if (!(await saveVariants(p, variants))) return;
        await logIt({ kind: 'purchase', variant_label: v.label, qty, unit_cost: cost, amount: qty * cost, note: $('#si-note').value.trim() || null });
        toast(`Added ${qty} × ${v.label}.`); await refresh();
      };
      $('#ws-go').onclick = async () => {
        const v = findV($('#ws-size').value), qty = Math.round(Number($('#ws-qty').value || 0));
        if (!v || qty < 1) return toast('Enter how many units were lost.', true);
        const variants = p.variants.map(x => x === v ? { ...x, stock: Math.max(0, (Number(x.stock) || 0) - qty) } : x);
        if (!(await saveVariants(p, variants))) return;
        await logIt({ kind: 'wastage', variant_label: v.label, qty, unit_cost: rbUnitCost(v), amount: qty * rbUnitCost(v), note: $('#ws-note').value.trim() || null });
        toast('Loss recorded.'); await refresh();
      };
      $('#ad-go').onclick = async () => {
        const v = findV($('#ad-size').value), target = Math.round(Number($('#ad-qty').value));
        if (!v || isNaN(target) || target < 0) return toast('Enter the actual count.', true);
        const delta = target - (Number(v.stock) || 0);
        const variants = p.variants.map(x => x === v ? { ...x, stock: target } : x);
        if (!(await saveVariants(p, variants))) return;
        await logIt({ kind: 'adjustment', variant_label: v.label, qty: delta, note: $('#ad-note').value.trim() || `Set to ${target}` });
        toast('Stock corrected.'); await refresh();
      };
    }
    if (tab === 'notes') {
      $('#nt-add').onclick = async () => {
        const text = $('#nt-text').value.trim(); if (!text) return;
        await logIt({ kind: 'note', note: text }); toast('Note saved.'); await refresh();
      };
      $('#im-body').onclick = async e => {
        const d = e.target.closest('[data-delnote]'); if (!d) return;
        await RB_DB.deleteInventoryLog(d.dataset.delnote); await refresh();
      };
    }
  }

  const obs = new MutationObserver(() => {
    if (!$('#modal').classList.contains('on')) { obs.disconnect(); $('#modal').classList.remove('xl'); if (state.changed && opts.onChange) opts.onChange(); }
  });
  obs.observe($('#modal'), { attributes: true, attributeFilter: ['class'] });
  await refresh();
}

/* ---------- category performance popup ---------- */
async function openCategory(slug, opts) {
  opts = opts || {};
  modal.open('Loading…', '<div class="empty">Loading…</div>', '');
  $('#modal').classList.add('xl');
  const biz = await loadBiz(), A = analyze(biz), cat = biz.cats.find(c => c.slug === slug);
  const c = A.C[slug] || A.blank();
  const items = biz.products.filter(p => p.cat === slug).map(p => ({ p, a: A.P[p.id] || A.blank() })).sort((x, y) => y.a.net - x.a.net);
  const months = Object.keys(A.monthly).sort().slice(-6);
  const series = months.map(m => { const x = A.monthly[m].byCat[slug] || { revenue: 0, cogs: 0 }; return x.revenue - x.cogs; });
  modal.open(cat ? cat.name : slug, `
    ${upgradeBanner(biz)}
    <div class="kv">
      <div><span>Products</span><b>${items.length}</b></div>
      <div><span>Units sold</span><b>${c.units}</b></div>
      <div><span>Revenue</span><b>${moneyD(c.revenue)}</b></div>
      <div><span>Gross profit</span>${profitTxt(c.gross)}</div>
      <div><span>Margin</span><b>${pctTxt(c.margin)}</b></div>
      <div><span>Wastage + expenses</span><b class="${c.waste + c.expenses ? 'neg' : ''}">${moneyD(c.waste + c.expenses)}</b></div>
      <div><span>Net profit</span>${profitTxt(c.net)}</div>
      <div><span>Potential from stock</span>${profitTxt(c.potential)}</div>
    </div>
    ${months.length > 1 ? `<div class="card chartcard" style="margin-top:14px"><h3>Gross profit by month</h3>${lineChart(series, months.map(m => m.slice(2)), { w: 640, h: 160 })}</div>` : ''}
    <div class="tablewrap" style="margin-top:14px"><table>
      <thead><tr><th>Item</th><th>Stock</th><th>Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Wastage</th><th></th></tr></thead>
      <tbody>${items.length ? items.map(({ p, a }) => `<tr>
        <td><b>${esc(p.name)}</b><br><small class="a-mute">${esc(p.sku || '')}</small></td><td>${a.stockUnits}</td><td>${a.units}</td>
        <td>${moneyD(a.revenue)}</td><td>${profitTxt(a.net)}</td><td>${pctTxt(a.margin)}</td>
        <td>${a.waste ? `<span class="neg">${moneyD(a.waste)}</span>` : '—'}</td>
        <td><button class="btn ghost sm" data-item="${p.id}">Details</button></td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">No products in this aisle yet.</div></td></tr>'}</tbody></table></div>`,
    `<button class="btn" id="cp-close">Close</button>`);
  $('#modal').classList.add('xl');
  $('#cp-close').onclick = () => modal.close();
  $('#modal-body').onclick = e => { const b = e.target.closest('[data-item]'); if (b) openItem(b.dataset.item, { onChange: opts.onChange }); };
}

/* ---------- hot deals ---------- */
views.hotdeals = async function () {
  const view = $('#view');
  view.innerHTML = `<div class="bar"><div><h1>Hot Deals</h1><p>Loading…</p></div></div>`;
  const [pr, cr, st] = await Promise.all([RB_DB.products(true), RB_DB.categories(true), RB_DB.settings()]);
  let products = pr.data || [];
  const cats = cr.data || [], settings = st.data || {};
  let q = '', cat = '', status = 'all', sortKey = 'manual';
  const selected = new Set();

  const discNow = p => effectiveDiscount(rbResolveForShop(p));
  const endsSoon = p => rbPromoState(p) === 'active' && p.promo_end && (new Date(p.promo_end) - Date.now()) < 48 * 36e5;
  const stockOf = p => (p.variants || []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const listed = () => products.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0));

  view.innerHTML = `
    <div class="bar"><div><h1>Hot Deals</h1>
      <p>Every product is listed below. Add or remove it from the Hot Deals section, schedule a promotion, and set the order.</p></div>
      <div class="bar-actions"><a class="btn ghost sm" href="products.html?hotdeals=1" target="_blank" rel="noopener">View on shop ↗</a></div></div>
    <div class="stats v2" id="hd-stats"></div>
    <div class="card" style="margin-bottom:16px">
      <h3>Section name</h3>
      <div class="inline-form"><label class="field grow" style="margin:0"><input id="hd-title" value="${esc(settings.hotdeals_title || 'Hot Deals')}"></label>
      <button class="btn sm" id="hd-title-save">Save name</button></div>
    </div>
    <div class="toolbar" style="justify-content:space-between">
      <div class="chips" id="hd-chips"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <select id="hd-cat"><option value="">All aisles</option>${cats.map(c => `<option value="${c.slug}">${esc(c.name)}</option>`).join('')}</select>
        <select id="hd-sort">
          <option value="manual">Sort: shop order</option><option value="discount">Biggest discount</option>
          <option value="ending">Promo ending soonest</option><option value="stock">Lowest stock</option><option value="name">Name A–Z</option></select>
      </div>
    </div>
    <div class="toolbar"><input type="search" id="hd-q" placeholder="Search by name, SKU or aisle"></div>
    <div class="bulkbar" id="hd-bulk">
      <b id="hd-sel-n">0 selected</b>
      <button class="btn sm" id="hd-b-add">Add to Hot Deals</button>
      <button class="btn ghost sm" id="hd-b-rm">Remove</button>
      <button class="btn ghost sm" id="hd-b-promo">Schedule promotion…</button>
      <button class="btn ghost sm" id="hd-b-clear">Clear promotion</button>
      <div class="spacer"></div>
      <button class="btn ghost sm" id="hd-b-none">Clear selection</button>
    </div>
    <div class="tablewrap"><table>
      <thead><tr>
        <th class="chkcol"><input type="checkbox" class="headchk" id="hd-all"></th>
        <th>Order</th><th>Product</th><th>Aisle</th><th>Price</th><th>Off</th><th>Promotion</th><th>Stock</th><th>Status</th><th></th></tr></thead>
      <tbody id="hd-rows"></tbody></table></div>`;

  const CHIPS = [['all', 'All'], ['listed', 'Listed'], ['delisted', 'Delisted'], ['promo', 'Promo running'], ['soon', 'Ending soon'], ['ended', 'Promo ended']];

  function visible() {
    const s = q.toLowerCase();
    let list = products.filter(p => {
      if (cat && p.cat !== cat) return false;
      if (status === 'listed' && !p.hot_deal) return false;
      if (status === 'delisted' && p.hot_deal) return false;
      if (status === 'promo' && rbPromoState(p) !== 'active') return false;
      if (status === 'soon' && !endsSoon(p)) return false;
      if (status === 'ended' && rbPromoState(p) !== 'expired') return false;
      return !s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || p.cat.toLowerCase().includes(s) || (p.name_bn || '').includes(q);
    });
    const byName = (a, b) => a.name.localeCompare(b.name);
    if (sortKey === 'manual') list.sort((a, b) => (b.hot_deal ? 1 : 0) - (a.hot_deal ? 1 : 0) || (a.hot_deal ? (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0) : byName(a, b)));
    else if (sortKey === 'discount') list.sort((a, b) => (discNow(b) || 0) - (discNow(a) || 0));
    else if (sortKey === 'ending') list.sort((a, b) => (a.promo_end && rbPromoState(a) === 'active' ? +new Date(a.promo_end) : Infinity) - (b.promo_end && rbPromoState(b) === 'active' ? +new Date(b.promo_end) : Infinity));
    else if (sortKey === 'stock') list.sort((a, b) => stockOf(a) - stockOf(b));
    else list.sort(byName);
    return list;
  }

  function paint() {
    const L = listed();
    const avg = L.length ? Math.round(L.reduce((s, p) => s + (discNow(p) || 0), 0) / L.length) : 0;
    $('#hd-stats').innerHTML = `
      <div class="stat v2"><span>Listed</span><b>${L.length}</b><i>showing in Hot Deals</i></div>
      <div class="stat v2"><span>Delisted</span><b>${products.length - L.length}</b><i>available to add</i></div>
      <div class="stat v2"><span>Promotions running</span><b>${products.filter(p => rbPromoState(p) === 'active').length}</b><i>${products.filter(endsSoon).length} ending within 48h</i></div>
      <div class="stat v2"><span>Average discount</span><b>${avg}%</b><i>across listed items</i></div>
      <div class="stat v2"><span>Listed but sold out</span><b>${L.filter(p => stockOf(p) === 0).length}</b><i>consider removing</i></div>`;
    $('#hd-chips').innerHTML = CHIPS.map(([k, l]) => `<button class="chip ${status === k ? 'on' : ''}" data-s="${k}">${l}</button>`).join('');
    const list = visible(), Lids = L.map(p => p.id);
    $('#hd-rows').innerHTML = list.length ? list.map(p => {
      const li = Lids.indexOf(p.id), d = discNow(p), stock = stockOf(p);
      const now = minEffPrice(p), def = minDefPrice(p);
      return `<tr>
        <td class="chkcol"><input type="checkbox" class="rowchk" data-id="${p.id}" ${selected.has(p.id) ? 'checked' : ''}></td>
        <td>${p.hot_deal ? `<div class="rowactions"><span class="pill">#${li + 1}</span>
          <button class="btn ghost sm" data-up="${p.id}" ${li === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
          <button class="btn ghost sm" data-down="${p.id}" ${li === Lids.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button></div>` : '<small class="a-mute">—</small>'}</td>
        <td>${p.images && p.images[0] ? `<img class="thumb" src="${p.images[0]}" alt="">` : ''} <b>${esc(p.name)}</b> <span class="pill">${esc(p.sku || '—')}</span></td>
        <td>${esc((cats.find(c => c.slug === p.cat) || {}).name || p.cat)}</td>
        <td>${moneyD(now)}${now !== def ? ` <small class="strike">${moneyD(def)}</small>` : ''}</td>
        <td>${d ? `<span class="pill cancelled">-${d}%</span>` : '<small class="a-mute">—</small>'}</td>
        <td>${promoBadge(p) || '<small class="a-mute">none</small>'}${p.promo_end && rbPromoState(p) !== 'none' ? `<br><small class="a-mute">${when(p.promo_start) !== '—' && p.promo_start ? when(p.promo_start) + ' → ' : 'until '}${when(p.promo_end)}</small>` : ''}${p.hot_deal_auto ? '<br><small class="a-mute">auto-delist</small>' : ''}</td>
        <td><span class="pill ${stock === 0 ? 'zero' : stock <= 5 ? 'low' : ''}">${stock}</span></td>
        <td><span class="pill ${p.hot_deal ? '' : 'off'}">${p.hot_deal ? 'Listed' : 'Delisted'}</span>${p.active === false ? ' <span class="pill off">Hidden</span>' : ''}</td>
        <td><div class="rowactions">
          ${p.hot_deal ? `<button class="btn red sm" data-remove="${p.id}">Remove</button>` : `<button class="btn sm" data-add="${p.id}">Add</button>`}
          <button class="btn ghost sm" data-promo="${p.id}">Promo</button>
        </div></td></tr>`;
    }).join('') : '<tr><td colspan="10"><div class="empty">No products match.</div></td></tr>';
    $('#hd-bulk').classList.toggle('on', selected.size > 0);
    $('#hd-sel-n').textContent = selected.size + ' selected';
  }
  paint();

  async function reload() { if (window.RB_CURRENT_VIEW !== 'hotdeals') return; products = (await RB_DB.products(true)).data || []; paint(); }
  const nextSort = () => Math.max(0, ...products.filter(p => p.hot_deal).map(p => p.hot_deal_sort || 0)) + 1;
  const fail1 = rs => { const bad = rs.find(r => !r.ok); if (bad) { toast(bad.error, true); return true; } return false; };

  $('#hd-title-save').onclick = async () => {
    const r = await RB_DB.saveSetting('hotdeals_title', $('#hd-title').value.trim() || 'Hot Deals');
    toast(r.ok ? 'Section name saved.' : r.error, !r.ok);
  };
  $('#hd-q').oninput = e => { q = e.target.value.trim(); paint(); };
  $('#hd-cat').onchange = e => { cat = e.target.value; paint(); };
  $('#hd-sort').onchange = e => { sortKey = e.target.value; paint(); };
  $('#hd-chips').onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; status = b.dataset.s; paint(); };
  $('#hd-all').onchange = e => { const list = visible(); if (e.target.checked) list.forEach(p => selected.add(p.id)); else selected.clear(); paint(); };
  $('#hd-b-none').onclick = () => { selected.clear(); paint(); };

  $('#hd-rows').addEventListener('change', e => {
    const c = e.target.closest('.rowchk'); if (!c) return;
    if (c.checked) selected.add(c.dataset.id); else selected.delete(c.dataset.id);
    $('#hd-bulk').classList.toggle('on', selected.size > 0); $('#hd-sel-n').textContent = selected.size + ' selected';
  });

  $('#hd-rows').onclick = async e => {
    const add = e.target.closest('[data-add]'), rm = e.target.closest('[data-remove]'),
      up = e.target.closest('[data-up]'), down = e.target.closest('[data-down]'), pr_ = e.target.closest('[data-promo]');
    if (add) {
      const p = products.find(x => x.id === add.dataset.add);
      const r = await RB_DB.saveProduct({ ...p, hot_deal: true, hot_deal_sort: nextSort() });
      toast(r.ok ? 'Added to Hot Deals.' : r.error, !r.ok); if (r.ok) reload();
    }
    if (rm) {
      const p = products.find(x => x.id === rm.dataset.remove);
      const r = await RB_DB.saveProduct({ ...p, hot_deal: false });
      toast(r.ok ? 'Removed from Hot Deals.' : r.error, !r.ok); if (r.ok) reload();
    }
    if (pr_) editProduct(products.find(x => x.id === pr_.dataset.promo), cats, reload);
    if (up || down) {
      const L = listed(), id = (up || down).dataset.up || (up || down).dataset.down;
      const i = L.findIndex(x => x.id === id), j = up ? i - 1 : i + 1;
      if (j < 0 || j >= L.length) return;
      /* re-number the whole list so equal or missing order values can never block a move */
      const order = L.map(x => x.id); [order[i], order[j]] = [order[j], order[i]];
      const rs = await Promise.all(order.map((pid, n) => {
        const p = products.find(x => x.id === pid);
        return (p.hot_deal_sort || 0) === n + 1 ? Promise.resolve({ ok: true }) : RB_DB.saveProduct({ ...p, hot_deal_sort: n + 1 });
      }));
      if (!fail1(rs)) reload();
    }
  };

  const chosen = () => [...selected].map(id => products.find(p => p.id === id)).filter(Boolean);
  $('#hd-b-add').onclick = async () => {
    let n = nextSort();
    const rs = await Promise.all(chosen().filter(p => !p.hot_deal).map(p => RB_DB.saveProduct({ ...p, hot_deal: true, hot_deal_sort: n++ })));
    if (!fail1(rs)) { toast(`${rs.length} product(s) added.`); selected.clear(); reload(); }
  };
  $('#hd-b-rm').onclick = async () => {
    const rs = await Promise.all(chosen().filter(p => p.hot_deal).map(p => RB_DB.saveProduct({ ...p, hot_deal: false })));
    if (!fail1(rs)) { toast(`${rs.length} product(s) removed.`); selected.clear(); reload(); }
  };
  $('#hd-b-clear').onclick = async () => {
    const rs = await Promise.all(chosen().map(p => RB_DB.saveProduct({
      ...p, variants: (p.variants || []).map(v => { const c = { ...v }; delete c.promo_price; return c; }),
      promo_start: null, promo_end: null, hot_deal_auto: false })));
    if (!fail1(rs)) { toast('Promotions cleared. Default prices are back.'); selected.clear(); reload(); }
  };
  $('#hd-b-promo').onclick = () => {
    const start = new Date(), end = new Date(Date.now() + 7 * 864e5);
    modal.open(`Schedule a promotion for ${selected.size} product(s)`, `
      <p class="hint">Sets a promo price on every size: the percentage comes off the “Was” price when there is one, otherwise off the default price.
      When the end time passes, each size returns to its default price and badge on its own.</p>
      <div class="grid3">
        <div class="field"><label>Discount %</label><input id="bp-pct" type="number" min="1" max="95" placeholder="e.g. 20"></div>
        <div class="field"><label>Starts</label><input id="bp-start" type="datetime-local" value="${toLocalInput(start)}"></div>
        <div class="field"><label>Ends</label><input id="bp-end" type="datetime-local" value="${toLocalInput(end)}"></div>
      </div>
      <label class="check"><input type="checkbox" id="bp-list" checked> Also list them in Hot Deals</label>
      <label class="check"><input type="checkbox" id="bp-auto" checked> Remove them from Hot Deals automatically when the promo ends</label>`,
      `<button class="btn ghost" id="bp-cancel">Cancel</button><button class="btn" id="bp-go">Apply promotion</button>`);
    $('#bp-cancel').onclick = () => modal.close();
    $('#bp-go').onclick = async () => {
      const pct = Number($('#bp-pct').value || 0);
      if (pct < 1 || pct > 95) return toast('Enter a discount between 1 and 95.', true);
      const s = $('#bp-start').value, e2 = $('#bp-end').value;
      if (s && e2 && new Date(e2) <= new Date(s)) return toast('The end must be after the start.', true);
      let n = nextSort();
      const rs = await Promise.all(chosen().map(p => RB_DB.saveProduct({
        ...p,
        variants: (p.variants || []).map(v => {
          const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0;
          return { ...v, promo_price: Math.round(base * (1 - pct / 100)) };
        }),
        promo_start: fromLocalInput(s), promo_end: fromLocalInput(e2), hot_deal_auto: $('#bp-auto').checked,
        ...($('#bp-list').checked && !p.hot_deal ? { hot_deal: true, hot_deal_sort: n++ } : {})
      })));
      if (fail1(rs)) return;
      modal.close(); toast('Promotion scheduled.'); selected.clear(); reload();
    };
  };
};

/* ---------- inventory management: stock, every cost, profit, history ----------
   Three tabs: Items (per size), Categories, Activity log. All profit numbers come
   from analyze(), so they follow the data instead of being typed in by hand. */
views.inventory = async function () {
  const view = $('#view');
  view.innerHTML = `<div class="bar"><div><h1>Inventory Management</h1><p>Loading…</p></div></div>`;
  let biz = await loadBiz();
  const settings = (await RB_DB.settings()).data || {};
  let threshold = Number(settings.low_stock_threshold || 5);
  const S = { tab: 'items', q: '', cat: '', chip: 'all', period: 'all', sortKey: null, sortDir: 1, kind: '', logQ: '' };
  const selected = new Set();
  const PERIODS = [['all', 'All time'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']];
  const CHIPS = [['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['loss', 'Losing money'], ['nocost', 'No cost set'], ['promo', 'Promo running']];
  const range = () => S.period === 'all' ? null : { from: new Date(Date.now() - Number(S.period) * 864e5), to: null };

  function rowsFor(A) {
    let flat = [];
    biz.products.forEach(p => (p.variants || []).forEach((v, vi) => {
      const key = p.id + '|' + v.label, va = A.V[key] || A.blank();
      const uc = rbUnitCost(v), price = rbEffPrice(p, v), stock = Number(v.stock) || 0;
      flat.push({ p, v, vi, key, uc, price, pu: price - uc, margin: price ? (price - uc) / price * 100 : null, stock,
        stockCost: stock * uc, potential: stock * (price - uc), sold: va.units, realized: va.gross, waste: va.waste, name: p.name.toLowerCase() });
    }));
    const s = S.q.trim().toLowerCase();
    flat = flat.filter(r => {
      if (S.cat && r.p.cat !== S.cat) return false;
      if (S.chip === 'low' && !(r.stock > 0 && r.stock <= threshold)) return false;
      if (S.chip === 'out' && r.stock !== 0) return false;
      if (S.chip === 'loss' && !(r.pu < 0)) return false;
      if (S.chip === 'nocost' && r.uc !== 0) return false;
      if (S.chip === 'promo' && rbPromoState(r.p) !== 'active') return false;
      return !s || r.p.name.toLowerCase().includes(s) || (r.p.sku || '').toLowerCase().includes(s) || r.p.cat.toLowerCase().includes(s) || (r.v.label || '').toLowerCase().includes(s);
    });
    if (S.sortKey) flat.sort((a, b) => ((a[S.sortKey] ?? -Infinity) > (b[S.sortKey] ?? -Infinity) ? 1 : (a[S.sortKey] ?? -Infinity) < (b[S.sortKey] ?? -Infinity) ? -1 : 0) * S.sortDir);
    return flat;
  }

  function paint() {
    const A = analyze(biz, range()), T = A.tot;
    let alerts = 0, losing = 0, noCost = 0;
    biz.products.forEach(p => (p.variants || []).forEach(v => {
      if ((Number(v.stock) || 0) <= threshold) alerts++;
      if (rbEffPrice(p, v) - rbUnitCost(v) < 0) losing++;
      if (!rbUnitCost(v)) noCost++;
    }));

    view.innerHTML = `
    <div class="bar">
      <div><h1>Inventory Management</h1><p>Stock, every cost, profit and loss, and the full history of each item. Click any item for its detail page.</p></div>
      <div class="bar-actions"><div class="seg" id="iv-period">${PERIODS.map(([k, l]) => `<button data-p="${k}" class="${S.period === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    </div>
    ${upgradeBanner(biz)}
    <div class="stats v2">
      <div class="stat v2"><span>Stock value (at cost)</span><b>${moneyD(T.stockCost)}</b><i>${T.stockUnits} units on hand</i></div>
      <div class="stat v2"><span>Stock value (at price)</span><b>${moneyD(T.stockValue)}</b><i>if it all sold today</i></div>
      <div class="stat v2"><span>Potential profit</span><b class="${sgn(T.potential)}">${moneyD(T.potential)}</b><i>value minus cost</i></div>
      <div class="stat v2"><span>Realized net profit</span><b class="${sgn(T.net)}">${moneyD(T.net)}</b><i>${S.period === 'all' ? 'all time' : 'last ' + S.period + ' days'}, delivered orders</i></div>
      <div class="stat v2"><span>Gross profit</span><b class="${sgn(T.gross)}">${moneyD(T.gross)}</b><i>margin ${pctTxt(T.margin)}</i></div>
      <div class="stat v2"><span>Wastage &amp; expenses</span><b class="${T.waste + T.expenses ? 'neg' : ''}">${moneyD(T.waste + T.expenses)}</b><i>${T.wasteQty} unit(s) lost</i></div>
      <div class="stat v2"><span>Stock alerts</span><b>${alerts}</b><i>at or below ${threshold} units</i></div>
      <div class="stat v2"><span>Needs attention</span><b>${losing}</b><i>${losing === 1 ? 'size sells' : 'sizes sell'} below cost · ${noCost} without a cost</i></div>
    </div>
    ${T.estUnits ? `<p class="hint">${T.estUnits} delivered unit(s) predate cost tracking, so their cost is estimated from today's cost.</p>` : ''}
    <div class="toolbar" style="justify-content:space-between">
      <div class="seg" id="iv-tabs">${[['items', 'Items'], ['cats', 'Categories'], ['log', 'Activity log']].map(([k, l]) => `<button data-t="${k}" class="${S.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <label class="thresh">Alert at ≤ <input id="iv-thresh" type="number" min="0" value="${threshold}"> units</label>
    </div>
    <div id="iv-body"></div>`;

    $('#iv-period').onclick = e => { const b = e.target.closest('[data-p]'); if (b) { S.period = b.dataset.p; paint(); } };
    $('#iv-tabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { S.tab = b.dataset.t; paint(); } };
    $('#iv-thresh').onchange = async e => {
      threshold = Math.max(0, Number(e.target.value || 0));
      await RB_DB.saveSetting('low_stock_threshold', String(threshold)); paint();
    };
    if (S.tab === 'items') paintItems(A); else if (S.tab === 'cats') paintCats(A); else paintLog();
  }

  /* ----- items tab ----- */
  function paintItems(A) {
    const rows = rowsFor(A);
    const sum = rows.reduce((t, r) => { t.stock += r.stock; t.cost += r.stockCost; t.pot += r.potential; t.sold += r.sold; t.real += r.realized; return t; }, { stock: 0, cost: 0, pot: 0, sold: 0, real: 0 });
    const th = (k, l) => `<th class="sortable ${S.sortKey === k ? 'active' : ''}" data-k="${k}">${l} <span class="arrow">${S.sortKey === k ? (S.sortDir > 0 ? '↑' : '↓') : '↕'}</span></th>`;
    $('#iv-body').innerHTML = `
      <div class="toolbar" style="justify-content:space-between">
        <div class="chips" id="iv-chips">${CHIPS.map(([k, l]) => `<button class="chip ${k === 'low' ? 'warn' : k === 'out' || k === 'loss' ? 'bad' : ''} ${S.chip === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <select id="iv-cat"><option value="">All aisles</option>${biz.cats.map(c => `<option value="${c.slug}" ${S.cat === c.slug ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
          <button class="btn ghost sm" id="iv-export">${svg('out')} Export CSV</button></div>
      </div>
      <div class="toolbar"><input type="search" id="iv-q" value="${esc(S.q)}" placeholder="Search by name, SKU, size or aisle"></div>
      <div class="bulkbar" id="iv-bulk"><b id="iv-sel-n">0 selected</b>
        <label class="thresh">Change stock by <input id="iv-adj" type="number" value="0" style="width:84px"></label>
        <input id="iv-adj-note" placeholder="Reason (optional)" style="width:200px">
        <button class="btn sm" id="iv-adj-go">Apply</button><div class="spacer"></div>
        <button class="btn ghost sm" id="iv-clear">Clear selection</button></div>
      <div class="tablewrap"><table>
        <thead><tr><th class="chkcol"><input type="checkbox" class="headchk" id="iv-all"></th>
          ${th('name', 'Item')}<th>Aisle</th>${th('stock', 'Stock')}${th('uc', 'Unit cost')}${th('price', 'Price')}
          ${th('pu', 'Profit / unit')}${th('margin', 'Margin')}${th('stockCost', 'Stock cost')}${th('potential', 'Potential')}
          ${th('sold', 'Sold')}${th('realized', 'Realized')}<th></th></tr></thead>
        <tbody>${rows.length ? rows.map(r => `<tr>
          <td class="chkcol"><input type="checkbox" class="rowchk" data-key="${esc(r.key)}" ${selected.has(r.key) ? 'checked' : ''}></td>
          <td><a href="#" class="item-link" data-item="${r.p.id}"><b>${esc(r.p.name)}</b></a> <span class="pill">${esc(r.p.sku || '—')}</span><br><small class="a-mute">${esc(r.v.label)}${promoBadge(r.p) ? ' · ' : ''}${promoBadge(r.p)}</small></td>
          <td>${esc((biz.cats.find(c => c.slug === r.p.cat) || {}).name || r.p.cat)}</td>
          <td><input type="number" min="0" class="inv-stock" data-pid="${r.p.id}" data-vi="${r.vi}" value="${r.stock}" style="width:74px">
            ${r.stock <= threshold ? `<span class="pill ${r.stock ? 'low' : 'zero'}">${r.stock ? 'Low' : 'Out'}</span>` : ''}</td>
          <td><a href="#" class="item-link" data-item="${r.p.id}" data-tab="costs" title="Edit cost breakdown">${r.uc ? moneyD(r.uc) : '<span class="pill low">set cost</span>'}</a></td>
          <td>${moneyD(r.price)}${r.price !== Number(r.v.price) ? `<br><small class="strike">${moneyD(r.v.price)}</small>` : ''}</td>
          <td>${profitTxt(r.pu)}</td><td>${pctTxt(r.margin)}</td>
          <td>${moneyD(r.stockCost)}</td><td>${profitTxt(r.potential)}</td>
          <td>${r.sold}</td><td>${profitTxt(r.realized)}</td>
          <td><button class="btn ghost sm" data-item="${r.p.id}">Details</button></td></tr>`).join('')
          : '<tr><td colspan="13"><div class="empty">Nothing matches.</div></td></tr>'}</tbody>
        ${rows.length ? `<tfoot><tr><td></td><td><b>Total (${rows.length} sizes)</b></td><td></td><td><b>${sum.stock}</b></td><td></td><td></td><td></td><td></td>
          <td><b>${moneyD(sum.cost)}</b></td><td>${profitTxt(sum.pot)}</td><td><b>${sum.sold}</b></td><td>${profitTxt(sum.real)}</td><td></td></tr></tfoot>` : ''}
      </table></div>`;

    updateBulk();
    $('#iv-q').oninput = e => { S.q = e.target.value; const pos = e.target.selectionStart; paintItems(A); const el = $('#iv-q'); el.focus(); el.setSelectionRange(pos, pos); };
    $('#iv-cat').onchange = e => { S.cat = e.target.value; paintItems(A); };
    $('#iv-chips').onclick = e => { const b = e.target.closest('[data-c]'); if (b) { S.chip = b.dataset.c; paintItems(A); } };
    $$('#iv-body th.sortable').forEach(t => t.onclick = () => { if (S.sortKey === t.dataset.k) S.sortDir *= -1; else { S.sortKey = t.dataset.k; S.sortDir = 1; } paintItems(A); });
    $('#iv-body').onclick = e => {
      const it = e.target.closest('[data-item]');
      if (it) { e.preventDefault(); openItem(it.dataset.item, { tab: it.dataset.tab, onChange: reload }); }
    };
    $('#iv-body').onchange = async e => {
      const chk = e.target.closest('.rowchk');
      if (chk) { if (chk.checked) selected.add(chk.dataset.key); else selected.delete(chk.dataset.key); updateBulk(); return; }
      const inp = e.target.closest('.inv-stock'); if (!inp) return;
      const p = biz.products.find(x => x.id === inp.dataset.pid), vi = Number(inp.dataset.vi);
      const before = Number(p.variants[vi].stock) || 0, after = Math.max(0, Math.round(Number(inp.value || 0)));
      if (before === after) return;
      const variants = p.variants.map((v, i) => i === vi ? { ...v, stock: after } : v);
      const r = await RB_DB.saveProduct({ ...p, variants });
      if (!r.ok) return toast(r.error, true);
      await RB_DB.addInventoryLog({ product_id: p.id, variant_label: p.variants[vi].label, kind: 'adjustment', qty: after - before, note: 'Edited in inventory table' });
      toast('Stock saved.'); reload();
    };
    $('#iv-all').onchange = e => { if (e.target.checked) rows.forEach(r => selected.add(r.key)); else selected.clear(); paintItems(A); };
    $('#iv-clear').onclick = () => { selected.clear(); paintItems(A); };
    $('#iv-adj-go').onclick = async () => {
      const delta = Math.round(Number($('#iv-adj').value || 0));
      if (!delta || !selected.size) return toast('Select rows and enter a non-zero amount.', true);
      const byP = {};
      [...selected].forEach(k => { const [pid, label] = k.split('|'); (byP[pid] = byP[pid] || []).push(label); });
      const note = $('#iv-adj-note').value.trim() || 'Bulk adjustment';
      for (const pid of Object.keys(byP)) {
        const p = biz.products.find(x => x.id === pid);
        const variants = p.variants.map(v => byP[pid].includes(v.label) ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) + delta) } : v);
        const r = await RB_DB.saveProduct({ ...p, variants });
        if (!r.ok) return toast(r.error, true);
        for (const label of byP[pid]) await RB_DB.addInventoryLog({ product_id: pid, variant_label: label, kind: 'adjustment', qty: delta, note });
      }
      toast(`Adjusted ${selected.size} size(s).`); selected.clear(); reload();
    };
    $('#iv-export').onclick = () => downloadFile('inventory.csv', toCSV(rows, [
      { label: 'SKU', get: r => r.p.sku }, { label: 'Item', get: r => r.p.name }, { label: 'Size', get: r => r.v.label },
      { label: 'Aisle', get: r => r.p.cat }, { label: 'Stock', get: r => r.stock },
      ...COST_FIELDS.map(([k, l]) => ({ label: l, get: r => r.v[k] || 0 })),
      { label: 'Unit cost', get: r => r.uc }, { label: 'Price now', get: r => r.price }, { label: 'Profit per unit', get: r => r.pu },
      { label: 'Margin %', get: r => r.margin == null ? '' : r.margin.toFixed(1) }, { label: 'Stock cost', get: r => r.stockCost },
      { label: 'Potential profit', get: r => r.potential }, { label: 'Units sold', get: r => r.sold }, { label: 'Realized profit', get: r => r.realized }
    ]), 'text/csv');
  }
  function updateBulk() {
    const b = $('#iv-bulk'); if (!b) return;
    b.classList.toggle('on', selected.size > 0); $('#iv-sel-n').textContent = selected.size + ' selected';
  }

  /* ----- categories tab ----- */
  function paintCats(A) {
    const rows = biz.cats.map(c => ({ c, a: A.C[c.slug] || A.blank(), n: biz.products.filter(p => p.cat === c.slug).length }))
      .sort((x, y) => y.a.net - x.a.net);
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.a.net)));
    $('#iv-body').innerHTML = `
      <div class="tablewrap"><table>
        <thead><tr><th>Aisle</th><th>Items</th><th>Stock</th><th>Stock cost</th><th>Potential</th><th>Sold</th><th>Revenue</th><th>Gross profit</th><th>Margin</th><th>Wastage + expenses</th><th>Net profit</th><th></th></tr></thead>
        <tbody>${rows.map(({ c, a, n }) => `<tr class="clickrow" data-cat="${c.slug}">
          <td><b>${esc(c.name)}</b></td><td>${n}</td><td>${a.stockUnits}</td><td>${moneyD(a.stockCost)}</td><td>${profitTxt(a.potential)}</td>
          <td>${a.units}</td><td>${moneyD(a.revenue)}</td><td>${profitTxt(a.gross)}</td><td>${pctTxt(a.margin)}</td>
          <td>${a.waste + a.expenses ? `<span class="neg">${moneyD(a.waste + a.expenses)}</span>` : '—'}</td>
          <td>${profitTxt(a.net)}<div class="mini-track"><i class="${sgn(a.net)}" style="width:${Math.abs(a.net) / maxAbs * 100}%"></i></div></td>
          <td><button class="btn ghost sm" data-cat="${c.slug}">Details</button></td></tr>`).join('')}</tbody></table></div>`;
    $('#iv-body').onclick = e => { const r = e.target.closest('[data-cat]'); if (r) openCategory(r.dataset.cat, { onChange: reload }); };
  }

  /* ----- activity log tab ----- */
  function paintLog() {
    const s = S.logQ.trim().toLowerCase();
    const pName = id => (biz.products.find(p => p.id === id) || {}).name || '(deleted item)';
    const list = biz.logs.filter(l => (!S.kind || l.kind === S.kind) &&
      (!s || pName(l.product_id).toLowerCase().includes(s) || (l.note || '').toLowerCase().includes(s) || (l.variant_label || '').toLowerCase().includes(s)));
    $('#iv-body').innerHTML = `
      <div class="toolbar" style="justify-content:space-between">
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <input type="search" id="lg-q" value="${esc(S.logQ)}" placeholder="Search item, size or note" style="min-width:240px">
          <select id="lg-kind"><option value="">All activity</option>${Object.entries(LOG_LABEL).map(([k, l]) => `<option value="${k}" ${S.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <button class="btn ghost sm" id="lg-export">${svg('out')} Export CSV</button></div>
      ${biz.needsUpgrade ? '' : ''}
      <div class="tablewrap"><table>
        <thead><tr><th>When</th><th>Item</th><th>Size</th><th>Type</th><th>Qty</th><th>Amount</th><th>Note</th><th>By</th></tr></thead>
        <tbody>${list.length ? list.slice(0, 400).map(l => `<tr>
          <td>${whenFull(l.created_at)}</td><td><a href="#" class="item-link" data-item="${l.product_id}" data-tab="stock">${esc(pName(l.product_id))}</a></td>
          <td>${esc(l.variant_label || '—')}</td><td><span class="pill ${LOG_PILL[l.kind] || ''}">${LOG_LABEL[l.kind] || l.kind}</span></td>
          <td>${l.qty || ''}</td><td>${l.amount ? moneyD(l.amount) : ''}</td><td>${esc(l.note || '')}</td><td><small class="a-mute">${esc(l.created_by || '')}</small></td></tr>`).join('')
          : `<tr><td colspan="8"><div class="empty">${biz.needsUpgrade ? 'Run the file in sql/pending/ to start recording history.' : 'No activity recorded yet.'}</div></td></tr>`}</tbody></table></div>
      ${list.length > 400 ? `<p class="hint">Showing the latest 400 of ${list.length}. Export for the full list.</p>` : ''}`;
    $('#lg-q').oninput = e => { S.logQ = e.target.value; const pos = e.target.selectionStart; paintLog(); const el = $('#lg-q'); el.focus(); el.setSelectionRange(pos, pos); };
    $('#lg-kind').onchange = e => { S.kind = e.target.value; paintLog(); };
    $('#lg-export').onclick = () => downloadFile('inventory-activity.csv', toCSV(list, [
      { label: 'When', get: l => whenFull(l.created_at) }, { label: 'Item', get: l => pName(l.product_id) }, { label: 'Size', get: l => l.variant_label },
      { label: 'Type', get: l => LOG_LABEL[l.kind] || l.kind }, { label: 'Qty', get: l => l.qty }, { label: 'Unit cost', get: l => l.unit_cost },
      { label: 'Amount', get: l => l.amount }, { label: 'Note', get: l => l.note }, { label: 'By', get: l => l.created_by }
    ]), 'text/csv');
    $('#iv-body').onclick = e => { const it = e.target.closest('[data-item]'); if (it) { e.preventDefault(); openItem(it.dataset.item, { tab: it.dataset.tab, onChange: reload }); } };
  }

  async function reload() { if (window.RB_CURRENT_VIEW !== 'inventory') return; biz = await loadBiz(); paint(); }
  paint();
};

/* ---------- hero slides ---------- */
/* what the React screens need from the legacy popups */
export { openItem, toast, minEffPrice, upgradeBanner };
