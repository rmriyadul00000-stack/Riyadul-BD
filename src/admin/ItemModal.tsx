import { useMemo, useRef, useState } from 'react';
import { RB_DB, rbEffPrice, rbUnitCost } from '../lib/db';
import type { InventoryLogEntry, Product, Variant } from '../lib/types';
import { analyze, type Biz, type Analysis, type Totals } from './biz';
import { moneyD, whenFull } from './format';
import { COST_FIELDS, LOG_LABEL, LOG_PILL, PromoBadge, pctTxt, sgn } from './productHelpers';
import { TrendChart } from './TrendChart';
import { useBiz } from './queries';
import type { Series } from './metrics';
import { Modal } from './ui/Modal';
import { toast } from './ui/toast';

type Tab = 'overview' | 'costs' | 'stock' | 'notes' | 'perf';
const TABS: [Tab, string][] = [['overview', 'Overview'], ['costs', 'Costs'], ['stock', 'Stock & history'], ['notes', 'Notes'], ['perf', 'Performance']];

const Profit = ({ n }: { n: number }) => <b className={sgn(n)}>{n < 0 ? '−' : ''}{moneyD(Math.abs(n))}</b>;
const UpgradeBanner = ({ biz }: { biz: Biz }) => biz.needsUpgrade
  ? <div className="notice"><b>One-time database step needed.</b> Run <code>sql/pending/2026-11-10_run_when_supabase_resumes.sql</code> in the Supabase SQL editor to switch on cost history, wastage, expenses and real profit tracking. Until then this page shows costs and stock but no history.</div> : null;

/* monthly points as a Series so the shared chart can draw them */
function monthSeries(months: string[], values: number[]): Series {
  const starts = months.map(m => new Date(m + '-01T00:00:00').getTime());
  return {
    unit: 'month', unitLabel: 'Monthly', starts, values, counts: values.map(() => 0),
    labels: months.map(m => m.slice(2)), tips: starts.map(t => new Date(t).toLocaleString('en-GB', { month: 'long', year: 'numeric' }))
  };
}

function History({ logs, biz }: { logs: InventoryLogEntry[]; biz: Biz }) {
  if (biz.needsUpgrade) return <div className="empty">History is switched on by running the file in sql/pending/.</div>;
  if (!logs.length) return <div className="empty">Nothing recorded yet.</div>;
  return (
    <div className="tablewrap"><table><thead><tr><th>When</th><th>Type</th><th>Size</th><th>Qty</th><th>Amount</th><th>Note</th></tr></thead><tbody>
      {logs.slice(0, 200).map(l => (
        <tr key={l.id}><td>{whenFull(l.created_at)}</td>
          <td><span className={'pill ' + (LOG_PILL[l.kind] || '')}>{LOG_LABEL[l.kind] || l.kind}</span></td>
          <td>{l.variant_label || '—'}</td><td>{l.qty || ''}</td>
          <td>{l.amount ? moneyD(l.amount) : ''}{l.unit_cost != null && l.kind !== 'note' ? <><br /><small className="a-mute">@ {moneyD(l.unit_cost)}</small></> : null}</td>
          <td>{l.note || ''}{l.created_by ? <><br /><small className="a-mute">{l.created_by}</small></> : null}</td></tr>))}
    </tbody></table></div>
  );
}

