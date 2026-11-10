import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB, rbPromoState } from '../lib/db';
import type { Customer, Message, Order, OrderStatus, Product, Settings } from '../lib/types';
import { AdminIcon } from './AdminIcon';
import { analyze, loadBiz, type Biz } from './biz';
import { money, moneyD, whenFull } from './format';
import { bucketSeries, previousWindow, periodWindow, pctChange, type RangeKey } from './metrics';
import { TrendChart } from './TrendChart';
import { useAdminGo } from './Shell';
import { openItem } from './admin.js';
import { CustomerTag } from './ui/bits';

const DAY = 864e5;
const RANGES: [RangeKey, string][] = [['today', 'Today'], ['7d', '7 days'], ['30d', '30 days'], ['90d', '90 days'], ['month', 'This month'], ['all', 'All time'], ['custom', 'Custom']];
const RANGE_TEXT: Record<RangeKey, string> = { today: 'today', '7d': 'the last 7 days', '30d': 'the last 30 days', '90d': 'the last 90 days', month: 'this month', all: 'all time', custom: 'the selected dates' };
const RANGE_SHORT: Record<RangeKey, string> = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days', month: 'This month', all: 'All time', custom: 'Selected dates' };
const STATUSES: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
const STATUS_LABEL: Record<OrderStatus, string> = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled' };
const STATUS_HINT: Record<OrderStatus, string> = { pending: 'waiting for you to confirm', confirmed: 'ready to pack and send', shipped: 'on the way', delivered: 'completed', cancelled: 'not fulfilled' };

const sum = <T,>(list: T[], f: (x: T) => unknown) => list.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const stockOf = (p: Product) => p.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

interface Data { biz: Biz; customers: Customer[]; messages: Message[]; settings: Settings; at: number }

function useDashData() {
  return useQuery<Data>({
    queryKey: ['dash-data'],
    staleTime: 0,
    refetchOnMount: 'always',
    queryFn: async () => {
      const [biz, cr, sr, mr] = await Promise.all([loadBiz(), RB_DB.customers(), RB_DB.settings(), RB_DB.messages()]);
      return { biz, customers: cr.ok ? cr.data : [], settings: sr.ok ? sr.data : {}, messages: mr.ok ? mr.data : [], at: Date.now() };
    }
  });
}

interface Action { tone: 'warn' | 'info' | 'bad'; icon: string; n: number; title: string; sub: string; cta: string; run: () => void }

function Delta({ curr, prev }: { curr: number; prev: number | null | undefined }) {
  const c = pctChange(curr, prev);
  if (c == null) return <span className="d-delta flat">no earlier data to compare</span>;
  if (Math.abs(c) < 0.5) return <span className="d-delta flat">→ level with the period before</span>;
  return <span className={'d-delta ' + (c > 0 ? 'up' : 'down')}>{c > 0 ? '▲' : '▼'} {Math.abs(c) >= 1000 ? '999+' : Math.abs(c).toFixed(0)}% <i>vs the period before</i></span>;
}

function Bars({ rows, fmt }: { rows: { label: string; sub?: string; value: number; item?: string }[]; fmt: (n: number) => string }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  return (
    <div className="d-bars">
      {rows.map(r => (
        <div className="d-bar" key={r.label} title={`${r.label} — ${fmt(r.value)}`} data-item={r.item}
          onClick={r.item ? () => openItem(r.item) : undefined} style={r.item ? { cursor: 'pointer' } : undefined}>
          <span className="d-bar-label">{r.label}{r.sub && <small>{r.sub}</small>}</span>
          <span className="d-bar-track"><span className="d-bar-fill" style={{ width: `${Math.max(1.5, r.value / max * 100).toFixed(1)}%` }} /></span>
          <b className="d-bar-value">{fmt(r.value)}</b>
        </div>
      ))}
    </div>
  );
}

const Signed = ({ n }: { n: number }) => <span className={n > 0 ? 'pos' : n < 0 ? 'neg' : ''}>{n < 0 ? '−' : ''}{moneyD(Math.abs(n))}</span>;
const Minus = ({ n }: { n: number }) => (n ? <span className="neg">−{moneyD(n)}</span> : <>{moneyD(0)}</>);

