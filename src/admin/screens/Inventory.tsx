import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB, rbEffPrice, rbPromoState, rbUnitCost } from '../../lib/db';
import type { InventoryLogEntry, Product, Variant } from '../../lib/types';
import { AdminIcon } from '../AdminIcon';
import { useAdminUi } from '../AdminUi';
import { analyze, type Analysis } from '../biz';
import { moneyD, whenFull } from '../format';
import { COST_FIELDS, LOG_LABEL, LOG_PILL, PromoBadge, pctTxt, sgn } from '../productHelpers';
import { useBiz } from '../queries';
import { downloadFile, toCSV } from '../ui/csv';
import { toast } from '../ui/toast';

type Tab = 'items' | 'cats' | 'log';
const PERIODS: [string, string][] = [['all', 'All time'], ['7', '7 days'], ['30', '30 days'], ['90', '90 days']];
const CHIPS: [string, string][] = [['all', 'All'], ['low', 'Low stock'], ['out', 'Out of stock'], ['loss', 'Losing money'], ['nocost', 'No cost set'], ['promo', 'Promo running']];
const Profit = ({ n }: { n: number }) => <b className={sgn(n)}>{n < 0 ? '−' : ''}{moneyD(Math.abs(n))}</b>;

interface Row { name: string; p: Product; v: Variant; vi: number; key: string; uc: number; price: number; pu: number; margin: number | null; stock: number; stockCost: number; potential: number; sold: number; realized: number }