function Overview({ p, pa, A }: { p: Product; pa: Totals; A: Analysis }) {
  return (
    <>
      <div className="kv">
        <div><span>Stock on hand</span><b>{pa.stockUnits} units</b></div>
        <div><span>Stock value (at cost)</span><b>{moneyD(pa.stockCost)}</b></div>
        <div><span>Stock value (at price)</span><b>{moneyD(pa.stockValue)}</b></div>
        <div><span>Potential profit</span><Profit n={pa.potential} /></div>
        <div><span>Sold &amp; delivered</span><b>{pa.units} units</b></div>
        <div><span>Revenue</span><b>{moneyD(pa.revenue)}</b></div>
        <div><span>Gross profit</span><Profit n={pa.gross} /></div>
        <div><span>Margin</span><b>{pctTxt(pa.margin)}</b></div>
        <div><span>Wastage loss</span><b className={pa.waste ? 'neg' : ''}>{moneyD(pa.waste)}</b></div>
        <div><span>Expenses</span><b className={pa.expenses ? 'neg' : ''}>{moneyD(pa.expenses)}</b></div>
        <div><span>Net profit</span><Profit n={pa.net} /></div>
        <div><span>Still in transit</span><b>{pa.pUnits} units · <Profit n={pa.pGross} /></b></div>
      </div>
      {pa.estUnits > 0 && <p className="hint">{pa.estUnits} sold unit(s) come from orders placed before cost tracking, so their cost is estimated from today's cost.</p>}
      <div className="tablewrap" style={{ marginTop: 12 }}><table>
        <thead><tr><th>Size</th><th>Stock</th><th>Unit cost</th><th>Price now</th><th>Profit / unit</th><th>Margin</th><th>Potential</th><th>Sold</th><th>Realized profit</th></tr></thead>
        <tbody>{p.variants.map(v => {
          const uc = rbUnitCost(v), pr = rbEffPrice(p, v), pu = pr - uc, va = A.V[p.id + '|' + v.label] ?? A.blank();
          return (
            <tr key={v.label}><td><b>{v.label}</b></td><td>{v.stock || 0}</td><td>{moneyD(uc)}</td>
              <td>{moneyD(pr)}{pr !== Number(v.price) && <> <small className="strike">{moneyD(v.price)}</small></>}</td>
              <td><Profit n={pu} /></td><td>{pctTxt(pr ? pu / pr * 100 : null)}</td>
              <td><Profit n={pu * (Number(v.stock) || 0)} /></td><td>{va.units}</td><td><Profit n={va.gross} /></td></tr>);
        })}</tbody></table></div>
    </>
  );
}

export function ItemModal({ productId, initialTab, onClose, onChanged, onEdit }: {
  productId: string; initialTab?: Tab; onClose: () => void; onChanged: () => void; onEdit: (p: Product) => void;
}) {
  const { data: biz, refetch } = useBiz();
  const [tab, setTab] = useState<Tab>(initialTab ?? 'overview');
  const p = biz?.products.find(x => x.id === productId);
  const A = useMemo(() => (biz ? analyze(biz, null) : null), [biz]);
  const warned = useRef(false);
  if (!biz || !A) return <Modal title="Loading…" wide onClose={onClose}><div className="empty">Loading item…</div></Modal>;
  if (!p) return <Modal title="Not found" onClose={onClose}><div className="empty">That product no longer exists.</div></Modal>;

  const pa = A.P[p.id] ?? A.blank();
  const cat = biz.cats.find(c => c.slug === p.cat);
  const logs = biz.logs.filter(l => l.product_id === p.id);

  const refresh = async () => { await refetch(); onChanged(); };
  async function saveVariants(variants: Variant[]) {
    const r = await RB_DB.saveProduct({ ...p!, variants });
    if (!r.ok) { toast(r.error, true); return false; }
    return true;
  }
  async function logIt(e: Omit<InventoryLogEntry, 'product_id'>) {
    const r = await RB_DB.addInventoryLog({ product_id: productId, ...e });
    if (!r.ok && !warned.current) { warned.current = true; toast('Saved, but history could not be written (run the file in sql/pending/).', true); }
  }

  return (
    <Modal title={p.name} wide onClose={onClose}
      footer={<><button className="btn ghost" onClick={() => onEdit(p)}>Edit product</button><button className="btn" onClick={onClose}>Close</button></>}>
      <UpgradeBanner biz={biz} />
      <p className="item-sub"><span className="pill">{p.sku || '—'}</span> {cat ? cat.name : p.cat} · {p.farm || '—'}{' '}
        {p.active === false ? <span className="pill off">Hidden</span> : <span className="pill">Live</span>}{' '}
        {p.hot_deal && <span className="pill pending">Hot deal</span>} <PromoBadge p={p} /></p>
      <div className="seg" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'overview' && <Overview p={p} pa={pa} A={A} />}
      {tab === 'costs' && <Costs p={p} onSave={async (variants, changes) => {
        if (!(await saveVariants(variants))) return;
        for (const c of changes) await logIt(c);
        toast('Costs saved.'); await refresh();
      }} onExpense={async (amount, note) => { await logIt({ kind: 'expense', amount, note }); toast('Expense recorded.'); await refresh(); }} />}
      {tab === 'stock' && <StockTab p={p} saveVariants={saveVariants} logIt={logIt} refresh={refresh}>
        <h3 style={{ margin: '22px 0 8px' }}>History</h3><History logs={logs} biz={biz} /></StockTab>}
      {tab === 'notes' && <Notes logs={logs} onAdd={async t => { await logIt({ kind: 'note', note: t }); toast('Note saved.'); await refresh(); }}
        onDelete={async id => { await RB_DB.deleteInventoryLog(id); await refresh(); }} />}
      {tab === 'perf' && <Perf p={p} pa={pa} A={A} />}
    </Modal>
  );
}

