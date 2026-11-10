import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Order, OrderStatus, PaymentStatus } from '../../lib/types';
import { AdminIcon } from '../AdminIcon';
import { money, whenFull } from '../format';
import { useAdminGo } from '../Shell';
import { CustomerTag, ProgressLine, STATUSES } from '../ui/bits';
import { downloadFile, toCSV } from '../ui/csv';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

interface OrdersArg { status?: string; openOrder?: string; customerId?: string; customerName?: string; q?: string }
type SortKey = 'placed_at' | 'order_code' | 'total';

const itemCount = (o: Order) => (o.items ?? []).reduce((s, i) => s + i.qty, 0);

export function OrderModal({ order, onClose, onSaved }: { order: Order; onClose: () => void; onSaved: () => void }) {
  const go = useAdminGo();
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [pay, setPay] = useState<PaymentStatus>(order.payment_status);
  const [busy, setBusy] = useState(false);
  const items = order.items ?? [];

  async function save() {
    setBusy(true);
    if (status !== order.status) { const r = await RB_DB.setOrderStatus(order.id, status); if (!r.ok) { setBusy(false); return toast(r.error, true); } }
    if (pay !== order.payment_status) { const r = await RB_DB.setPaymentStatus(order.id, pay); if (!r.ok) { setBusy(false); return toast(r.error, true); } }
    setBusy(false);
    toast('Order updated.'); onSaved(); onClose();
  }

  return (
    <Modal title={'Order ' + order.order_code} onClose={onClose}
      footer={<><button className="btn ghost" onClick={() => window.print()}>Print</button><button className="btn" disabled={busy} onClick={save}>Save</button></>}>
      <ProgressLine status={order.status} />
      <div className="grid2" style={{ marginTop: 18 }}>
        <div>
          <h3 style={{ fontSize: '1rem' }}>This order's contact and delivery</h3>
          <p>{order.contact_name}<br />{order.contact_phone}<br />{order.contact_email}<br />{order.ship_address}<br />
            {order.ship_city} · {order.ship_zone === 'inside' ? 'Inside Dhaka' : 'Outside Dhaka'}</p>
          {order.note && <div className="notice warn">{order.note}</div>}
          <p style={{ fontSize: '.84rem', color: 'var(--a-mute)' }}>These belong to the order only. The customer's account profile is unchanged.</p>
        </div>
        <div>
          <h3 style={{ fontSize: '1rem' }}>Account</h3>
          <p>{order.is_guest
            ? <><span className="pill guest">GUEST</span><br /><small style={{ color: 'var(--a-mute)' }}>Placed without signing in. Not linked to any account.</small></>
            : <><a className="pill" href="#" onClick={e => { e.preventDefault(); onClose(); go('customers', { openCustomer: order.customer_id }); }}>{order.customers?.customer_code || 'Open customer'}</a>
              <br /><small style={{ color: 'var(--a-mute)' }}>{order.customers?.full_name || ''}</small></>}</p>
          <h3 style={{ fontSize: '1rem', marginTop: 14 }}>Timeline</h3>
          <p style={{ fontSize: '.86rem', color: 'var(--a-mute)' }}>
            Placed {whenFull(order.placed_at)}<br />
            {order.confirmed_at && <>Confirmed {whenFull(order.confirmed_at)}<br /></>}
            {order.shipped_at && <>Shipped {whenFull(order.shipped_at)}<br /></>}
            {order.delivered_at && <>Delivered {whenFull(order.delivered_at)}<br /></>}
            {order.cancelled_at && <>Cancelled {whenFull(order.cancelled_at)}</>}
          </p>
        </div>
      </div>
      <div className="tablewrap" style={{ marginTop: 14 }}><table>
        <thead><tr><th>Item</th><th>Size</th><th>Qty</th><th>Unit</th><th>Line total</th></tr></thead>
        <tbody>
          {items.map((i, k) => <tr key={k}><td>{i.product_name}</td><td>{i.variant_label}</td><td>{i.qty}</td><td>{money(i.unit_price)}</td><td>{money(i.unit_price * i.qty)}</td></tr>)}
          <tr><td colSpan={4} style={{ textAlign: 'right' }}>Subtotal</td><td>{money(order.subtotal)}</td></tr>
          {Number(order.discount) > 0 && <tr><td colSpan={4} style={{ textAlign: 'right' }}>Discount{order.coupon_code ? ` (${order.coupon_code})` : ''}</td><td>−{money(order.discount)}</td></tr>}
          <tr><td colSpan={4} style={{ textAlign: 'right' }}>Delivery</td><td>{Number(order.shipping_fee) ? money(order.shipping_fee) : 'Free'}</td></tr>
          <tr><td colSpan={4} style={{ textAlign: 'right' }}><b>Total</b></td><td><b>{money(order.total)}</b></td></tr>
        </tbody></table></div>
      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="field"><label htmlFor="om-status">Order status</label>
          <select id="om-status" value={status} onChange={e => setStatus(e.target.value as OrderStatus)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
        <div className="field"><label htmlFor="om-pay">Payment</label>
          <select id="om-pay" value={pay} onChange={e => setPay(e.target.value as PaymentStatus)}>{['unpaid', 'paid', 'refunded'].map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
    </Modal>
  );
}

export default function Orders() {
  const arg = (useLocation().state ?? {}) as OrdersArg;
  const go = useAdminGo();
  const qc = useQueryClient();
  const customerId = arg.customerId;
  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['orders', customerId ?? null], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.allOrders(customerId); return r.ok ? r.data : []; }
  });

  const [status, setStatus] = useState(arg.status ?? '');
  const [kind, setKind] = useState('');
  const [q, setQ] = useState(arg.q ?? '');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'placed_at', dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState('');
  const [openId, setOpenId] = useState<string | null>(arg.openOrder ?? null);

  const base = useMemo(() => orders.filter(o => kind === 'guest' ? o.is_guest : kind === 'account' ? !o.is_guest : true), [orders, kind]);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const l = base.filter(o => {
      if (status && o.status !== status) return false;
      if (!s) return true;
      return [o.order_code, o.customers?.customer_code, o.contact_name, o.contact_email, o.contact_phone, o.ship_city, o.status].some(v => String(v ?? '').toLowerCase().includes(s))
        || (o.items ?? []).some(i => String(i.product_name ?? '').toLowerCase().includes(s));
    });
    return l.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
      return (typeof av === 'number' ? av - (bv as number) : String(av ?? '').localeCompare(String(bv ?? ''))) * sort.dir;
    });
  }, [base, status, q, sort]);

  /* an opened order is looked up by id, so it stays current after a save */
  const open = openId ? orders.find(o => o.id === openId) : undefined;

  const reload = () => void qc.invalidateQueries({ queryKey: ['orders'] });
  const sortBy = (key: SortKey) => setSort(s => s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 });
  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function applyBulk() {
    if (!bulk) return toast('Choose a status first.', true);
    if (!selected.size) return;
    await Promise.all([...selected].map(id => RB_DB.setOrderStatus(id, bulk as OrderStatus)));
    toast(`${selected.size} order(s) set to ${bulk}.`);
    setSelected(new Set()); reload();
  }
  function exportCsv() {
    downloadFile('orders.csv', toCSV(list, [
      { label: 'Order', get: o => o.order_code }, { label: 'Placed', get: o => whenFull(o.placed_at) },
      { label: 'Customer', get: o => o.is_guest ? 'Guest' : (o.customers?.customer_code ?? '') },
      { label: 'Name', get: o => o.contact_name }, { label: 'Phone', get: o => o.contact_phone },
      { label: 'City', get: o => o.ship_city }, { label: 'Items', get: itemCount },
      { label: 'Total', get: o => o.total }, { label: 'Payment method', get: o => o.payment_method },
      { label: 'Payment status', get: o => o.payment_status }, { label: 'Status', get: o => o.status }
    ]), 'text/csv');
  }

  const allSelected = list.length > 0 && list.every(o => selected.has(o.id));
  const arrow = (k: SortKey) => <span className="arrow">{sort.key === k ? (sort.dir > 0 ? '↑' : '↓') : '↕'}</span>;

  return (
    <main className="main" id="view">
      <div className="bar">
        <div><h1>{arg.customerName ? `Orders from ${arg.customerName}` : 'Orders'}</h1>
          <p>Search by order number, customer number, name, email or phone. Click a row to open it.</p></div>
        {customerId && <button className="btn ghost" onClick={() => go('orders')}>Show all orders</button>}
      </div>
      <div className="toolbar" style={{ justifyContent: 'space-between' }}>
        <div className="chips" id="o-status-chips">
          <button className={'chip' + (status === '' ? ' on' : '')} onClick={() => setStatus('')}>All <span className="n">{base.length}</span></button>
          {STATUSES.map(s => (
            <button key={s} className={'chip ' + (s === 'cancelled' ? 'bad' : s === 'pending' ? 'warn' : '') + (status === s ? ' on' : '')} style={{ textTransform: 'capitalize' }} onClick={() => setStatus(s)}>
              {s} <span className="n">{base.filter(o => o.status === s).length}</span></button>
          ))}
        </div>
        <select id="o-kind" value={kind} onChange={e => setKind(e.target.value)}>
          <option value="">Accounts and guests</option><option value="account">Accounts only</option><option value="guest">Guests only</option>
        </select>
      </div>
      <div className="toolbar">
        <input type="search" id="o-q" value={q} onChange={e => setQ(e.target.value)} placeholder="ORD-10001, CUST-10025, name, email or phone" />
        <button className="btn ghost sm" onClick={exportCsv}><AdminIcon name="out" /> Export CSV</button>
      </div>
      <div className={'bulkbar' + (selected.size ? ' on' : '')}>
        <b>{selected.size} selected</b>
        <select value={bulk} onChange={e => setBulk(e.target.value)}><option value="">Set status to…</option>{STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select>
        <button className="btn sm" onClick={applyBulk}>Apply</button>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={() => setSelected(new Set())}>Clear selection</button>
      </div>
      <div className="tablewrap"><table>
        <thead><tr>
          <th className="chkcol"><input type="checkbox" className="headchk" checked={allSelected}
            onChange={e => setSelected(e.target.checked ? new Set(list.map(o => o.id)) : new Set())} /></th>
          <th className={'sortable' + (sort.key === 'order_code' ? ' active' : '')} onClick={() => sortBy('order_code')}>Order {arrow('order_code')}</th>
          <th>Customer</th><th>Contact</th><th>Items</th>
          <th className={'sortable' + (sort.key === 'total' ? ' active' : '')} onClick={() => sortBy('total')}>Total {arrow('total')}</th>
          <th>Payment</th><th>Status</th></tr></thead>
        <tbody id="o-rows">
          {list.length === 0 && <tr><td colSpan={8}><div className="empty">{isLoading ? 'Loading…' : 'No orders match that.'}</div></td></tr>}
          {list.map(o => (
            <tr key={o.id} className="clickrow" onClick={() => setOpenId(o.id)}>
              <td className="chkcol" onClick={e => e.stopPropagation()}><input type="checkbox" className="rowchk" checked={selected.has(o.id)} onChange={() => toggle(o.id)} /></td>
              <td><b>{o.order_code}</b><br /><small style={{ color: 'var(--a-mute)' }}>{whenFull(o.placed_at)}</small></td>
              <td><CustomerTag o={o} /></td>
              <td>{o.contact_name}<br /><small style={{ color: 'var(--a-mute)' }}>{o.contact_phone} · {o.ship_city}</small></td>
              <td>{itemCount(o)}</td>
              <td>{money(o.total)}</td>
              <td>{(o.payment_method || '').toUpperCase()}<br /><small style={{ color: 'var(--a-mute)' }}>{o.payment_status || 'unpaid'}</small></td>
              <td><span className={'pill ' + o.status}>{o.status}</span></td>
            </tr>
          ))}
        </tbody></table></div>
      {open && <OrderModal key={open.id} order={open} onClose={() => setOpenId(null)} onSaved={reload} />}
    </main>
  );
}
