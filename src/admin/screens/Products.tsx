import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Product } from '../../lib/types';
import { money } from '../format';
import { useAdminUi } from '../AdminUi';
import { PromoBadge, effectiveDiscount, minEffPrice, stockOf } from '../productHelpers';
import { useCategoriesAdmin, useProductsAdmin } from '../queries';
import { ConfirmDelete } from '../ui/Confirm';
import { toast } from '../ui/toast';

type Quick = '' | 'live' | 'hidden' | 'low' | 'out' | 'featured' | 'hotdeal';
const QUICK: [Quick, string, string][] = [['', 'All', ''], ['live', 'Live', ''], ['hidden', 'Hidden', ''], ['low', 'Low stock', 'warn'], ['out', 'Out of stock', 'bad'], ['featured', 'Featured', ''], ['hotdeal', 'Hot Deals', '']];
type SortKey = 'name' | 'price' | 'stock';

export default function Products() {
  const qc = useQueryClient();
  const ui = useAdminUi();
  const { data: products = [], isLoading } = useProductsAdmin();
  const { data: cats = [] } = useCategoriesAdmin();
  const [q, setQ] = useState(''), [cat, setCat] = useState(''), [quick, setQuick] = useState<Quick>('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkCat, setBulkCat] = useState('');
  const [del, setDel] = useState<Product[] | null>(null);
  const reload = () => void qc.invalidateQueries();

  const list = useMemo(() => {
    const s = q.toLowerCase();
    const l = products.filter(p => {
      if (cat && p.cat !== cat) return false;
      if (quick === 'live' && p.active === false) return false;
      if (quick === 'hidden' && p.active !== false) return false;
      if (quick === 'low' && !(stockOf(p) > 0 && stockOf(p) <= 5)) return false;
      if (quick === 'out' && stockOf(p) !== 0) return false;
      if (quick === 'featured' && !p.featured) return false;
      if (quick === 'hotdeal' && !p.hot_deal) return false;
      return !s || p.name.toLowerCase().includes(s) || (p.farm || '').toLowerCase().includes(s) || (p.sku || '').toLowerCase().includes(s);
    });
    if (sort) {
      const val = (p: Product) => sort.key === 'price' ? Math.min(...p.variants.map(v => v.price), Infinity) : sort.key === 'stock' ? stockOf(p) : p.name.toLowerCase();
      l.sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
    }
    return l;
  }, [products, q, cat, quick, sort]);

  const toggleSel = (id: string) => setSel(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const chosen = () => [...sel].map(id => products.find(p => p.id === id)).filter((p): p is Product => !!p);
  const sortBy = (key: SortKey) => setSort(s => s?.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 });
  const arrow = (k: SortKey) => <span className="arrow">{sort?.key === k ? (sort.dir > 0 ? '↑' : '↓') : '↕'}</span>;
  const catName = (slug: string) => cats.find(c => c.slug === slug)?.name ?? slug;

  async function bulkActive(active: boolean) {
    if (!sel.size) return;
    await Promise.all(chosen().map(p => RB_DB.saveProduct({ ...p, active })));
    toast(`${sel.size} product(s) ${active ? 'made live' : 'hidden'}.`); setSel(new Set()); reload();
  }
  async function bulkMove() {
    if (!bulkCat) return toast('Choose an aisle first.', true);
    if (!sel.size) return;
    await Promise.all(chosen().map(p => RB_DB.saveProduct({ ...p, cat: bulkCat })));
    toast(`${sel.size} product(s) moved.`); setSel(new Set()); reload();
  }

  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Products</h1><p>Add what came in, hide what ran out, keep the stock numbers honest.</p></div>
        <button className="btn" onClick={() => ui.editProduct(null)}>Add product</button></div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="chips">{QUICK.map(([k, l, tone]) => <button key={k} className={'chip ' + tone + (quick === k ? ' on' : '')} onClick={() => setQuick(k)}>{l}</button>)}</div>
        <select id="p-cat" value={cat} onChange={e => setCat(e.target.value)}><option value="">All aisles</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
      </div>
      <div className="toolbar"><input type="search" id="p-q" placeholder="Search by name, SKU or farm" value={q} onChange={e => setQ(e.target.value.trim())} /></div>
      <div className={'bulkbar' + (sel.size ? ' on' : '')}>
        <b>{sel.size} selected</b>
        <button className="btn ghost sm" onClick={() => bulkActive(true)}>Show</button>
        <button className="btn ghost sm" onClick={() => bulkActive(false)}>Hide</button>
        <select value={bulkCat} onChange={e => setBulkCat(e.target.value)}><option value="">Move to aisle…</option>{cats.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}</select>
        <button className="btn ghost sm" onClick={bulkMove}>Apply</button>
        <button className="btn red sm" onClick={() => sel.size && setDel(chosen())}>Delete</button>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setSel(new Set())}>Clear selection</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr>
          <th className="chkcol"><input type="checkbox" className="headchk" checked={list.length > 0 && list.every(p => sel.has(p.id))} onChange={e => setSel(e.target.checked ? new Set(list.map(p => p.id)) : new Set())} /></th>
          <th /><th>SKU</th>
          <th className={'sortable' + (sort?.key === 'name' ? ' active' : '')} onClick={() => sortBy('name')}>Product {arrow('name')}</th>
          <th>Aisle</th><th>From</th>
          <th className={'sortable' + (sort?.key === 'price' ? ' active' : '')} onClick={() => sortBy('price')}>Price {arrow('price')}</th>
          <th className={'sortable' + (sort?.key === 'stock' ? ' active' : '')} onClick={() => sortBy('stock')}>Stock {arrow('stock')}</th>
          <th>Status</th><th /></tr></thead>
        <tbody id="p-rows">
          {list.length === 0 && <tr><td colSpan={10}><div className="empty">{isLoading ? 'Loading…' : 'No products match that.'}</div></td></tr>}
          {list.map(p => {
            const st = stockOf(p), disc = effectiveDiscount(p);
            return (
              <tr key={p.id}>
                <td className="chkcol"><input type="checkbox" className="rowchk" checked={sel.has(p.id)} onChange={() => toggleSel(p.id)} /></td>
                <td>{p.images[0] ? <img className="thumb" src={p.images[0]} alt="" /> : null}</td>
                <td><span className="pill">{p.sku || '—'}</span></td>
                <td><a href="#" className="item-link" onClick={e => { e.preventDefault(); ui.openItem(p.id); }}><b>{p.name}</b></a><br /><small style={{ color: 'var(--a-mute)' }}>{p.name_bn || ''}</small>
                  {p.featured && <> <span className="pill confirmed">Featured</span></>}{p.hot_deal && <> <span className="pill pending">Hot deal</span></>} <PromoBadge p={p} /></td>
                <td>{catName(p.cat)}</td><td>{p.origin || '—'}</td>
                <td>{money(minEffPrice(p))}{disc ? <> <span className="pill cancelled">-{disc}%</span></> : null}</td>
                <td><span className={'pill ' + (st === 0 ? 'zero' : st <= 5 ? 'low' : '')}>{st}</span></td>
                <td><span className={'pill ' + (p.active === false ? 'off' : '')}>{p.active === false ? 'Hidden' : 'Live'}</span></td>
                <td><div className="rowactions">
                  <button className="btn ghost sm" onClick={() => ui.editProduct(p)}>Edit</button>
                  <button className="btn ghost sm" onClick={async () => { const r = await RB_DB.saveProduct({ ...p, active: p.active === false }); toast(r.ok ? (p.active === false ? 'Product is live.' : 'Product hidden.') : r.error, !r.ok); reload(); }}>{p.active === false ? 'Show' : 'Hide'}</button>
                  <button className="btn red sm" onClick={() => setDel([p])}>Delete</button></div></td>
              </tr>);
          })}
        </tbody></table></div>
      {del && <ConfirmDelete what={del.length === 1 ? del[0].name : `${del.length} product(s)`} onClose={() => setDel(null)}
        onConfirm={async () => { const rs = await Promise.all(del.map(p => RB_DB.deleteProduct(p.id))); const bad = rs.find(r => !r.ok); toast(bad && !bad.ok ? bad.error : del.length === 1 ? 'Product deleted.' : 'Products deleted.', !!bad); setSel(new Set()); reload(); }} />}
    </main>
  );
}