function Costs({ p, onSave, onExpense }: { p: Product; onSave: (v: Variant[], changes: Omit<InventoryLogEntry, 'product_id'>[]) => Promise<void>; onExpense: (a: number, n: string) => Promise<void> }) {
  const [vs, setVs] = useState<Variant[]>(p.variants.map(v => ({ ...v })));
  const [amount, setAmount] = useState(''), [note, setNote] = useState('');
  const upd = (i: number, k: string, val: string | number) => setVs(a => a.map((v, n) => n === i ? { ...v, [k]: val } : v));
  return (
    <>
      <p className="hint">Enter what one unit of each size costs you, broken down. Landed cost is the sum, and it drives every profit figure and is saved on each order at the time of sale.</p>
      <div>{vs.map((v, i) => {
        const cost = rbUnitCost(v), price = rbEffPrice(p, v), pu = price - cost;
        return (
          <div className="card cost-card" key={v.label}>
            <div className="cost-head"><b>{v.label}</b><span>Selling price <b>{moneyD(price)}</b></span></div>
            <div className="cost-grid">{COST_FIELDS.map(([k, l, tip]) => (
              <label className="field" key={k}><span>{l}</span>
                <input type="number" min={0} step="0.01" title={tip} placeholder="0" value={(v[k] as number) || ''} onChange={e => upd(i, k, Number(e.target.value) || 0)} /></label>))}</div>
            <label className="field"><span>Note about these costs</span><input value={v.cost_other_note || ''} placeholder="e.g. new supplier from March, includes ice packs" onChange={e => upd(i, 'cost_other_note', e.target.value)} /></label>
            <div className="cost-sum">Landed cost <b>{moneyD(cost)}</b> · Profit / unit <Profit n={pu} /> · Margin <span>{pctTxt(price ? pu / price * 100 : null)}</span></div>
          </div>);
      })}</div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => {
        const changes = vs.flatMap((v, i) => {
          const before = rbUnitCost(p.variants[i]), after = rbUnitCost(v);
          return before !== after ? [{ kind: 'cost_change' as const, variant_label: v.label, unit_cost: after, note: `Landed cost ${moneyD(before)} → ${moneyD(after)}${v.cost_other_note ? ' · ' + v.cost_other_note : ''}` }] : [];
        });
        void onSave(vs.map(v => ({ ...v, cost_other_note: (v.cost_other_note || '').trim() })), changes);
      }}>Save costs</button>
      <h3 style={{ margin: '24px 0 6px' }}>One-off expense</h3>
      <p className="hint">Money spent on this item that isn't per unit (a cold-room week, a lab test, a damaged batch write-off). It counts against this item's net profit.</p>
      <div className="inline-form">
        <label className="field"><span>Amount (৳)</span><input type="number" min={0} step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="field grow"><span>What was it for?</span><input placeholder="Reason" value={note} onChange={e => setNote(e.target.value)} /></label>
        <button className="btn" onClick={() => { const a = Number(amount || 0); if (!a || !note.trim()) return toast('Enter an amount and a reason.', true); void onExpense(a, note.trim()).then(() => { setAmount(''); setNote(''); }); }}>Add expense</button>
      </div>
    </>
  );
}

