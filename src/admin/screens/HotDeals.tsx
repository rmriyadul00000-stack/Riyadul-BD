import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RB_DB, rbPromoState, rbResolveForShop } from '../../lib/db';
import type { Product } from '../../lib/types';
import { moneyD, when } from '../format';
import { useAdminUi } from '../AdminUi';
import { PromoBadge, effectiveDiscount, fromLocalInput, minDefPrice, minEffPrice, stockOf, toLocalInput } from '../productHelpers';
import { useCategoriesAdmin, useProductsAdmin, useSettingsAdmin } from '../queries';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

type Status = 'all' | 'listed' | 'delisted' | 'promo' | 'soon' | 'ended';
const CHIPS: [Status, string][] = [['all', 'All'], ['listed', 'Listed'], ['delisted', 'Delisted'], ['promo', 'Promo running'], ['soon', 'Ending soon'], ['ended', 'Promo ended']];
type SortKey = 'manual' | 'discount' | 'ending' | 'stock' | 'name';

const discNow = (p: Product) => effectiveDiscount(rbResolveForShop(p));

function BulkPromo({ chosen, nextSort, onClose, onDone }: { chosen: Product[]; nextSort: () => number; onClose: () => void; onDone: () => void }) {
  const [pct, setPct] = useState('');
  const [start, setStart] = useState(() => toLocalInput(new Date().toISOString()));
  const [end, setEnd] = useState(() => toLocalInput(new Date(Date.now() + 7 * 864e5).toISOString()));
  const [list, setList] = useState(true), [auto, setAuto] = useState(true);
  async function apply() {
    const n = Number(pct || 0);
    if (n < 1 || n > 95) return toast('Enter a discount between 1 and 95.', true);
    if (start && end && new Date(end) <= new Date(start)) return toast('The end must be after the start.', true);
    let sort = nextSort();
    const rs = await Promise.all(chosen.map(p => RB_DB.saveProduct({
      ...p,
      variants: p.variants.map(v => { const base = Number(v.mrp) > 0 ? Number(v.mrp) : Number(v.price) || 0; return { ...v, promo_price: Math.round(base * (1 - n / 100)) }; }),
      promo_start: fromLocalInput(start), promo_end: fromLocalInput(end), hot_deal_auto: auto,
      ...(list && !p.hot_deal ? { hot_deal: true, hot_deal_sort: sort++ } : {})
    })));
    const bad = rs.find(r => !r.ok); if (bad && !bad.ok) return toast(bad.error, true);
    toast('Promotion scheduled.'); onDone(); onClose();
  }
  return (
    <Modal title={`Schedule a promotion for ${chosen.length} product(s)`} onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>Cancel</button><button className="btn" onClick={apply}>Apply promotion</button></>}>
      <p className="hint">Sets a promo price on every size: the percentage comes off the “Was” price when there is one, otherwise off the default price. When the end time passes, each size returns to its default price and badge on its own.</p>
      <div className="grid3">
        <div className="field"><label>Discount %</label><input type="number" min={1} max={95} placeholder="e.g. 20" value={pct} onChange={e => setPct(e.target.value)} /></div>
        <div className="field"><label>Starts</label><input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div className="field"><label>Ends</label><input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <label className="check"><input type="checkbox" checked={list} onChange={e => setList(e.target.checked)} /> Also list them in Hot Deals</label>
      <label className="check"><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> Remove them from Hot Deals automatically when the promo ends</label>
    </Modal>
  );
}

