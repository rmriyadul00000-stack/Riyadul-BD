import { rbEffPrice, rbPromoState } from '../lib/db';
import type { Product, Variant } from '../lib/types';
import { when, whenFull } from './format';

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const slugify = (s: string) => s.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
export const stockOf = (p: Product) => p.variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);

/** The discount % a product shows: an explicit override wins, else Was vs Price of the cheapest discounted size. */
export function effectiveDiscount(p: Pick<Product, 'variants' | 'discount_pct'>): number | null {
  if (p.discount_pct != null && (p.discount_pct as unknown) !== '') return Number(p.discount_pct);
  const vs = p.variants.filter(v => v.mrp && v.price && v.mrp > v.price);
  if (!vs.length) return null;
  const v = vs.reduce((a, b) => (a.price < b.price ? a : b));
  return Math.round((v.mrp! - v.price) / v.mrp! * 100);
}

export const minEffPrice = (p: Product) => Math.min(...(p.variants.length ? p.variants.map(v => rbEffPrice(p, v)) : [0]));
export const minDefPrice = (p: Product) => Math.min(...(p.variants.length ? p.variants.map(v => Number(v.price) || 0) : [0]));
export const rowDiscount = (v: Variant): number | '' => (v.mrp && v.price && v.mrp > v.price ? Math.round((v.mrp - v.price) / v.mrp * 100) : '');

export const toLocalInput = (iso?: string | null) => {
  if (!iso) return '';
  const d = new Date(iso), p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

export function timeLeft(iso: string, now = Date.now()) {
  const abs = Math.abs(+new Date(iso) - now);
  const d = Math.floor(abs / 864e5), h = Math.floor(abs % 864e5 / 36e5), m = Math.floor(abs % 36e5 / 6e4);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
}

export function PromoBadge({ p }: { p: Product }) {
  const st = rbPromoState(p);
  if (st === 'none') return null;
  if (st === 'active') return <span className="pill promo-on" title={`Ends ${p.promo_end ? whenFull(p.promo_end) : 'never'}`}>Promo{p.promo_end ? ` · ${timeLeft(p.promo_end)} left` : ''}</span>;
  if (st === 'scheduled') return <span className="pill shipped">Starts in {timeLeft(p.promo_start!)}</span>;
  return <span className="pill off">Promo ended</span>;
}
export { when };

export const COST_FIELDS: [keyof Variant, string, string][] = [
  ['cost', 'Buying cost', 'Price paid to the farm or supplier'],
  ['cost_transport', 'Transport', 'Getting it to you'],
  ['cost_packaging', 'Packaging', 'Boxes, jars, labels'],
  ['cost_labor', 'Labor', 'Cleaning, sorting, packing time'],
  ['cost_storage', 'Storage', 'Cold room, rent share, electricity'],
  ['cost_other', 'Other', 'Anything else (explain in the note)']
];
export const LOG_LABEL: Record<string, string> = { purchase: 'Stock in', adjustment: 'Adjustment', wastage: 'Wastage', expense: 'Expense', note: 'Note', sale: 'Sale', return: 'Return', price_change: 'Price change', cost_change: 'Cost change' };
export const LOG_PILL: Record<string, string> = { purchase: 'confirmed', adjustment: 'shipped', wastage: 'cancelled', expense: 'low', note: 'off', sale: 'delivered', return: 'pending', price_change: 'shipped', cost_change: 'shipped' };

export const sgn = (n: number) => (n > 0 ? 'pos' : n < 0 ? 'neg' : '');
export const pctTxt = (n: number | null | undefined) => (n == null ? '—' : `${Math.round(n * 10) / 10}%`);