function StockTab({ p, saveVariants, logIt, refresh, children }: {
  p: Product; saveVariants: (v: Variant[]) => Promise<boolean>; logIt: (e: Omit<InventoryLogEntry, 'product_id'>) => Promise<void>; refresh: () => Promise<void>; children: React.ReactNode;
}) {
  const first = p.variants[0]?.label ?? '';
  const [inF, setIn] = useState({ size: first, qty: '', cost: '', mode: 'avg', note: '' });
  const [ws, setWs] = useState({ size: first, qty: '', note: '' });
  const [ad, setAd] = useState({ size: first, qty: '', note: '' });
  const opts = p.variants.map(v => <option key={v.label} value={v.label}>{v.label} ({v.stock || 0} in stock)</option>);
  const find = (l: string) => p.variants.find(v => v.label === l);

  async function stockIn() {
    const v = find(inF.size), qty = Math.round(Number(inF.qty || 0)), cost = Number(inF.cost || 0);
    if (!v || qty < 1) return toast('Enter how many units arrived.', true);
    const oldStock = Number(v.stock) || 0, oldCost = Number(v.cost) || 0;
    const newCost = inF.mode === 'latest' ? cost : inF.mode === 'avg' ? (oldStock > 0 ? Math.round((oldStock * oldCost + qty * cost) / (oldStock + qty) * 100) / 100 : cost) : oldCost;
    if (!(await saveVariants(p.variants.map(x => x === v ? { ...x, stock: oldStock + qty, cost: newCost } : x)))) return;
    await logIt({ kind: 'purchase', variant_label: v.label, qty, unit_cost: cost, amount: qty * cost, note: inF.note.trim() || null });
    toast(`Added ${qty} × ${v.label}.`); setIn({ ...inF, qty: '', note: '' }); await refresh();
  }
  async function waste() {
    const v = find(ws.size), qty = Math.round(Number(ws.qty || 0));
    if (!v || qty < 1) return toast('Enter how many units were lost.', true);
    if (!(await saveVariants(p.variants.map(x => x === v ? { ...x, stock: Math.max(0, (Number(x.stock) || 0) - qty) } : x)))) return;
    await logIt({ kind: 'wastage', variant_label: v.label, qty, unit_cost: rbUnitCost(v), amount: qty * rbUnitCost(v), note: ws.note.trim() || null });
    toast('Loss recorded.'); setWs({ ...ws, qty: '', note: '' }); await refresh();
  }
  async function adjust() {
    const v = find(ad.size), target = Math.round(Number(ad.qty));
    if (!v || isNaN(target) || target < 0) return toast('Enter the actual count.', true);
    if (!(await saveVariants(p.variants.map(x => x === v ? { ...x, stock: target } : x)))) return;
    await logIt({ kind: 'adjustment', variant_label: v.label, qty: target - (Number(v.stock) || 0), note: ad.note.trim() || `Set to ${target}` });
    toast('Stock corrected.'); setAd({ ...ad, qty: '', note: '' }); await refresh();
  }

  return (
    <>
      <div className="actions-grid">
        <div className="card"><h3>Stock in</h3><div className="inline-form col">
          <label className="field"><span>Size</span><select value={inF.size} onChange={e => setIn({ ...inF, size: e.target.value })}>{opts}</select></label>
          <label className="field"><span>Quantity received</span><input type="number" min={1} value={inF.qty} onChange={e => setIn({ ...inF, qty: e.target.value })} /></label>
          <label className="field"><span>Buying cost per unit (৳)</span><input type="number" min={0} step="0.01" value={inF.cost} onChange={e => setIn({ ...inF, cost: e.target.value })} /></label>
          <label className="field"><span>Update buying cost by</span><select value={inF.mode} onChange={e => setIn({ ...inF, mode: e.target.value })}>
            <option value="avg">Weighted average with current stock</option><option value="latest">Using this batch's cost</option><option value="keep">Leave cost unchanged</option></select></label>
          <label className="field"><span>Note</span><input placeholder="Supplier, invoice number…" value={inF.note} onChange={e => setIn({ ...inF, note: e.target.value })} /></label>
          <button className="btn" onClick={stockIn}>Add stock</button></div></div>
        <div className="card"><h3>Record wastage</h3><div className="inline-form col">
          <label className="field"><span>Size</span><select value={ws.size} onChange={e => setWs({ ...ws, size: e.target.value })}>{opts}</select></label>
          <label className="field"><span>Units lost</span><input type="number" min={1} value={ws.qty} onChange={e => setWs({ ...ws, qty: e.target.value })} /></label>
          <label className="field"><span>Reason</span><input placeholder="Spoiled, damaged, expired…" value={ws.note} onChange={e => setWs({ ...ws, note: e.target.value })} /></label>
          <button className="btn red" onClick={waste}>Record loss</button>
          <small>Removes the units from stock and books their landed cost as a loss.</small></div></div>
        <div className="card"><h3>Correct the count</h3><div className="inline-form col">
          <label className="field"><span>Size</span><select value={ad.size} onChange={e => setAd({ ...ad, size: e.target.value })}>{opts}</select></label>
          <label className="field"><span>Actual count on the shelf</span><input type="number" min={0} value={ad.qty} onChange={e => setAd({ ...ad, qty: e.target.value })} /></label>
          <label className="field"><span>Reason</span><input placeholder="Stock take, counting mistake…" value={ad.note} onChange={e => setAd({ ...ad, note: e.target.value })} /></label>
          <button className="btn ghost" onClick={adjust}>Set stock</button></div></div>
      </div>
      {children}
    </>
  );
}

