import { RB_DB } from '../lib/db';
import { NAV_ITEMS } from './nav';
import { money } from './format';
import { minEffPrice } from './productHelpers';
import type { Customer, Order, Product } from '../lib/types';

export interface SearchHit { group: string; title: string; sub?: string; run: () => void }

let cache: { at: number; orders: Order[]; customers: Customer[]; products: Product[] } | null = null;

/** One search for the whole panel: pages, orders, customers and products. */
export async function searchAdmin(q: string, go: (key: string, arg?: unknown) => void, openItem: (id: string) => void): Promise<SearchHit[]> {
  if (!cache || Date.now() - cache.at > 30_000) {
    const [o, c, p] = await Promise.all([RB_DB.allOrders(), RB_DB.customers(), RB_DB.products(true)]);
    cache = { at: Date.now(), orders: o.ok ? o.data : [], customers: c.ok ? c.data : [], products: p.ok ? p.data : [] };
  }
  const s = q.trim().toLowerCase();
  const has = (...v: unknown[]) => v.some(x => String(x ?? '').toLowerCase().includes(s));
  const out: SearchHit[] = NAV_ITEMS.filter(n => !s || n.label.toLowerCase().includes(s)).map(n => ({ group: 'Pages', title: n.label, run: () => go(n.key) }));
  if (s.length < 2) return out;
  cache.orders.filter(o => has(o.order_code, o.contact_name, o.contact_phone, o.contact_email)).slice(0, 6)
    .forEach(o => out.push({ group: 'Orders', title: `${o.order_code} · ${o.contact_name}`, sub: `${money(o.total)} · ${o.status}`, run: () => go('orders', { openOrder: o.id }) }));
  cache.customers.filter(c => has(c.customer_code, c.full_name, c.email, c.phone)).slice(0, 5)
    .forEach(c => out.push({ group: 'Customers', title: `${c.full_name || c.email || 'Customer'} · ${c.customer_code}`, sub: c.phone || c.email || '', run: () => go('customers', { openCustomer: c.id }) }));
  cache.products.filter(p => has(p.name, p.name_bn, p.sku, p.farm)).slice(0, 6)
    .forEach(p => out.push({ group: 'Products', title: p.name, sub: `${p.sku ?? ''} · ${money(minEffPrice(p))}`, run: () => openItem(p.id) }));
  return out;
}
export const clearSearchCache = () => { cache = null; };