/* The first screen of the panel, planned around three questions, top to bottom:
   1. What needs me right now?  → action list + order pipeline
   2. How is the shop doing?    → KPIs against the period before, sales trend
   3. Where is the money?       → profit statement, aisles, best sellers, stock */
export default function Dashboard() {
  const go = useAdminGo();
  const qc = useQueryClient();
  const { data, isLoading, error } = useDashData();
  const [range, setRange] = useState<RangeKey>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const view = useMemo(() => {
    if (!data) return null;
    const { biz, customers, messages, settings, at: now } = data;
    const { products, orders, cats } = biz;
    const threshold = Number(settings.low_stock_threshold || 5);
    const live = (o: Order) => o.status !== 'cancelled';
    const catName = (slug: string) => cats.find(c => c.slug === slug)?.name ?? slug ?? 'Other';
    const pById = Object.fromEntries(products.map(p => [p.id, p]));
    const first = orders.length ? Math.min(...orders.map(o => +new Date(o.placed_at))) : now - 30 * DAY;

    const win = periodWindow(range, { from, to, first, now });
    const prevWin = range === 'all' ? null : previousWindow(win);
    const inWin = (o: Order, w: { from: number; to: number }) => { const t = +new Date(o.placed_at); return t >= w.from && t <= w.to; };
    const cur = orders.filter(o => inWin(o, win)), curLive = cur.filter(live);
    const prev = prevWin ? orders.filter(o => inWin(o, prevWin)) : null, prevLive = prev ? prev.filter(live) : null;

    const sales = sum(curLive, o => o.total), prevSales = prevLive ? sum(prevLive, o => o.total) : null;
    const aov = curLive.length ? sales / curLive.length : 0;
    const prevAov = prevLive && prevLive.length ? (prevSales ?? 0) / prevLive.length : null;
    const A = analyze(biz, { from: new Date(win.from), to: new Date(win.to) }), T = A.tot;
    const prevNet = prevWin ? analyze(biz, { from: new Date(prevWin.from), to: new Date(prevWin.to) }).tot.net : null;
    const newCustomers = customers.filter(c => { const t = +new Date(c.created_at ?? 0); return t >= win.from && t <= win.to; }).length;

    const pts = (l: Order[]) => l.map(o => ({ at: +new Date(o.placed_at), value: Number(o.total) || 0 }));
    const series = bucketSeries(pts(curLive), win);
    const prevSeries = prevWin && prevLive ? bucketSeries(pts(prevLive), { ...prevWin, unit: series.unit, count: series.values.length }) : null;

    const byCat: Record<string, number> = {}, byProd: Record<string, { rev: number; qty: number; id?: string | null }> = {};
    curLive.forEach(o => (o.items ?? []).forEach(i => {
      const rev = (Number(i.unit_price) || 0) * (Number(i.qty) || 0);
      const p = i.product_id ? pById[i.product_id] : undefined;
      const k = p ? p.cat : '—';
      byCat[k] = (byCat[k] || 0) + rev;
      const e = (byProd[i.product_name] ??= { rev: 0, qty: 0, id: i.product_id });
      e.rev += rev; e.qty += Number(i.qty) || 0;
    }));

    const pending = orders.filter(o => o.status === 'pending'), confirmed = orders.filter(o => o.status === 'confirmed');
    const unpaid = orders.filter(o => o.status === 'delivered' && o.payment_status !== 'paid' && o.payment_status !== 'refunded');
    const unread = messages.filter(m => m.sender !== 'admin' && !m.read_by_admin);
    const shop = products.filter(p => p.active !== false);
    const out = shop.filter(p => stockOf(p) === 0), low = shop.filter(p => stockOf(p) > 0 && stockOf(p) <= threshold);
    const ending = products.filter(p => rbPromoState(p) === 'active' && p.promo_end && +new Date(p.promo_end) - now < 2 * DAY);
    const oldest = pending.length ? Math.max(...pending.map(o => now - +new Date(o.placed_at))) : 0;
    const age = (ms: number) => ms >= DAY ? `${Math.floor(ms / DAY)}d` : `${Math.max(1, Math.floor(ms / 36e5))}h`;
    const plural = (n: number, w: string) => `${w}${n === 1 ? '' : 's'}`;
    const actions = ([
      pending.length && { tone: 'warn', icon: 'cart', n: pending.length, title: `${plural(pending.length, 'order')} to confirm`, sub: `oldest has waited ${age(oldest)}`, cta: 'Review', run: () => go('orders', { status: 'pending' }) },
      confirmed.length && { tone: 'info', icon: 'box', n: confirmed.length, title: `${plural(confirmed.length, 'order')} to pack and ship`, sub: 'confirmed, not yet sent', cta: 'Open', run: () => go('orders', { status: 'confirmed' }) },
      unread.length && { tone: 'info', icon: 'mail', n: unread.length, title: `unread ${plural(unread.length, 'message')}`, sub: 'customers waiting for a reply', cta: 'Reply', run: () => go('messages') },
      out.length && { tone: 'bad', icon: 'chart', n: out.length, title: `${plural(out.length, 'product')} sold out`, sub: 'still visible in the shop', cta: 'Restock', run: () => go('inventory') },
      low.length && { tone: 'warn', icon: 'chart', n: low.length, title: `${plural(low.length, 'product')} running low`, sub: `${threshold} units or fewer`, cta: 'Check', run: () => go('inventory') },
      unpaid.length && { tone: 'warn', icon: 'ticket', n: unpaid.length, title: `delivered ${plural(unpaid.length, 'order')} not marked paid`, sub: `${money(sum(unpaid, o => o.total))} to collect or record`, cta: 'Open', run: () => go('orders', { status: 'delivered' }) },
      ending.length && { tone: 'info', icon: 'flame', n: ending.length, title: `${plural(ending.length, 'promotion')} ending within 48h`, sub: 'prices return to normal on their own', cta: 'View', run: () => go('hotdeals') }
    ].filter(Boolean)) as Action[];

    return {
      cur, curLive, sales, prevSales, prevOrders: prevLive ? prevLive.length : null, aov, prevAov, T, prevNet, newCustomers, series, prevSeries, prevWin, customers,
      cats: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([slug, value]) => ({ label: catName(slug), value })),
      prods: Object.entries(byProd).sort((a, b) => b[1].rev - a[1].rev).slice(0, 6)
        .map(([label, v]) => ({ label, sub: `${v.qty} sold`, value: v.rev, item: v.id && pById[v.id] ? v.id : undefined })),
      stockRows: shop.filter(p => stockOf(p) <= threshold).sort((a, b) => stockOf(a) - stockOf(b)).slice(0, 6).map(p => ({ p, name: catName(p.cat) })),
      pipe: STATUSES.map(s => ({ s, n: cur.filter(o => o.status === s).length })),
      actions, needsUpgrade: biz.needsUpgrade
    };
  }, [data, range, from, to, go]);

  const changed = () => void qc.invalidateQueries({ queryKey: ['dash-data'] });
  const hour = new Date().getHours();  
  const hello = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  if (isLoading || !view) {
    return (
      <main className="main" id="view">
        <div className="d-head"><div><h1>Dashboard</h1><p>{error ? `Couldn't load: ${(error as Error).message}` : 'Loading the latest numbers…'}</p></div></div>
        <div className="d-grid d-top"><div className="card sk" style={{ height: 230 }} /><div className="card sk" style={{ height: 230 }} /></div>
        <div className="d-kpis">{Array.from({ length: 5 }, (_, i) => <div key={i} className="d-kpi sk" style={{ height: 112 }} />)}</div>
        <div className="card sk" style={{ height: 300 }} />
      </main>
    );
  }
  const { T, series, prevSeries, prevWin } = view;
  const pipeMax = Math.max(1, ...view.pipe.map(x => x.n));

  return (
    <main className="main" id="view">
      <div className="d-head">
        <div>
          <h1>{hello}</h1>
          <p>Here is how the shop is doing in <b>{RANGE_TEXT[range]}</b>. <span className="d-asof">Updated {whenFull(new Date())}</span></p>
        </div>
        <div className="d-range">
          <div className="seg" id="d-range" role="group" aria-label="Date range">
            {RANGES.map(([k, l]) => (
              <button key={k} data-r={k} className={range === k ? 'on' : ''} onClick={() => {
                setRange(k);
                if (k === 'custom' && !from) {
                  const iso = (t: number) => { const x = new Date(t); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
                  setFrom(iso(Date.now() - 13 * DAY)); setTo(iso(Date.now()));
                }
              }}>{l}</button>
            ))}
          </div>
          {range === 'custom' && (
            <div className="d-custom">
              <input type="date" aria-label="From" value={from} onChange={e => setFrom(e.target.value)} />
              <span>to</span>
              <input type="date" aria-label="To" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          )}
        </div>
      </div>
      {view.needsUpgrade && (
        <div className="notice"><b>One-time database step needed.</b> Run <code>sql/pending/2026-11-10_run_when_supabase_resumes.sql</code> in the Supabase SQL editor to switch on cost history, wastage, expenses and real profit tracking.</div>
      )}

      <section className="d-grid d-top">
        <div className="card d-actions">
          <div className="d-card-head"><h3>Needs you now</h3><span className="d-note">not tied to the date range</span></div>
          {view.actions.length ? (
            <ul>
              {view.actions.map(a => (
                <li key={a.title} className={'d-act ' + a.tone} tabIndex={0} role="button" onClick={a.run}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); a.run(); } }}>
                  <span className="d-act-icon"><AdminIcon name={a.icon} /></span>
                  <span className="d-act-text"><b><em>{a.n}</em> {a.title}</b><small>{a.sub}</small></span>
                  <span className="d-act-cta">{a.cta} →</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="d-clear"><AdminIcon name="leaf" /><b>All clear</b><span>No orders waiting, no unread messages, shelves are stocked.</span></div>
          )}
        </div>
        <div className="card d-pipe">
          <div className="d-card-head"><h3>Order pipeline</h3><span className="d-note">{view.cur.length} placed in range · click a stage</span></div>
          <div className="d-pipe-rows">
            {view.pipe.map(x => (
              <button key={x.s} className={'d-stage st-' + x.s} title={`${STATUS_LABEL[x.s]}: ${x.n}`} onClick={() => go('orders', { status: x.s })}>
                <span className="d-stage-name"><i />{STATUS_LABEL[x.s]}<small>{STATUS_HINT[x.s]}</small></span>
                <span className="d-stage-track"><span style={{ width: `${x.n ? Math.max(3, x.n / pipeMax * 100).toFixed(1) : 0}%` }} /></span>
                <b>{x.n}</b>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="d-kpis">
        <div className="d-kpi"><span>Sales</span><b>{money(view.sales)}</b>
          {prevWin ? <Delta curr={view.sales} prev={view.prevSales} /> : <span className="d-delta flat">all orders except cancelled</span>}
          <small>order totals incl. delivery, excl. cancelled</small></div>
        <div className="d-kpi"><span>Orders</span><b>{view.curLive.length}</b>
          {prevWin ? <Delta curr={view.curLive.length} prev={view.prevOrders} /> : <span className="d-delta flat">&nbsp;</span>}
          <small>{view.cur.length - view.curLive.length} cancelled · {view.cur.filter(o => o.is_guest).length} from guests</small></div>
        <div className="d-kpi"><span>Average order</span><b>{money(view.aov)}</b>
          {prevWin ? <Delta curr={view.aov} prev={view.prevAov} /> : <span className="d-delta flat">&nbsp;</span>}
          <small>sales ÷ orders</small></div>
        <div className="d-kpi"><span>Net profit</span><b className={T.net < 0 ? 'neg' : ''}>{T.net < 0 ? '−' : ''}{money(Math.abs(T.net))}</b>
          {prevWin ? <Delta curr={T.net} prev={view.prevNet} /> : <span className="d-delta flat">&nbsp;</span>}
          <small>delivered orders · margin {T.margin == null ? '—' : `${Math.round(T.margin * 10) / 10}%`}</small></div>
        <div className="d-kpi"><span>Customers</span><b>{view.customers.length}</b><span className="d-delta flat">{view.newCustomers} joined in range</span>
          <small>registered accounts</small></div>
      </section>

      <section className="card d-trend">
        <div className="d-card-head">
          <div><h3>Sales over time</h3><span className="d-note">{series.unitLabel} totals · cancelled orders excluded</span></div>
          <div className="d-legend"><span><i className="k-cur" />{RANGE_SHORT[range]}</span>{prevSeries && <span><i className="k-prev" />Period before</span>}</div>
        </div>
        <TrendChart series={series} prev={prevSeries} label={`Sales per ${series.unitLabel.toLowerCase()} for ${RANGE_TEXT[range]}: total ${money(view.sales)}`} />
      </section>

      <section className="d-grid d-two">
        <div className="card d-pl">
          <div className="d-card-head"><h3>Profit statement</h3><span className="d-note">delivered orders in range</span></div>
          <div className="d-pl-row"><span>Revenue from delivered items</span><b>{moneyD(T.revenue)}</b></div>
          <div className="d-pl-row"><span>Cost of goods sold</span><b><Minus n={T.cogs} /></b></div>
          <div className="d-pl-row total"><span>Gross profit</span><b><Signed n={T.gross} /></b></div>
          <div className="d-pl-row"><span>Wastage</span><b><Minus n={T.waste} /></b></div>
          <div className="d-pl-row"><span>One-off expenses</span><b><Minus n={T.expenses} /></b></div>
          <div className="d-pl-row"><span>Coupons given</span><b><Minus n={T.coupons} /></b></div>
          <div className="d-pl-row grand"><span>Net profit</span><b><Signed n={T.net} /></b></div>
          {T.estUnits > 0 && <p className="d-foot">{T.estUnits} unit(s) were sold before cost tracking; their cost is estimated from today's cost.</p>}
          <div className="d-pl-side">
            <div><span>Stock on hand, at cost</span><b>{moneyD(T.stockCost)}</b></div>
            <div><span>Profit if it all sells</span><b><Signed n={T.potential} /></b></div>
            <div><span>Profit in undelivered orders</span><b><Signed n={T.pGross} /></b></div>
          </div>
          <Link className="link-btn" to="/admin/inventory">Break it down by item and aisle →</Link>
        </div>
        <div className="card">
          <div className="d-card-head"><h3>Sales by aisle</h3><span className="d-note">items ordered in range</span></div>
          {view.cats.length ? <Bars rows={view.cats} fmt={money} /> : <div className="empty">No sales in this range yet.</div>}
          <div className="d-card-head" style={{ marginTop: 22 }}><h3>Best sellers</h3><span className="d-note">by revenue</span></div>
          {view.prods.length ? <Bars rows={view.prods} fmt={money} /> : <div className="empty">No sales in this range yet.</div>}
        </div>
      </section>

      <section className="d-grid d-two wide-left">
        <div className="card">
          <div className="d-card-head"><h3>Latest orders</h3><Link className="link-btn" to="/admin/orders">All orders →</Link></div>
          {view.cur.length ? (
            <div className="tablewrap flat"><table>
              <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th className="num">Total</th><th>Status</th></tr></thead>
              <tbody>{view.cur.slice(0, 7).map(o => (
                <tr key={o.id} className="clickrow" onClick={() => go('orders', { openOrder: o.id })}>
                  <td><b>{o.order_code}</b><br /><small className="a-mute">{whenFull(o.placed_at)}</small></td>
                  <td>{o.contact_name}<br /><CustomerTag o={o} /></td>
                  <td>{sum(o.items ?? [], i => i.qty)}</td>
                  <td className="num">{money(o.total)}</td>
                  <td><span className={'pill ' + o.status}>{o.status}</span></td>
                </tr>))}
              </tbody></table></div>
          ) : <div className="empty">No orders in this range.</div>}
        </div>
        <div className="card">
          <div className="d-card-head"><h3>Stock to watch</h3><Link className="link-btn" to="/admin/inventory">Inventory →</Link></div>
          {view.stockRows.length ? (
            <ul className="d-stock">{view.stockRows.map(({ p, name }) => (
              <li key={p.id} tabIndex={0} role="button" onClick={() => openItem(p.id, { onChange: changed })}
                onKeyDown={e => { if (e.key === 'Enter') openItem(p.id, { onChange: changed }); }}>
                <span><b>{p.name}</b><small>{name}</small></span>
                <span className={'pill ' + (stockOf(p) === 0 ? 'zero' : 'low')}>{stockOf(p) === 0 ? 'Sold out' : `${stockOf(p)} left`}</span>
              </li>))}</ul>
          ) : <div className="empty">Every product is well stocked.</div>}
        </div>
      </section>
    </main>
  );
}