function Notes({ logs, onAdd, onDelete }: { logs: InventoryLogEntry[]; onAdd: (t: string) => Promise<void>; onDelete: (id: string) => Promise<void> }) {
  const [text, setText] = useState('');
  const notes = logs.filter(l => l.kind === 'note');
  return (
    <>
      <div className="inline-form">
        <label className="field grow"><span>Add a note</span><textarea rows={2} placeholder="Supplier details, quality remarks, seasonal timing, reminders…" value={text} onChange={e => setText(e.target.value)} /></label>
        <button className="btn" onClick={() => { const t = text.trim(); if (t) void onAdd(t).then(() => setText('')); }}>Save note</button>
      </div>
      <div className="timeline" style={{ marginTop: 16 }}>
        {notes.length === 0 && <div className="empty">No notes yet.</div>}
        {notes.map(n => (
          <div className="tl-item" key={n.id}><div className="tl-meta">{whenFull(n.created_at)}{n.created_by ? ' · ' + n.created_by : ''}
            <button className="link-btn" onClick={() => n.id && void onDelete(n.id)}>delete</button></div><div>{n.note}</div></div>))}
      </div>
    </>
  );
}

function Perf({ p, pa, A }: { p: Product; pa: Totals; A: Analysis }) {
  const months = Object.keys(A.monthly).sort().slice(-6);
  const profit = months.map(m => { const x = A.monthly[m].byProd[p.id] ?? { revenue: 0, cogs: 0 }; return x.revenue - x.cogs; });
  const revenue = months.map(m => (A.monthly[m].byProd[p.id] ?? { revenue: 0 }).revenue);
  return (
    <>
      <div className="kv">
        <div><span>Units sold (delivered)</span><b>{pa.units}</b></div><div><span>Revenue</span><b>{moneyD(pa.revenue)}</b></div>
        <div><span>Cost of goods</span><b>{moneyD(pa.cogs)}</b></div><div><span>Gross profit</span><Profit n={pa.gross} /></div>
      </div>
      {months.length > 1 ? (
        <>
          <div className="card chartcard" style={{ marginTop: 14 }}><h3>Gross profit by month</h3><p className="sub">Delivered orders, last {months.length} months with sales.</p><TrendChart series={monthSeries(months, profit)} prev={null} label="Gross profit by month" /></div>
          <div className="card chartcard" style={{ marginTop: 14 }}><h3>Revenue by month</h3><TrendChart series={monthSeries(months, revenue)} prev={null} label="Revenue by month" /></div>
        </>
      ) : <div className="empty" style={{ marginTop: 14 }}>Trends appear once this item has sales in two or more months.</div>}
    </>
  );
}

