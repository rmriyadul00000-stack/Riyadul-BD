import { useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RB_DB } from '../../lib/db';
import type { Customer } from '../../lib/types';
import { money, whenFull } from '../format';
import { useAdminGo } from '../Shell';
import { Modal } from '../ui/Modal';
import { toast } from '../ui/toast';

function CustomerModal({ c, onClose, onSaved }: { c: Customer; onClose: () => void; onSaved: () => void }) {
  const go = useAdminGo();
  const [status, setStatus] = useState<'active' | 'blocked'>(c.status ?? 'active');
  const { data: orders = [] } = useQuery({
    queryKey: ['orders', c.id], staleTime: 0,
    queryFn: async () => { const r = await RB_DB.allOrders(c.id ?? undefined); return r.ok ? r.data : []; }
  });

  async function save() {
    const r = await RB_DB.setCustomerStatus(c.id!, status);
    toast(r.ok ? 'Customer updated.' : r.error, !r.ok);
    if (r.ok) { onSaved(); onClose(); }
  }
  return (
    <Modal title={'Customer ' + c.customer_code} onClose={onClose}
      footer={<><button className="btn ghost" onClick={onClose}>Close</button><button className="btn" onClick={save}>Save status</button></>}>
      <div className="grid2">
        <div>
          <h3 style={{ fontSize: '1rem' }}>Account profile</h3>
          <p>{c.full_name || '—'}<br />{c.email || '—'}<br />{c.phone || '—'}<br />{[c.address, c.city].filter(Boolean).join(', ') || 'No address saved'}</p>
          <p style={{ fontSize: '.84rem', color: 'var(--a-mute)' }}>Joined {whenFull(c.created_at)} · {c.order_count || 0} order(s) · {money(c.lifetime_value)} lifetime</p>
        </div>
        <div>
          <h3 style={{ fontSize: '1rem' }}>Account status</h3>
          <div className="field"><select value={status} onChange={e => setStatus(e.target.value as 'active' | 'blocked')}>
            {['active', 'blocked'].map(s => <option key={s}>{s}</option>)}</select></div>
          <button className="btn ghost sm" onClick={() => { onClose(); go('orders', { customerId: c.id, customerName: c.customer_code }); }}>Open all their orders</button>
        </div>
      </div>
      <h3 style={{ fontSize: '1rem', marginTop: 18 }}>Orders</h3>
      {orders.length ? (
        <div className="tablewrap"><table>
          <thead><tr><th>Order</th><th>Placed</th><th>Delivered to</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>{orders.map(o => (
            <tr key={o.id} className="clickrow" onClick={() => { onClose(); go('orders', { openOrder: o.id }); }}>
              <td><b>{o.order_code}</b></td><td>{whenFull(o.placed_at)}</td>
              <td>{o.contact_name}<br /><small style={{ color: 'var(--a-mute)' }}>{o.ship_city}</small></td>
              <td>{money(o.total)}</td><td><span className={'pill ' + o.status}>{o.status}</span></td></tr>))}
          </tbody></table></div>
      ) : <div className="empty">No orders from this account yet.</div>}
    </Modal>
  );
}

export default function Customers() {
  const arg = (useLocation().state ?? {}) as { openCustomer?: string };
  const qc = useQueryClient();
  const { data: list = [], isLoading } = useQuery({
    queryKey: ['customers'], staleTime: 0, refetchOnMount: 'always',
    queryFn: async () => { const r = await RB_DB.customers(); return r.ok ? r.data : []; }
  });
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(arg.openCustomer ?? null);
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return list.filter(c => !s || [c.customer_code, c.full_name, c.email, c.phone, c.city].some(v => String(v ?? '').toLowerCase().includes(s)));
  }, [list, q]);
  const open = openId ? list.find(c => c.id === openId) : undefined;

  return (
    <main className="main" id="view">
      <div className="bar"><div><h1>Customers</h1>
        <p>One permanent record per account, whatever name or address they use at checkout. Guest orders live under Orders.</p></div></div>
      <div className="toolbar"><input type="search" id="cu-q" placeholder="CUST-10025, name, email or phone" value={q} onChange={e => setQ(e.target.value)} /></div>
      <div className="tablewrap"><table>
        <thead><tr><th>Customer</th><th>Name</th><th>Contact</th><th>Orders</th><th>Lifetime value</th><th>Last order</th><th>Status</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={7}><div className="empty">{isLoading ? 'Loading…' : 'No customers match that.'}</div></td></tr>}
          {rows.map(c => (
            <tr key={c.id} className="clickrow" onClick={() => setOpenId(c.id)}>
              <td><b>{c.customer_code}</b><br /><small style={{ color: 'var(--a-mute)' }}>joined {whenFull(c.created_at)}</small></td>
              <td>{c.full_name || '—'}</td>
              <td>{c.email || '—'}<br /><small style={{ color: 'var(--a-mute)' }}>{c.phone || ''}</small></td>
              <td>{c.order_count || 0}</td><td>{money(c.lifetime_value)}</td><td>{whenFull(c.last_order_at)}</td>
              <td><span className={'pill ' + (c.status === 'blocked' ? 'zero' : '')}>{c.status || 'active'}</span></td>
            </tr>))}
        </tbody></table></div>
      {open && <CustomerModal key={open.id} c={open} onClose={() => setOpenId(null)} onSaved={() => void qc.invalidateQueries({ queryKey: ['customers'] })} />}
    </main>
  );
}