export default function HotDeals() {
  const qc = useQueryClient();
  const ui = useAdminUi();
  const { data: products = [], dataUpdatedAt } = useProductsAdmin();
  const { data: cats = [] } = useCategoriesAdmin();
  const { data: settings = {} } = useSettingsAdmin();
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [status, setStatus] = useState<Status>('all'), [sortKey, setSortKey] = useState<SortKey>('manual');
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState<string | null>(null);
  const [promoOpen, setPromoOpen] = useState(false);
  const reload = () => void qc.invalidateQueries();

  const endsSoon = (p: Product) => rbPromoState(p) === 'active' && !!p.promo_end && +new Date(p.promo_end) - dataUpdatedAt < 48 * 36e5;
  const listed = useMemo(() => products.filter(p => p.hot_deal).sort((a, b) => (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0)), [products]);
  const lids = listed.map(p => p.id);
  const nextSort = () => Math.max(0, ...products.filter(p => p.hot_deal).map(p => p.hot_deal_sort || 0)) + 1;

  const visible = useMemo(() => {
    const s = q.toLowerCase();
    const l = products.filter(p => {
      if (cat && p.cat !== cat) return false;
      if (status === 'listed' && !p.hot_deal) return false;
      if (status === 'delisted' && p.hot_deal) return false;
      if (status === 'promo' && rbPromoState(p) !== 'active') return false;
      if (status === 'soon' && !(rbPromoState(p) === 'active' && p.promo_end && +new Date(p.promo_end) - dataUpdatedAt < 48 * 36e5)) return false;
      if (status === 'ended' && rbPromoState(p) !== 'expired') return false;
      return !s || p.name.toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s) || p.cat.toLowerCase().includes(s) || (p.name_bn || '').includes(q);
    });
    const byName = (a: Product, b: Product) => a.name.localeCompare(b.name);
    if (sortKey === 'manual') l.sort((a, b) => Number(!!b.hot_deal) - Number(!!a.hot_deal) || (a.hot_deal ? (a.hot_deal_sort || 0) - (b.hot_deal_sort || 0) : byName(a, b)));
    else if (sortKey === 'discount') l.sort((a, b) => (discNow(b) || 0) - (discNow(a) || 0));
    else if (sortKey === 'ending') { const e = (p: Product) => (p.promo_end && rbPromoState(p) === 'active' ? +new Date(p.promo_end) : Infinity); l.sort((a, b) => e(a) - e(b)); }
    else if (sortKey === 'stock') l.sort((a, b) => stockOf(a) - stockOf(b));
    else l.sort(byName);
    return l;
  }, [products, q, cat, status, sortKey, dataUpdatedAt]);

  const chosen = () => [...sel].map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p);
  const failed = (rs: { ok: boolean; error?: string }[]) => { const bad = rs.find(r => !r.ok); if (bad) { toast(bad.error ?? 'Failed', true); return true; } return false; };
  const avg = listed.length ? Math.round(listed.reduce((s, p) => s + (discNow(p) || 0), 0) / listed.length) : 0;

  async function move(id: string, dir: -1 | 1) {
    const i = lids.indexOf(id), j = i + dir; if (j < 0 || j >= lids.length) return;
    /* re-number the whole list so equal or missing order values can never block a move */
    const order = lids.slice(); [order[i], order[j]] = [order[j], order[i]];
    const rs = await Promise.all(order.map((pid, n) => { const p = products.find(x => x.id === pid)!; return (p.hot_deal_sort || 0) === n + 1 ? Promise.resolve({ ok: true as const }) : RB_DB.saveProduct({ ...p, hot_deal_sort: n + 1 }); }));
    if (!failed(rs)) reload();
  }

  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Hot Deals</h1><p>Every product is listed below. Add or remove it from the Hot Deals section, schedule a promotion, and set the order.</p></div>
        <div className="bar-actions"><a className="btn ghost sm" href="/products?hotdeals=1" target="_blank" rel="noopener noreferrer">View on shop ↗</a></div></div>
      <div className="stats v2">
        <div className="stat v2"><span>Listed</span><b>{listed.length}</b><i>showing in Hot Deals</i></div>
        <div className="stat v2"><span>Delisted</span><b>{products.length - listed.length}</b><i>available to add</i></div>
        <div className="stat v2"><span>Promotions running</span><b>{products.filter(p => rbPromoState(p) === 'active').length}</b><i>{products.filter(endsSoon).length} ending within 48h</i></div>
        <div className="stat v2"><span>Average discount</span><b>{avg}%</b><i>across listed items</i></div>
        <div className="stat v2"><span>Listed but sold out</span><b>{listed.filter(p => stockOf(p) === 0).length}</b><i>consider removing</i></div>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Section name</h3>
        <div className="inline-form"><label className="field grow" style={{ margin: 0 }}><input value={title ?? String(settings.hotdeals_title || 'Hot Deals')} onChange={e => setTitle(e.target.value)} /></label>
          <button className="btn sm" onClick={async () => { const r = await RB_DB.saveSetting('hotdeals_title', (title ?? '').trim() || 'Hot Deals'); toast(r.ok ? 'Section name saved.' : r.error, !r.ok); void qc.invalidateQueries({ queryKey: ['settings'] }); }}>Save name</button></div>
      </div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="chips">{CHIPS.map(([k, l]) => <button key={k} className={'chip' + (status === k ? ' on' : '')} onClick={() => setStatus(k)}>{l}</button>)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All aisles</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
          <select value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
            <option value="manual">Sort: shop order</option><option value="discount">Biggest discount</option><option value="ending">Promo ending soonest</option><option value="stock">Lowest stock</option><option value="name">Name A–Z</option></select></div>
      </div>
      <div className="toolbar"><input type="search" placeholder="Search by name, SKU or aisle" value={q} onChange={e => setQ(e.target.value.trim())} /></div>
      <div className={'bulkbar' + (sel.size ? ' on' : '')}><b>{sel.size} selected</b>
        <button className="btn sm" onClick={async () => { let n = nextSort(); const rs = await Promise.all(chosen().filter(p => !p.hot_deal).map(p => RB_DB.saveProduct({ ...p, hot_deal: true, hot_deal_sort: n++ }))); if (!failed(rs)) { toast(`${rs.length} product(s) added.`); setSel(new Set()); reload(); } }}>Add to Hot Deals</button>
        <button className="btn ghost sm" onClick={async () => { const rs = await Promise.all(chosen().filter(p => p.hot_deal).map(p => RB_DB.saveProduct({ ...p, hot_deal: false }))); if (!failed(rs)) { toast(`${rs.length} product(s) removed.`); setSel(new Set()); reload(); } }}>Remove</button>
        <button className="btn ghost sm" onClick={() => setPromoOpen(true)}>Schedule promotion…</button>
        <button className="btn ghost sm" onClick={async () => { const rs = await Promise.all(chosen().map(p => RB_DB.saveProduct({ ...p, variants: p.variants.map(v => { const c = { ...v }; delete c.promo_price; return c; }), promo_start: null, promo_end: null, hot_deal_auto: false }))); if (!failed(rs)) { toast('Promotions cleared. Default prices are back.'); setSel(new Set()); reload(); } }}>Clear promotion</button>
        <div className="spacer" /><button className="btn ghost sm" onClick={() => setSel(new Set())}>Clear selection</button></div>
      <div className="tablewrap"><table>
        <thead><tr><th className="chkcol"><input type="checkbox" className="headchk" checked={visible.length > 0 && visible.every(p => sel.has(p.id))} onChange={e => setSel(e.target.checked ? new Set(visible.map(p => p.id)) : new Set())} /></th>
          <th>Order</th><th>Product</th><th>Aisle</th><th>Price</th><th>Off</th><th>Promotion</th><th>Stock</th><th>Status</th><th /></tr></thead>
        <tbody>
          {visible.length === 0 && <tr><td colSpan={10}><div className="empty">No products match.</div></td></tr>}
          {visible.map(p => {
            const li = lids.indexOf(p.id), d = discNow(p), stock = stockOf(p), now = minEffPrice(p), def = minDefPrice(p), st = rbPromoState(p);
            return (
              <tr key={p.id}>
                <td className="chkcol"><input type="checkbox" className="rowchk" checked={sel.has(p.id)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} /></td>
                <td>{p.hot_deal ? <div className="rowactions"><span className="pill">#{li + 1}</span>
                  <button className="btn ghost sm" disabled={li === 0} aria-label="Move up" onClick={() => move(p.id, -1)}>↑</button>
                  <button className="btn ghost sm" disabled={li === lids.length - 1} aria-label="Move down" onClick={() => move(p.id, 1)}>↓</button></div> : <small className="a-mute">—</small>}</td>
                <td>{p.images[0] && <img className="thumb" src={p.images[0]} alt="" />} <b>{p.name}</b> <span className="pill">{p.sku || '—'}</span></td>
                <td>{cats.find(c => c.slug === p.cat)?.name ?? p.cat}</td>
                <td>{moneyD(now)}{now !== def && <> <small className="strike">{moneyD(def)}</small></>}</td>
                <td>{d ? <span className="pill cancelled">-{d}%</span> : <small className="a-mute">—</small>}</td>
                <td>{st === 'none' ? <small className="a-mute">none</small> : <PromoBadge p={p} />}
                  {p.promo_end && st !== 'none' && <><br /><small className="a-mute">{p.promo_start ? when(p.promo_start) + ' → ' : 'until '}{when(p.promo_end)}</small></>}
                  {p.hot_deal_auto && <><br /><small className="a-mute">auto-delist</small></>}</td>
                <td><span className={'pill ' + (stock === 0 ? 'zero' : stock <= 5 ? 'low' : '')}>{stock}</span></td>
                <td><span className={'pill ' + (p.hot_deal ? '' : 'off')}>{p.hot_deal ? 'Listed' : 'Delisted'}</span>{p.active === false && <> <span className="pill off">Hidden</span></>}</td>
                <td><div className="rowactions">
                  {p.hot_deal
                    ? <button className="btn red sm" onClick={async () => { const r = await RB_DB.saveProduct({ ...p, hot_deal: false }); toast(r.ok ? 'Removed from Hot Deals.' : r.error, !r.ok); if (r.ok) reload(); }}>Remove</button>
                    : <button className="btn sm" onClick={async () => { const r = await RB_DB.saveProduct({ ...p, hot_deal: true, hot_deal_sort: nextSort() }); toast(r.ok ? 'Added to Hot Deals.' : r.error, !r.ok); if (r.ok) reload(); }}>Add</button>}
                  <button className="btn ghost sm" onClick={() => ui.editProduct(p)}>Promo</button></div></td>
              </tr>);
          })}
        </tbody></table></div>
      {promoOpen && <BulkPromo chosen={chosen()} nextSort={nextSort} onClose={() => setPromoOpen(false)} onDone={() => { setSel(new Set()); reload(); }} />}
    </main>
  );
}
