import type { Order, OrderStatus } from '../../lib/types';
import { useAdminGo } from '../Shell';

export const ORDER_STEPS: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered'];
export const STATUSES: OrderStatus[] = [...ORDER_STEPS, 'cancelled'];

export function ProgressLine({ status }: { status: OrderStatus }) {
  if (status === 'cancelled') return <div className="progress cancelled"><span className="pstep done">Cancelled</span></div>;
  const at = Math.max(0, ORDER_STEPS.indexOf(status));
  return (
    <div className="progress">
      {ORDER_STEPS.map((s, i) => <span key={s} className={'pstep ' + (i < at ? 'done' : i === at ? 'now' : '')}>{s[0].toUpperCase() + s.slice(1)}</span>)}
    </div>
  );
}

export function CustomerTag({ o }: { o: Order }) {
  const go = useAdminGo();
  if (o.is_guest) return <span className="pill guest">GUEST</span>;
  return <a className="pill" href="#" onClick={e => { e.preventDefault(); e.stopPropagation(); go('customers', { openCustomer: o.customer_id }); }}>{o.customers?.customer_code || 'Account'}</a>;
}
