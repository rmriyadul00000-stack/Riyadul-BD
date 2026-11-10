import type { Order } from '../../lib/types';
import { fmtDate, money } from '../lib/shop';

const STEPS = ['pending', 'confirmed', 'shipped', 'delivered'] as const;
const LABEL: Record<string, string> = { pending: 'Pending', confirmed: 'Confirmed', shipped: 'Shipped', delivered: 'Delivered' };
const NOTE: Record<string, string> = {
  pending: 'We have your order and will call to confirm.',
  confirmed: 'Confirmed — being packed at the farm desk.',
  shipped: 'On the way with the courier.',
  delivered: 'Delivered. Thank you.',
  cancelled: 'This order was cancelled. Call us if that looks wrong.'
};

function Progress({ status }: { status: string }) {
  if (status === 'cancelled') return <div className="progress cancelled"><span className="pstep done">Cancelled</span></div>;
  const at = Math.max(0, STEPS.indexOf(status as (typeof STEPS)[number]));
  return (
    <div className="progress" style={{ '--at': at } as React.CSSProperties}>
      {STEPS.map((s, i) => <span key={s} className={'pstep ' + (i < at ? 'done' : i === at ? 'now' : '')}>{LABEL[s]}</span>)}
    </div>
  );
}

export function OrderCard({ o }: { o: Order }) {
  const items = o.items ?? [];
  const to = [o.contact_name, [o.ship_address, o.ship_city].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return (
    <div className="order">
      <div className="order-head">
        <div><b>{o.order_code}</b><br /><span className="muted small">{fmtDate(o.placed_at, true)}</span></div>
        <span className={'status ' + o.status}>{o.status}</span>
      </div>
      <Progress status={o.status} />
      <p className="small muted" style={{ margin: '0 0 12px' }}>{NOTE[o.status] || ''}</p>
      <div className="tablewrap"><table className="data"><tbody>
        <tr><th>Item</th><th>Size</th><th>Qty</th><th>Price</th></tr>
        {items.map((i, k) => <tr key={k}><td>{i.product_name}</td><td>{i.variant_label}</td><td>{i.qty}</td><td>{money(i.unit_price * i.qty)}</td></tr>)}
      </tbody></table></div>
      <div className="totals" style={{ marginTop: 12 }}>
        <div><span>Delivered to</span><span>{to}</span></div>
        <div className="grand"><span>Total</span><span>{money(o.total)}</span></div>
      </div>
    </div>
  );
}
