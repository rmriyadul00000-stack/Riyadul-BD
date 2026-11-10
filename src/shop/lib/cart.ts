import { useSyncExternalStore } from 'react';
import type { CartLine, Coupon, Product } from '../../lib/types';
import { SHOP } from './shop';
import { toast } from './toast';

const KEY = 'rb.cart';
const read = (): CartLine[] => {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as CartLine[]; } catch { return []; }
};

let lines: CartLine[] = read();
const listeners = new Set<() => void>();
const write = (next: CartLine[]) => {
  lines = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  listeners.forEach(l => l());
};
/* another tab changed the basket */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => { if (e.key === KEY) { lines = read(); listeners.forEach(l => l()); } });
}

export const cart = {
  subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l); }; },
  snapshot: () => lines,

  add(product: Product, variantLabel: string, qty = 1): boolean {
    const v = product.variants.find(x => x.label === variantLabel) ?? product.variants[0];
    const key = `${product.id}|${v.label}`;
    const line = lines.find(i => i.key === key);
    if ((line ? line.qty : 0) + qty > (v.stock || 0)) {
      toast(`Only ${v.stock} left of ${product.name} (${v.label}).`, true);
      return false;
    }
    write(line
      ? lines.map(i => i.key === key ? { ...i, qty: i.qty + qty } : i)
      : [...lines, {
          key, id: product.id, slug: product.slug, name: product.name, variant: v.label,
          price: v.price, mrp: v.mrp || 0, stock: v.stock || 0, image: product.images[0] || '', qty
        }]);
    toast(`${product.name} added to your basket.`);
    return true;
  },
  setQty(key: string, qty: number): void {
    const line = lines.find(i => i.key === key);
    if (!line) return;
    if (qty <= 0) write(lines.filter(i => i.key !== key));
    else if (qty > line.stock) toast(`Only ${line.stock} in stock.`, true);
    else write(lines.map(i => i.key === key ? { ...i, qty } : i));
  },
  remove: (key: string) => write(lines.filter(i => i.key !== key)),
  clear: () => write([])
};

export const useCart = (): CartLine[] => useSyncExternalStore(cart.subscribe, cart.snapshot);

export const cartCount = (l: CartLine[]) => l.reduce((s, i) => s + i.qty, 0);
export const cartSubtotal = (l: CartLine[]) => l.reduce((s, i) => s + i.price * i.qty, 0);

export function shippingFor(l: CartLine[], zone: 'inside' | 'outside', coupon: Coupon | null): number {
  const sub = cartSubtotal(l);
  if (!sub) return 0;
  if (coupon?.type === 'shipping') return 0;
  if (sub >= SHOP.delivery.freeOver) return 0;
  return zone === 'outside' ? SHOP.delivery.outside : SHOP.delivery.inside;
}

export function discountFor(l: CartLine[], coupon: Coupon | null): number {
  if (!coupon) return 0;
  const sub = cartSubtotal(l);
  if (coupon.type === 'percent') return Math.round(sub * coupon.value / 100);
  if (coupon.type === 'flat') return Math.min(coupon.value, sub);
  return 0;
}
