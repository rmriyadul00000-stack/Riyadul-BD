import type { Product } from '../../lib/types';

/* Shop details — phone, WhatsApp, hours and delivery rules. The delivery
   rule also lives in place_order() in the database; change both together. */
export const SHOP = {
  name: 'Riyadul BD',
  tagline: 'Organic food, straight from the farm',
  phone: '+880 1700 000000',
  whatsapp: '8801700000000',
  email: 'hello@riyadulbd.com',
  address: 'House 14, Road 7, Dhanmondi, Dhaka 1205',
  hours: 'Saturday to Thursday, 9am – 8pm',
  currency: '৳',
  delivery: { inside: 60, outside: 120, freeOver: 2000 }
} as const;

export const LOGO_DEFAULT = '/assets/img/logo.svg';

export const money = (n: number | null | undefined): string =>
  SHOP.currency + Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 });

export const lowestPrice = (p: Product): number =>
  Math.min(...(p.variants.length ? p.variants : [{ price: 0 }]).map(v => v.price));

export const stockOf = (p: Product): number => p.variants.reduce((s, v) => s + (v.stock || 0), 0);

export const discountPct = (p: Product): number => {
  const v = p.variants[0];
  if (!v || !v.mrp || v.mrp <= v.price) return 0;
  return Math.round((1 - v.price / v.mrp) * 100);
};

export const fmtDate = (iso: string, long = false): string =>
  new Date(iso).toLocaleString('en-GB', long
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
