/* ============================================================
   Dashboard — the first screen of the panel, planned around three
   questions, top to bottom:
     1. What needs me right now?      → action list + order pipeline
     2. How is the shop doing?        → KPIs with the previous period, trend
     3. Where is the money?           → profit statement, aisles, products, stock
   Everything is computed from the same data the other pages use
   (loadBiz / analyze in admin.js); nothing here is stored.
   ============================================================ */

import { RB_DB, rbPromoState } from '../lib/db.js';
import { periodWindow, previousWindow, bucketSeries, niceScale, pctChange, compactMoney } from './metrics';

const DAY = 864e5;
const RANGES = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom']];
const RANGE_TEXT = { today: 'today', '7d': 'the last 7 days', '30d': 'the last 30 days', '90d': 'the last 90 days', month: 'this month', all: 'all time', custom: 'the selected dates' };
const STATUS_LABEL = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
const STATUS_HINT = { pending: 'waiting for you to confirm', confirmed: 'ready to pack and send', shipped: 'on the way', delivered: 'completed', cancelled: 'not fulfilled' };

let remembered = { range: '30d', from: '', to: '' };

export async function dashView(d) {
  const { $, esc, money, moneyD, whenFull, svg, go, openItem, loadBiz, analyze, upgradeBanner, customerTag, STATUSES } = d;
  const view = $('#view');
  view.innerHTML = skeleton();

  const [biz, cr, sr, mr] = await Promise.all([loadBiz(), RB_DB.customers(), RB_DB.settings(), RB_DB.messages()]);
  if (window.RB_CURRENT_VIEW !== 'dash') return;
  const { products, orders, cats } = biz;
  const customers = cr.data || [], messages = mr.data || [];
  const threshold = Number((sr.data || {}).low_stock_threshold || 5);
  const state = remembered;
  const live = o => o.status !== 'cancelled';
  const sum = (list, f) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
  const stockOf = p => (p.variants || []).reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const pById = Object.fromEntries(products.map(p => [p.id, p]));
  const catName = slug => (cats.find(c => c.slug === slug) || {}).name || slug || 'Other';
  const firstOrderAt = orders.length ? Math.min(...orders.map(o => +new Date(o.placed_at))) : Date.now() - 30 * DAY;

  /* ---- things that need a person, independent of the date range ---- */
  function actions() {
    const pending = orders.filter(o => o.status === 'pending');
    const confirmed = orders.filter(o => o.status === 'confirmed');
    const unpaid = orders.filter(o => o.status === 'delivered' && o.payment_status !== 'paid' && o.payment_status !== 'refunded');
    const unread = messages.filter(m => m.sender !== 'admin' && !m.read_by_admin);
    const out = products.filter(p => p.active !== false && stockOf(p) === 0);
    const low = products.filter(p => p.active !== false && stockOf(p) > 0 && stockOf(p) <= threshold);
    const ending = products.filter(p => rbPromoState(p) === 'active' && p.promo_end && (+new Date(p.promo_end) - Date.now()) < 2 * DAY);
    const oldest = pending.length ? Math.max(...pending.map(o => Date.now() - +new Date(o.placed_at))) : 0;
    const age = ms => ms >= DAY ? Math.floor(ms / DAY) + 'd' : Math.max(1, Math.floor(ms / 36e5)) + 'h';
    return [
      pending.length && { tone: 'warn', icon: 'cart', n: pending.length, title: `order${pending.length === 1 ? '' : 's'} to confirm`, sub: `oldest has waited ${age(oldest)}`, cta: 'Review', run: () => go('orders', { status: 'pending' }) },
      confirmed.length && { tone: 'info', icon: 'box', n: confirmed.length, title: `order${confirmed.length === 1 ? '' : 's'} to pack and ship`, sub: 'confirmed, not yet sent', cta: 'Open', run: () => go('orders', { status: 'confirmed' }) },
      unread.length && { tone: 'info', icon: 'mail', n: unread.length, title: `unread message${unread.length === 1 ? '' : 's'}`, sub: 'customers waiting for a reply', cta: 'Reply', run: () => go('messages') },
      out.length && { tone: 'bad', icon: 'chart', n: out.length, title: `product${out.length === 1 ? '' : 's'} sold out`, sub: 'still visible in the shop', cta: 'Restock', run: () => go('inventory') },
      low.length && { tone: 'warn', icon: 'chart', n: low.length, title: `product${low.length === 1 ? '' : 's'} running low`, sub: `${threshold} units or fewer`, cta: 'Check', run: () => go('inventory') },
      unpaid.length && { tone: 'warn', icon: 'ticket', n: unpaid.length, title: `delivered order${unpaid.length === 1 ? '' : 's'} not marked paid`, sub: money(sum(unpaid, o => o.total)) + ' to collect or record', cta: 'Open', run: () => go('orders', { status: 'delivered' }) },
      ending.length && { tone: 'info', icon: 'flame', n: ending.length, title: `promotion${ending.length === 1 ? '' : 's'} ending within 48h`, sub: 'prices return to normal on their own', cta: 'View', run: () => go('hotdeals') }
    ].filter(Boolean);
  }

  function delta(curr, prev, { invert = false } = {}) {
    const c = pctChange(curr, prev);
    if (c == null) return `<span class="d-delta flat">no earlier data to compare</span>`;
    if (Math.abs(c) < 0.5) return `<span class="d-delta flat">→ level with the period before</span>`;
    const good = invert ? c < 0 : c > 0;
    return `<span class="d-delta ${good ? 'up' : 'down'}">${c > 0 ? '▲' : '▼'} ${Math.abs(c) >= 1000 ? '999+' : Math.abs(c).toFixed(0)}% <i>vs the period before</i></span>`;
  }

  function paint() {
    const win = periodWindow(state.range, { from: state.from, to: state.to, first: firstOrderAt });
    const prevWin = state.range === 'all' ? null : previousWindow(win);
    const inWin = (o, w) => { const t = +new Date(o.placed_at); return t >= w.from && t <= w.to; };
    const cur = orders.filter(o => inWin(o, win)), curLive = cur.filter(live);
    const prev = prevWin ? orders.filter(o => inWin(o, prevWin)) : null, prevLive = prev ? prev.filter(live) : null;

    const sales = sum(curLive, o => o.total), prevSales = prevLive ? sum(prevLive, o => o.total) : null;
    const aov = curLive.length ? sales / curLive.length : 0;
    const prevAov = prevLive && prevLive.length ? prevSales / prevLive.length : null;
    const A = analyze(biz, { from: new Date(win.from), to: new Date(win.to) }), T = A.tot;
    const prevNet = prevWin ? analyze(biz, { from: new Date(prevWin.from), to: new Date(prevWin.to) }).tot.net : null;
    const cancelled = cur.length - curLive.length;
    const newCustomers = customers.filter(c => { const t = +new Date(c.created_at); return t >= win.from && t <= win.to; }).length;

    const series = bucketSeries(curLive.map(o => ({ at: +new Date(o.placed_at), value: Number(o.total) || 0 })), win);
    const prevSeries = prevWin ? bucketSeries(prevLive.map(o => ({ at: +new Date(o.placed_at), value: Number(o.total) || 0 })), { ...prevWin, unit: series.unit, count: series.values.length }) : null;

    /* aisles and products, from what was actually ordered in the range */
    const byCat = {}, byProd = {};
    curLive.forEach(o => (o.items || []).forEach(i => {
      const rev = (Number(i.unit_price) || 0) * (Number(i.qty) || 0);
      const p = pById[i.product_id];
      byCat[p ? p.cat : '—'] = (byCat[p ? p.cat : '—'] || 0) + rev;
      const k = i.product_name;
      (byProd[k] = byProd[k] || { rev: 0, qty: 0, id: i.product_id }).rev += rev; byProd[k].qty += Number(i.qty) || 0;
    }));
    const topCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const topProds = Object.entries(byProd).sort((a, b) => b[1].rev - a[1].rev).slice(0, 6);
    const stockRows = products.filter(p => p.active !== false && stockOf(p) <= threshold).sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 6);
    const acts = actions();
    const pipe = STATUSES.map(s => ({ s, n: cur.filter(o => o.status === s).length }));
    const pipeMax = Math.max(1, ...pipe.map(x => x.n));
    const hour = new Date().getHours();
    const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

    const bars = (rows, fmt) => {
      const max = Math.max(1, ...rows.map(r => r.value));
      return `<div class="d-bars">${rows.map(r => `
        <div class="d-bar" ${r.attr || ''} title="${esc(r.label)} — ${esc(fmt(r.value))}">
          <span class="d-bar-label">${esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>
          <span class="d-bar-track"><span class="d-bar-fill" style="width:${Math.max(1.5, r.value / max * 100).toFixed(1)}%"></span></span>
          <b class="d-bar-value">${esc(fmt(r.value))}</b>
        </div>`).join('')}</div>`;
    };
    const row = (label, value, cls) => `<div class="d-pl-row ${cls || ''}"><span>${label}</span><b>${value}</b></div>`;
    const signed = n => `<span class="${n > 0 ? 'pos' : n < 0 ? 'neg' : ''}">${n < 0 ? '−' : ''}${moneyD(Math.abs(n))}</span>`;
    const minus = n => n ? `<span class="neg">−${moneyD(n)}</span>` : moneyD(0);

    view.innerHTML = `
    <div class="d-head">
      <div>
        <h1>${hello}</h1>
        <p>Here is how the shop is doing in <b>${RANGE_TEXT[state.range]}</b>. <span class="d-asof">Updated ${whenFull(new Date())}</span></p>
      </div>
      <div class="d-range">
        <div class="seg" id="d-range" role="group" aria-label="Date range">${RANGES.map(([k, l]) => `<button data-r="${k}" class="${state.range === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${state.range === 'custom' ? `<div class="d-custom"><input type="date" id="d-from" value="${state.from}" aria-label="From"><span>to</span><input type="date" id="d-to" value="${state.to}" aria-label="To"></div>` : ''}
      </div>
    </div>
    ${upgradeBanner(biz)}

    <section class="d-grid d-top">
      <div class="card d-actions">
        <div class="d-card-head"><h3>Needs you now</h3><span class="d-note">not tied to the date range</span></div>
        ${acts.length ? `<ul>${acts.map((a, i) => `
          <li class="d-act ${a.tone}" data-act="${i}" tabindex="0" role="button">
            <span class="d-act-icon">${svg(a.icon)}</span>
            <span class="d-act-text"><b><em>${a.n}</em> ${esc(a.title)}</b><small>${esc(a.sub)}</small></span>
            <span class="d-act-cta">${a.cta} →</span>
          </li>`).join('')}</ul>`
          : `<div class="d-clear">${svg('leaf')}<b>All clear</b><span>No orders waiting, no unread messages, shelves are stocked.</span></div>`}
      </div>
      <div class="card d-pipe">
        <div class="d-card-head"><h3>Order pipeline</h3><span class="d-note">${cur.length} placed in range · click a stage</span></div>
        <div class="d-pipe-rows">${pipe.map(x => `
          <button class="d-stage st-${x.s}" data-status="${x.s}" title="${STATUS_LABEL[x.s]}: ${x.n}">
            <span class="d-stage-name"><i></i>${STATUS_LABEL[x.s]}<small>${STATUS_HINT[x.s]}</small></span>
            <span class="d-stage-track"><span style="width:${x.n ? Math.max(3, x.n / pipeMax * 100).toFixed(1) : 0}%"></span></span>
            <b>${x.n}</b>
          </button>`).join('')}</div>
      </div>
    </section>

    <section class="d-kpis">
      <div class="d-kpi"><span>Sales</span><b>${money(sales)}</b>${prevWin ? delta(sales, prevSales) : '<span class="d-delta flat">all orders except cancelled</span>'}
        <small>order totals incl. delivery, excl. cancelled</small></div>
      <div class="d-kpi"><span>Orders</span><b>${curLive.length}</b>${prevWin ? delta(curLive.length, prevLive.length) : '<span class="d-delta flat">&nbsp;</span>'}
        <small>${cancelled} cancelled · ${cur.filter(o => o.is_guest).length} from guests</small></div>
      <div class="d-kpi"><span>Average order</span><b>${money(aov)}</b>${prevWin ? delta(aov, prevAov) : '<span class="d-delta flat">&nbsp;</span>'}
        <small>sales ÷ orders</small></div>
      <div class="d-kpi"><span>Net profit</span><b class="${T.net < 0 ? 'neg' : ''}">${T.net < 0 ? '−' : ''}${money(Math.abs(T.net))}</b>${prevWin ? delta(T.net, prevNet) : '<span class="d-delta flat">&nbsp;</span>'}
        <small>delivered orders · margin ${T.margin == null ? '—' : (Math.round(T.margin * 10) / 10) + '%'}</small></div>
      <div class="d-kpi"><span>Customers</span><b>${customers.length}</b><span class="d-delta flat">${newCustomers} joined in range</span>
        <small>registered accounts</small></div>
    </section>

    <section class="card d-trend">
      <div class="d-card-head">
        <div><h3>Sales over time</h3><span class="d-note">${series.unitLabel} totals · cancelled orders excluded</span></div>
        <div class="d-legend"><span><i class="k-cur"></i>${esc(labelFor(state.range))}</span>${prevSeries ? '<span><i class="k-prev"></i>Period before</span>' : ''}</div>
      </div>
      <div class="d-chart" id="d-chart" role="img" aria-label="Sales per ${series.unitLabel.toLowerCase()} for ${RANGE_TEXT[state.range]}: total ${esc(money(sales))}"></div>
    </section>

    <section class="d-grid d-two">
      <div class="card d-pl">
        <div class="d-card-head"><h3>Profit statement</h3><span class="d-note">delivered orders in range</span></div>
        ${row('Revenue from delivered items', moneyD(T.revenue))}
        ${row('Cost of goods sold', minus(T.cogs))}
        ${row('Gross profit', signed(T.gross), 'total')}
        ${row('Wastage', minus(T.waste))}
        ${row('One-off expenses', minus(T.expenses))}
        ${row('Coupons given', minus(T.coupons))}
        ${row('Net profit', signed(T.net), 'grand')}
        ${T.estUnits ? `<p class="d-foot">${T.estUnits} unit(s) were sold before cost tracking; their cost is estimated from today's cost.</p>` : ''}
        <div class="d-pl-side">
          <div><span>Stock on hand, at cost</span><b>${moneyD(T.stockCost)}</b></div>
          <div><span>Profit if it all sells</span><b>${signed(T.potential)}</b></div>
          <div><span>Profit in undelivered orders</span><b>${signed(T.pGross)}</b></div>
        </div>
        <button class="link-btn" data-go="inventory">Break it down by item and aisle →</button>
      </div>
      <div class="card">
        <div class="d-card-head"><h3>Sales by aisle</h3><span class="d-note">items ordered in range</span></div>
        ${topCats.length ? bars(topCats.map(([slug, v]) => ({ label: catName(slug), value: v })), money) : '<div class="empty">No sales in this range yet.</div>'}
        <div class="d-card-head" style="margin-top:22px"><h3>Best sellers</h3><span class="d-note">by revenue</span></div>
        ${topProds.length ? bars(topProds.map(([name, v]) => ({ label: name, sub: v.qty + ' sold', value: v.rev, attr: pById[v.id] ? `data-item="${esc(v.id)}"` : '' })), money) : '<div class="empty">No sales in this range yet.</div>'}
      </div>
    </section>

    <section class="d-grid d-two wide-left">
      <div class="card">
        <div class="d-card-head"><h3>Latest orders</h3><button class="link-btn" data-go="orders">All orders →</button></div>
        ${cur.length ? `<div class="tablewrap flat"><table>
          <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th></tr></thead>
          <tbody>${cur.slice(0, 7).map(o => `<tr class="clickrow" data-order="${esc(o.id)}">
            <td><b>${esc(o.order_code)}</b><br><small class="a-mute">${whenFull(o.placed_at)}</small></td>
            <td>${esc(o.contact_name)}<br>${customerTag(o)}</td>
            <td>${sum(o.items || [], i => i.qty)}</td>
            <td class="num">${money(o.total)}</td>
            <td><span class="pill ${esc(o.status)}">${esc(o.status)}</span></td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No orders in this range.</div>'}
      </div>
      <div class="card">
        <div class="d-card-head"><h3>Stock to watch</h3><button class="link-btn" data-go="inventory">Inventory →</button></div>
        ${stockRows.length ? `<ul class="d-stock">${stockRows.map(p => `
          <li data-item="${esc(p.id)}" tabindex="0" role="button">
            <span><b>${esc(p.name)}</b><small>${esc(catName(p.cat))}</small></span>
            <span class="pill ${stockOf(p) === 0 ? 'zero' : 'low'}">${stockOf(p) === 0 ? 'Sold out' : stockOf(p) + ' left'}</span>
          </li>`).join('')}</ul>` : '<div class="empty">Every product is well stocked.</div>'}
      </div>
    </section>`;

    drawTrend($('#d-chart'), series, prevSeries, money);

    $('#d-range').onclick = e => {
      const b = e.target.closest('[data-r]'); if (!b) return;
      state.range = b.dataset.r;
      if (state.range === 'custom' && !state.from) {
        const iso = t => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
        state.from = iso(Date.now() - 13 * DAY); state.to = iso(Date.now());
      }
      paint();
    };
    const f = $('#d-from'), t = $('#d-to');
    if (f) f.onchange = e => { state.from = e.target.value; paint(); };
    if (t) t.onchange = e => { state.to = e.target.value; paint(); };

    const activate = e => {
      const act = e.target.closest('[data-act]');
      if (act) return acts[Number(act.dataset.act)].run();
      const st = e.target.closest('[data-status]');
      if (st) return go('orders', { status: st.dataset.status });
      const cust = e.target.closest('[data-customer]');
      if (cust) { e.preventDefault(); return go('customers', { openCustomer: cust.dataset.customer }); }
      const it = e.target.closest('[data-item]');
      if (it) { e.preventDefault(); return openItem(it.dataset.item, { onChange: () => { if (window.RB_CURRENT_VIEW === 'dash') go('dash'); } }); }
      const ord = e.target.closest('[data-order]');
      if (ord) return go('orders', { openOrder: ord.dataset.order });
      const g = e.target.closest('[data-go]');
      if (g) return go(g.dataset.go);
    };
    view.onclick = activate;
    view.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"]')) { e.preventDefault(); activate(e); } };
  }

  paint();
  /* the chart is drawn to the pixel width of its card, so redraw on resize / theme change */
  let raf;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { if (window.RB_CURRENT_VIEW === 'dash' && $('#d-chart')) paint(); }); };
  if (dashView.off) dashView.off();
  window.addEventListener('resize', redraw);
  dashView.off = () => window.removeEventListener('resize', redraw);
}

function labelFor(range) {
  return { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', month: 'This month', all: 'All time', custom: 'Selected dates' }[range];
}

function skeleton() {
  return `<div class="d-head"><div><h1>Dashboard</h1><p>Loading the latest numbers…</p></div></div>
    <div class="d-grid d-top"><div class="card sk" style="height:230px"></div><div class="card sk" style="height:230px"></div></div>
    <div class="d-kpis">${'<div class="d-kpi sk" style="height:112px"></div>'.repeat(5)}</div>
    <div class="card sk" style="height:300px"></div>`;
}

/* ---------- sales chart: one y-axis, current period as a line + soft area,
   the period before as a thin dashed line, crosshair tooltip on hover ---------- */
function drawTrend(host, series, prev, money) {
  if (!host) return;
  const W = Math.max(320, host.clientWidth), H = 260;
  const m = { l: 52, r: 14, t: 14, b: 30 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;
  const vals = series.values, n = vals.length;
  const top = Math.max(1, ...vals, ...(prev ? prev.values : []));
  const { max, ticks } = niceScale(top, 4);
  const x = i => m.l + (n > 1 ? i / (n - 1) * iw : iw / 2);
  const y = v => m.t + ih - v / max * ih;
  const path = arr => arr.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 78))));
  const lastLabelled = Math.floor((n - 1) / every) * every;

  host.innerHTML = `
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
      <defs><linearGradient id="dFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="var(--c-series)" stop-opacity=".22"/><stop offset="1" stop-color="var(--c-series)" stop-opacity="0"/></linearGradient></defs>
      ${ticks.map(t => `<line class="c-grid" x1="${m.l}" x2="${W - m.r}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>
        <text class="c-axis" x="${m.l - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${compactMoney(t)}</text>`).join('')}
      ${series.labels.map((l, i) => (i % every || (i !== lastLabelled && n - 1 - i < every / 2)) ? '' : `<text class="c-axis" x="${x(i).toFixed(1)}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${l}</text>`).join('')}
      ${prev ? `<path class="c-prev" d="${path(prev.values)}"/>` : ''}
      ${n > 1 ? `<path d="${path(vals)} L${x(n - 1).toFixed(1)} ${m.t + ih} L${x(0).toFixed(1)} ${m.t + ih} Z" fill="url(#dFill)"/>` : ''}
      <path class="c-line" d="${path(vals)}"/>
      ${n === 1 ? `<circle class="c-dot" cx="${x(0)}" cy="${y(vals[0])}" r="4.5"/>` : ''}
      <g class="c-hover" style="display:none">
        <line class="c-cross" y1="${m.t}" y2="${m.t + ih}"/>
        ${prev ? '<circle class="c-dot prev" r="4"/>' : ''}<circle class="c-dot" r="4.5"/>
      </g>
      <rect class="c-hit" x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent"/>
    </svg>
    <div class="c-tip" style="display:none"></div>`;

  const hover = host.querySelector('.c-hover'), tip = host.querySelector('.c-tip'), hit = host.querySelector('.c-hit');
  const cross = hover.querySelector('.c-cross'), dot = hover.querySelector('.c-dot:not(.prev)'), pdot = hover.querySelector('.c-dot.prev');
  const show = px => {
    const i = n > 1 ? Math.max(0, Math.min(n - 1, Math.round((px - m.l) / iw * (n - 1)))) : 0;
    hover.style.display = ''; tip.style.display = '';
    cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(vals[i]));
    if (pdot) { pdot.setAttribute('cx', x(i)); pdot.setAttribute('cy', y(prev.values[i] || 0)); }
    tip.innerHTML = `<b>${series.tips[i]}</b>
      <span><i class="k-cur"></i>${money(vals[i])} <small>${series.counts[i]} order${series.counts[i] === 1 ? '' : 's'}</small></span>
      ${prev ? `<span><i class="k-prev"></i>${money(prev.values[i] || 0)} <small>${prev.tips[i] || 'before'}</small></span>` : ''}`;
    const tw = tip.offsetWidth, left = x(i) + 14 + tw > W ? x(i) - tw - 14 : x(i) + 14;
    tip.style.left = Math.max(0, left) + 'px'; tip.style.top = m.t + 'px';
  };
  const hide = () => { hover.style.display = 'none'; tip.style.display = 'none'; };
  hit.addEventListener('pointermove', e => show(e.clientX - host.getBoundingClientRect().left));
  hit.addEventListener('pointerdown', e => show(e.clientX - host.getBoundingClientRect().left));
  hit.addEventListener('pointerleave', hide);
}