export function CategoryModal({ slug, onClose, onOpenItem }: { slug: string; onClose: () => void; onOpenItem: (id: string) => void }) {
  const { data: biz } = useBiz();
  const A = useMemo(() => (biz ? analyze(biz, null) : null), [biz]);
  if (!biz || !A) return <Modal title="Loading…" wide onClose={onClose}><div className="empty">Loading…</div></Modal>;
  const cat = biz.cats.find(c => c.slug === slug), c = A.C[slug] ?? A.blank();
  const items = biz.products.filter(p => p.cat === slug).map(p => ({ p, a: A.P[p.id] ?? A.blank() })).sort((x, y) => y.a.net - x.a.net);
  const months = Object.keys(A.monthly).sort().slice(-6);
  const series = months.map(m => { const x = A.monthly[m].byCat[slug] ?? { revenue: 0, cogs: 0 }; return x.revenue - x.cogs; });
  return (
    <Modal title={cat ? cat.name : slug} wide onClose={onClose} footer={<button className="btn" onClick={onClose}>Close</button>}>
      <UpgradeBanner biz={biz} />
      <div className="kv">
        <div><span>Products</span><b>{items.length}</b></div><div><span>Units sold</span><b>{c.units}</b></div>
        <div><span>Revenue</span><b>{moneyD(c.revenue)}</b></div><div><span>Gross profit</span><Profit n={c.gross} /></div>
        <div><span>Margin</span><b>{pctTxt(c.margin)}</b></div><div><span>Wastage + expenses</span><b className={c.waste + c.expenses ? 'neg' : ''}>{moneyD(c.waste + c.expenses)}</b></div>
        <div><span>Net profit</span><Profit n={c.net} /></div><div><span>Potential from stock</span><Profit n={c.potential} /></div>
      </div>
      {months.length > 1 && <div className="card chartcard" style={{ marginTop: 14 }}><h3>Gross profit by month</h3><TrendChart series={monthSeries(months, series)} prev={null} label="Gross profit by month" /></div>}
      <div className="tablewrap" style={{ marginTop: 14 }}><table>
        <thead><tr><th>Item</th><th>Stock</th><th>Sold</th><th>Revenue</th><th>Profit</th><th>Margin</th><th>Wastage</th><th /></tr></thead>
        <tbody>{items.length ? items.map(({ p, a }) => (
          <tr key={p.id}><td><b>{p.name}</b><br /><small className="a-mute">{p.sku || ''}</small></td><td>{a.stockUnits}</td><td>{a.units}</td>
            <td>{moneyD(a.revenue)}</td><td><Profit n={a.net} /></td><td>{pctTxt(a.margin)}</td>
            <td>{a.waste ? <span className="neg">{moneyD(a.waste)}</span> : '—'}</td>
            <td><button className="btn ghost sm" onClick={() => onOpenItem(p.id)}>Details</button></td></tr>
        )) : <tr><td colSpan={8}><div className="empty">No products in this aisle yet.</div></td></tr>}</tbody></table></div>
    </Modal>
  );
}