export default function Inventory() {
  const qc = useQueryClient();
  const ui = useAdminUi();
  const { data: biz, dataUpdatedAt } = useBiz();
  const settings = useQuery({ queryKey: ['settings-admin'], staleTime: 0, refetchOnMount: 'always', queryFn: async () => { const r = await RB_DB.settings(); return r.ok ? r.data : {}; } });
  const [tab, setTab] = useState<Tab>('items');
  const [period, setPeriod] = useState('all');
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [chip, setChip] = useState('all');
  const [sort, setSort] = useState<{ key: keyof Row; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [adj, setAdj] = useState({ n: '0', note: '' });
  const [threshold, setThreshold] = useState<number | null>(null);
  const [kind, setKind] = useState(''), [logQ, setLogQ] = useState('');
  const th = threshold ?? Number(settings.data?.low_stock_threshold || 5);
  const reload = () => void qc.invalidateQueries();

  /* "since N days" is anchored at the moment the data arrived, so the view is stable between renders */
  const A: Analysis | null = useMemo(() => {
    if (!biz) return null;
    const from = period === 'all' ? null : new Date(dataUpdatedAt - Number(period) * 864e5);
    return analyze(biz, from ? { from, to: null } : null);
  }, [biz, period, dataUpdatedAt]);

  const rows: Row[] = useMemo(() => {
    if (!biz || !A) return [];
    let flat: Row[] = [];
    biz.products.forEach(p => p.variants.forEach((v, vi) => {
      const key = p.id + '|' + v.label, va = A.V[key] ?? A.blank();
      const uc = rbUnitCost(v), price = rbEffPrice(p, v), stock = Number(v.stock) || 0;
      flat.push({ name: p.name.toLowerCase(), p, v, vi, key, uc, price, pu: price - uc, margin: price ? (price - uc) / price * 100 : null, stock, stockCost: stock * uc, potential: stock * (price - uc), sold: va.units, realized: va.gross });
    }));
    const s = q.trim().toLowerCase();
    flat = flat.filter(r => {
      if (cat && r.p.cat !== cat) return false;
      if (chip === 'low' && !(r.stock > 0 && r.stock <= th)) return false;
      if (chip === 'out' && r.stock !== 0) return false;
      if (chip === 'loss' && !(r.pu < 0)) return false;
      if (chip === 'nocost' && r.uc !== 0) return false;
      if (chip === 'promo' && rbPromoState(r.p) !== 'active') return false;
      return !s || r.p.name.toLowerCase().includes(s) || (r.p.sku || '').toLowerCase().includes(s) || r.p.cat.toLowerCase().includes(s) || r.v.label.toLowerCase().includes(s);
    });
    if (sort) flat.sort((a, b) => { const x = (a[sort.key] ?? -Infinity) as number, y = (b[sort.key] ?? -Infinity) as number; return (x > y ? 1 : x < y ? -1 : 0) * sort.dir; });
    return flat;
  }, [biz, A, q, cat, chip, sort, th]);

  if (!biz || !A) return <main className="main" id="view"><div className="bar"><div><h1>Inventory Management</h1><p>Loading…</p></div></div></main>;
  const T = A.tot;
  let alerts = 0, losing = 0, noCost = 0;
  biz.products.forEach(p => p.variants.forEach(v => { if ((Number(v.stock) || 0) <= th) alerts++; if (rbEffPrice(p, v) - rbUnitCost(v) < 0) losing++; if (!rbUnitCost(v)) noCost++; }));
  const catName = (slug: string) => biz.cats.find(c => c.slug === slug)?.name ?? slug;
  const pName = (id: string) => biz.products.find(p => p.id === id)?.name ?? '(deleted item)';

  async function setStock(r: Row, raw: string) {
    const before = Number(r.v.stock) || 0, after = Math.max(0, Math.round(Number(raw || 0)));
    if (before === after) return;
    const res = await RB_DB.saveProduct({ ...r.p, variants: r.p.variants.map((v, i) => i === r.vi ? { ...v, stock: after } : v) });
    if (!res.ok) return toast(res.error, true);
    await RB_DB.addInventoryLog({ product_id: r.p.id, variant_label: r.v.label, kind: 'adjustment', qty: after - before, note: 'Edited in inventory table' });
    toast('Stock saved.'); reload();
  }
  async function bulkAdjust() {
    const delta = Math.round(Number(adj.n || 0));
    if (!delta || !sel.size) return toast('Select rows and enter a non-zero amount.', true);
    const byP: Record<string, string[]> = {};
    [...sel].forEach(k => { const [pid, label] = k.split('|'); (byP[pid] ??= []).push(label); });
    for (const pid of Object.keys(byP)) {
      const p = biz!.products.find(x => x.id === pid); if (!p) continue;
      const r = await RB_DB.saveProduct({ ...p, variants: p.variants.map(v => byP[pid].includes(v.label) ? { ...v, stock: Math.max(0, (Number(v.stock) || 0) + delta) } : v) });
      if (!r.ok) return toast(r.error, true);
      for (const label of byP[pid]) await RB_DB.addInventoryLog({ product_id: pid, variant_label: label, kind: 'adjustment', qty: delta, note: adj.note.trim() || 'Bulk adjustment' });
    }
    toast(`Adjusted ${sel.size} size(s).`); setSel(new Set()); reload();
  }
  const exportItems = () => downloadFile('inventory.csv', toCSV(rows, [
    { label: 'SKU', get: r => r.p.sku }, { label: 'Item', get: r => r.p.name }, { label: 'Size', get: r => r.v.label }, { label: 'Aisle', get: r => r.p.cat }, { label: 'Stock', get: r => r.stock },
    ...COST_FIELDS.map(([k, l]) => ({ label: l, get: (r: Row) => (r.v[k] as number) || 0 })),
    { label: 'Unit cost', get: r => r.uc }, { label: 'Price now', get: r => r.price }, { label: 'Profit per unit', get: r => r.pu },
    { label: 'Margin %', get: r => r.margin == null ? '' : r.margin.toFixed(1) }, { label: 'Stock cost', get: r => r.stockCost },
    { label: 'Potential profit', get: r => r.potential }, { label: 'Units sold', get: r => r.sold }, { label: 'Realized profit', get: r => r.realized }
  ]), 'text/csv');

  const sortTh = (k: keyof Row, l: string) => (
    <th className={'sortable' + (sort?.key === k ? ' active' : '')} onClick={() => setSort(s => s?.key === k ? { key: k, dir: s.dir === 1 ? -1 : 1 } : { key: k, dir: 1 })}>{l} <span className="arrow">{sort?.key === k ? (sort.dir > 0 ? '↑' : '↓') : '↕'}</span></th>);
  const sum = rows.reduce((t, r) => ({ stock: t.stock + r.stock, cost: t.cost + r.stockCost, pot: t.pot + r.potential, sold: t.sold + r.sold, real: t.real + r.realized }), { stock: 0, cost: 0, pot: 0, sold: 0, real: 0 });

  const logList = biz.logs.filter((l: InventoryLogEntry) => (!kind || l.kind === kind) && (!logQ.trim() || pName(l.product_id).toLowerCase().includes(logQ.trim().toLowerCase()) || (l.note || '').toLowerCase().includes(logQ.trim().toLowerCase()) || (l.variant_label || '').toLowerCase().includes(logQ.trim().toLowerCase())));
  const catRows = biz.cats.map(c => ({ c, a: A.C[c.slug] ?? A.blank(), n: biz.products.filter(p => p.cat === c.slug).length })).sort((x, y) => y.a.net - x.a.net);
  const maxAbs = Math.max(1, ...catRows.map(r => Math.abs(r.a.net)));

  return (
    <main className="main" id="view">
      <div className="bar">
        <div><h1>Inventory Management</h1><p>Stock, every cost, profit and loss, and the full history of each item. Click any item for its detail page.</p></div>
        <div className="bar-actions"><div className="seg">{PERIODS.map(([k, l]) => <button key={k} className={period === k ? 'on' : ''} onClick={() => setPeriod(k)}>{l}</button>)}</div></div>
      </div>
      {biz.needsUpgrade && <div className="notice"><b>One-time database step needed.</b> Run <code>sql/pending/2026-11-10_run_when_supabase_resumes.sql</code> in the Supabase SQL editor to switch on cost history, wastage, expenses and real profit tracking.</div>}
      <div className="stats v2">
        <div className="stat v2"><span>Stock value (at cost)</span><b>{moneyD(T.stockCost)}</b><i>{T.stockUnits} units on hand</i></div>
        <div className="stat v2"><span>Stock value (at price)</span><b>{moneyD(T.stockValue)}</b><i>if it all sold today</i></div>
        <div className="stat v2"><span>Potential profit</span><b className={sgn(T.potential)}>{moneyD(T.potential)}</b><i>value minus cost</i></div>
        <div className="stat v2"><span>Realized net profit</span><b className={sgn(T.net)}>{moneyD(T.net)}</b><i>{period === 'all' ? 'all time' : `last ${period} days`}, delivered orders</i></div>
        <div className="stat v2"><span>Gross profit</span><b className={sgn(T.gross)}>{moneyD(T.gross)}</b><i>margin {pctTxt(T.margin)}</i></div>
        <div className="stat v2"><span>Wastage &amp; expenses</span><b className={T.waste + T.expenses ? 'neg' : ''}>{moneyD(T.waste + T.expenses)}</b><i>{T.wasteQty} unit(s) lost</i></div>
        <div className="stat v2"><span>Stock alerts</span><b>{alerts}</b><i>at or below {th} units</i></div>
        <div className="stat v2"><span>Needs attention</span><b>{losing}</b><i>{losing === 1 ? 'size sells' : 'sizes sell'} below cost · {noCost} without a cost</i></div>
      </div>
      {T.estUnits > 0 && <p className="hint">{T.estUnits} delivered unit(s) predate cost tracking, so their cost is estimated from today's cost.</p>}
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="seg">{([['items', 'Items'], ['cats', 'Categories'], ['log', 'Activity log']] as [Tab, string][]).map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
        <label className="thresh">Alert at ≤ <input id="iv-thresh" type="number" min={0} value={th}
          onChange={e => setThreshold(Math.max(0, Number(e.target.value || 0)))}
          onBlur={async () => { await RB_DB.saveSetting('low_stock_threshold', String(th)); void qc.invalidateQueries({ queryKey: ['admin-counts'] }); }} /> units</label>
      </div>

      {tab === 'items' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div className="chips">{CHIPS.map(([k, l]) => <button key={k} className={'chip ' + (k === 'low' ? 'warn' : k === 'out' || k === 'loss' ? 'bad' : '') + (chip === k ? ' on' : '')} onClick={() => setChip(k)}>{l}</button>)}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={cat} onChange={e => setCat(e.target.value)}><option value="">All aisles</option>{biz.cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
              <button className="btn ghost sm" onClick={exportItems}><AdminIcon name="out" /> Export CSV</button></div>
          </div>
          <div className="toolbar"><input type="search" id="iv-q" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name, SKU, size or aisle" /></div>
          <div className={'bulkbar' + (sel.size ? ' on' : '')}><b>{sel.size} selected</b>
            <label className="thresh">Change stock by <input id="iv-adj" type="number" value={adj.n} style={{ width: 84 }} onChange={e => setAdj({ ...adj, n: e.target.value })} /></label>
            <input placeholder="Reason (optional)" style={{ width: 200 }} value={adj.note} onChange={e => setAdj({ ...adj, note: e.target.value })} />
            <button className="btn sm" onClick={bulkAdjust}>Apply</button><div className="spacer" />
            <button className="btn ghost sm" onClick={() => setSel(new Set())}>Clear selection</button></div>
          <div className="tablewrap"><table>
            <thead><tr><th className="chkcol"><input type="checkbox" className="headchk" checked={rows.length > 0 && rows.every(r => sel.has(r.key))} onChange={e => setSel(e.target.checked ? new Set(rows.map(r => r.key)) : new Set())} /></th>
              {sortTh('name', 'Item')}<th>Aisle</th>{sortTh('stock', 'Stock')}{sortTh('uc', 'Unit cost')}{sortTh('price', 'Price')}{sortTh('pu', 'Profit / unit')}{sortTh('margin', 'Margin')}{sortTh('stockCost', 'Stock cost')}{sortTh('potential', 'Potential')}{sortTh('sold', 'Sold')}{sortTh('realized', 'Realized')}<th /></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={13}><div className="empty">Nothing matches.</div></td></tr>}
              {rows.map(r => (
                <tr key={r.key}>
                  <td className="chkcol"><input type="checkbox" className="rowchk" checked={sel.has(r.key)} onChange={() => setSel(s => { const n = new Set(s); if (n.has(r.key)) n.delete(r.key); else n.add(r.key); return n; })} /></td>
                  <td><a href="#" className="item-link" onClick={e => { e.preventDefault(); ui.openItem(r.p.id); }}><b>{r.p.name}</b></a> <span className="pill">{r.p.sku || '—'}</span><br /><small className="a-mute">{r.v.label}{rbPromoState(r.p) !== 'none' ? ' · ' : ''}<PromoBadge p={r.p} /></small></td>
                  <td>{catName(r.p.cat)}</td>
                  <td><input type="number" min={0} className="inv-stock" defaultValue={r.stock} key={r.key + r.stock} style={{ width: 74 }} onBlur={e => void setStock(r, e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
                    {r.stock <= th && <span className={'pill ' + (r.stock ? 'low' : 'zero')}>{r.stock ? 'Low' : 'Out'}</span>}</td>
                  <td><a href="#" className="item-link" title="Edit cost breakdown" onClick={e => { e.preventDefault(); ui.openItem(r.p.id, { tab: 'costs' }); }}>{r.uc ? moneyD(r.uc) : <span className="pill low">set cost</span>}</a></td>
                  <td>{moneyD(r.price)}{r.price !== Number(r.v.price) && <><br /><small className="strike">{moneyD(r.v.price)}</small></>}</td>
                  <td><Profit n={r.pu} /></td><td>{pctTxt(r.margin)}</td><td>{moneyD(r.stockCost)}</td><td><Profit n={r.potential} /></td><td>{r.sold}</td><td><Profit n={r.realized} /></td>
                  <td><button className="btn ghost sm" onClick={() => ui.openItem(r.p.id)}>Details</button></td>
                </tr>))}
            </tbody>
            {rows.length > 0 && <tfoot><tr><td /><td><b>Total ({rows.length} sizes)</b></td><td /><td><b>{sum.stock}</b></td><td /><td /><td /><td /><td><b>{moneyD(sum.cost)}</b></td><td><Profit n={sum.pot} /></td><td><b>{sum.sold}</b></td><td><Profit n={sum.real} /></td><td /></tr></tfoot>}
          </table></div>
        </>
      )}

      {tab === 'cats' && (
        <div className="tablewrap"><table>
          <thead><tr><th>Aisle</th><th>Items</th><th>Stock</th><th>Stock cost</th><th>Potential</th><th>Sold</th><th>Revenue</th><th>Gross profit</th><th>Margin</th><th>Wastage + expenses</th><th>Net profit</th><th /></tr></thead>
          <tbody>{catRows.map(({ c, a, n }) => (
            <tr key={c.id} className="clickrow" onClick={() => ui.openCategory(c.slug)}>
              <td><b>{c.name}</b></td><td>{n}</td><td>{a.stockUnits}</td><td>{moneyD(a.stockCost)}</td><td><Profit n={a.potential} /></td>
              <td>{a.units}</td><td>{moneyD(a.revenue)}</td><td><Profit n={a.gross} /></td><td>{pctTxt(a.margin)}</td>
              <td>{a.waste + a.expenses ? <span className="neg">{moneyD(a.waste + a.expenses)}</span> : '—'}</td>
              <td><Profit n={a.net} /><div className="mini-track"><i className={sgn(a.net)} style={{ width: `${Math.abs(a.net) / maxAbs * 100}%` }} /></div></td>
              <td><button className="btn ghost sm" onClick={e => { e.stopPropagation(); ui.openCategory(c.slug); }}>Details</button></td></tr>))}</tbody></table></div>
      )}

      {tab === 'log' && (
        <>
          <div className="toolbar" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="search" value={logQ} placeholder="Search item, size or note" style={{ minWidth: 240 }} onChange={e => setLogQ(e.target.value)} />
              <select value={kind} onChange={e => setKind(e.target.value)}><option value="">All activity</option>{Object.entries(LOG_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <button className="btn ghost sm" onClick={() => downloadFile('inventory-activity.csv', toCSV(logList, [
              { label: 'When', get: l => whenFull(l.created_at) }, { label: 'Item', get: l => pName(l.product_id) }, { label: 'Size', get: l => l.variant_label },
              { label: 'Type', get: l => LOG_LABEL[l.kind] || l.kind }, { label: 'Qty', get: l => l.qty }, { label: 'Unit cost', get: l => l.unit_cost },
              { label: 'Amount', get: l => l.amount }, { label: 'Note', get: l => l.note }, { label: 'By', get: l => l.created_by }]), 'text/csv')}><AdminIcon name="out" /> Export CSV</button></div>
          <div className="tablewrap"><table>
            <thead><tr><th>When</th><th>Item</th><th>Size</th><th>Type</th><th>Qty</th><th>Amount</th><th>Note</th><th>By</th></tr></thead>
            <tbody>
              {logList.length === 0 && <tr><td colSpan={8}><div className="empty">{biz.needsUpgrade ? 'Run the file in sql/pending/ to start recording history.' : 'No activity recorded yet.'}</div></td></tr>}
              {logList.slice(0, 400).map(l => (
                <tr key={l.id}><td>{whenFull(l.created_at)}</td>
                  <td><a href="#" className="item-link" onClick={e => { e.preventDefault(); ui.openItem(l.product_id, { tab: 'stock' }); }}>{pName(l.product_id)}</a></td>
                  <td>{l.variant_label || '—'}</td><td><span className={'pill ' + (LOG_PILL[l.kind] || '')}>{LOG_LABEL[l.kind] || l.kind}</span></td>
                  <td>{l.qty || ''}</td><td>{l.amount ? moneyD(l.amount) : ''}</td><td>{l.note || ''}</td><td><small className="a-mute">{l.created_by || ''}</small></td></tr>))}
            </tbody></table></div>
          {logList.length > 400 && <p className="hint">Showing the latest 400 of {logList.length}. Export for the full list.</p>}
        </>
      )}
    </main>
  );
}
