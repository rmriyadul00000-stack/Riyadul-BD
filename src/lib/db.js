/* ============================================================
   Riyadul BD — data layer
   Every page talks to RB_DB only. Behind it:

   1. Supabase  — the real system: customers, orders, order items,
                  categories, hero slides and storage live in the database,
                  and place_order() writes an order and its lines in one
                  transaction.
   2. Browser   — the same tables and ID formats in localStorage. Used for
                  local development without keys, and as the read-only /
                  preview fallback while the Supabase project is paused.

   Keys come from src/lib/config.ts. Only the publishable (anon) key may
   ever be used here; it ships to every visitor.
   ============================================================ */

import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, HAS_BACKEND } from './config';
import { probeBackend } from './backend';
import { RB_SETTINGS, RB_PRODUCTS, RB_CATEGORIES, RB_COUPONS, RB_HERO } from './seed.js';
import { demoDataset } from './demo.js';

/* admin.html sets window.RB_IS_ADMIN = true before this module loads, so
   the admin session and the shopper session never share a storage key. */
const IS_ADMIN = Boolean(window.RB_IS_ADMIN);
const sb = HAS_BACKEND
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { storageKey: IS_ADMIN ? 'rb-admin-auth' : 'rb-customer-auth' }
    })
  : null;

/* Three modes, decided once per page by `ready` below:
     live    — Supabase answers; the real system.
     offline — keys are set but the project is paused/unreachable. The shop
               shows the last catalogue this browser saw (or the starter
               catalogue), read-only: ordering, sign-in and the contact form
               say so plainly instead of pretending to work. The admin panel
               opens in preview with sample data.
     local   — no keys at all; everything runs on browser storage (dev). */
let RB_MODE = HAS_BACKEND ? 'live' : 'local';
let RB_LIVE = false;
let LS_PREFIX = 'rb.';
const OFFLINE_MSG = 'Online ordering is paused for a short while. Please call or WhatsApp us and we will take your order by hand.';
const shopOffline = () => RB_MODE === 'offline' && !IS_ADMIN;

const ok = (data) => ({ ok: true, data });
const fail = (e) => ({ ok: false, error: (e && e.message) || String(e || 'Something went wrong') });
const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

const RB_DEFAULT_SETTINGS = {
  announcement_text: '', logo_url: '', logo_height: '40', logo_width: '',
  logo_fit: 'contain', logo_shape: 'none', hotdeals_title: 'Hot Deals', low_stock_threshold: '5'
};
const rbSettingsBase = () => ({ ...RB_DEFAULT_SETTINGS, ...RB_SETTINGS });

/* last catalogue seen while live, so a paused database does not empty the shop */
const SNAP = {
  save(k, v) { if (IS_ADMIN) return; try { localStorage.setItem('rb.snap.' + k, JSON.stringify(v)); localStorage.setItem('rb.snap.at', String(Date.now())); } catch {} },
  get(k) { try { return JSON.parse(localStorage.getItem('rb.snap.' + k) || 'null'); } catch { return null; } },
  at() { try { return Number(localStorage.getItem('rb.snap.at') || 0); } catch { return 0; } }
};
const rbSeed = {
  products: () => (RB_MODE === 'offline' && SNAP.get('products')) || RB_PRODUCTS,
  categories: () => (RB_MODE === 'offline' && SNAP.get('categories')) || RB_CATEGORIES,
  coupons: () => RB_COUPONS,
  hero: () => (RB_MODE === 'offline' && SNAP.get('hero')) || RB_HERO,
  settings: () => ({ ...rbSettingsBase(), ...((RB_MODE === 'offline' && SNAP.get('settings')) || {}) })
};

/* ---------- local backend ---------- */
const LS = {
  get(k, d) { try { const v = localStorage.getItem(LS_PREFIX + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS_PREFIX + k, JSON.stringify(v)); } catch {} }
};
function seedLocal() {
  /* a newer live snapshot replaces the offline copy of the catalogue */
  if (RB_MODE === 'offline' && SNAP.at() > (LS.get('snapAt') || 0)) {
    ['products', 'categories', 'hero', 'settings'].forEach(k => LS.set(k, null));
    LS.set('snapAt', SNAP.at());
  }
  if (!LS.get('products'))    LS.set('products', rbSeed.products());
  if (!LS.get('categories'))  LS.set('categories', rbSeed.categories());
  if (!LS.get('coupons'))     LS.set('coupons', rbSeed.coupons());
  if (!LS.get('hero'))        LS.set('hero', rbSeed.hero());
  if (!LS.get('orders'))      LS.set('orders', []);
  if (!LS.get('order_items')) LS.set('order_items', []);
  if (!LS.get('customers'))   LS.set('customers', []);
  if (!LS.get('messages'))    LS.set('messages', []);
  if (!LS.get('wishlist'))    LS.set('wishlist', []);
  if (!LS.get('settings'))    LS.set('settings', rbSeed.settings());
  if (!LS.get('seq'))         LS.set('seq', { cust: 10001, order: 10001 });
  /* the admin preview gets a believable month of trading to look at */
  if (IS_ADMIN && !LS.get('demoSeeded')) {
    const d = demoDataset(LS.get('products', []), { unitCost: rbUnitCost });
    LS.set('products', d.products); LS.set('customers', d.customers); LS.set('orders', d.orders);
    LS.set('order_items', d.order_items); LS.set('inventory_log', d.inventory_log);
    LS.set('messages', d.messages); LS.set('seq', d.seq); LS.set('demoSeeded', true);
  }
}
function nextCode(kind) {
  const seq = LS.get('seq', { cust: 10001, order: 10001 });
  const n = seq[kind]++; LS.set('seq', seq);
  return (kind === 'cust' ? 'CUST-' : 'ORD-') + n;
}

/* ---------- row mapping ---------- */
/* ---------- scheduled promo + cost helpers (shared by the shop and the admin) ----------
   A promo is a per-size `promo_price` plus a start/end window on the product.
   Everything is evaluated against "now" each time, so an expired promo simply
   stops applying: no scheduled job, nothing to reset by hand. The same rule
   lives in SQL (rb_promo_active / rb_variant_price) so checkout charges the
   same price the shop displays. */
const RB_COST_KEYS = ['cost', 'cost_transport', 'cost_packaging', 'cost_labor', 'cost_storage', 'cost_other'];
function rbUnitCost(v) { return RB_COST_KEYS.reduce((s, k) => s + (Number(v && v[k]) || 0), 0); }
/* 'none' | 'scheduled' | 'active' | 'expired' */
function rbPromoState(p, now) {
  now = now || Date.now();
  if (!(p.variants || []).some(v => Number(v.promo_price) > 0)) return 'none';
  const s = p.promo_start ? Date.parse(p.promo_start) : null;
  const e = p.promo_end ? Date.parse(p.promo_end) : null;
  if (s && now < s) return 'scheduled';
  if (e && now > e) return 'expired';
  return 'active';
}
function rbEffPrice(p, v, now) {
  return (rbPromoState(p, now) === 'active' && Number(v.promo_price) > 0) ? Number(v.promo_price) : Number(v.price) || 0;
}
/* what a shopper should see right now */
function rbResolveForShop(p) {
  const state = rbPromoState(p);
  const out = { ...p, promo_state: state };
  if (state === 'active') {
    out.variants = (p.variants || []).map(v => Number(v.promo_price) > 0
      ? { ...v, mrp: Number(v.mrp) > 0 ? v.mrp : v.price, price: Number(v.promo_price) } : v);
    out.discount_pct = null;               // badge follows the promo price while it runs
  }
  if (state === 'expired' && p.hot_deal_auto) out.hot_deal = false;
  return out;
}

function rowToProduct(r) {
  return {
    id: r.id, sku: r.sku, slug: r.slug, name: r.name, name_bn: r.name_bn, cat: r.cat,
    category_id: r.category_id, farm: r.farm, origin: r.origin,
    variants: r.variants || [], images: r.images || [],
    certified: !!r.certified, featured: !!r.featured, active: r.active !== false,
    hot_deal: !!r.hot_deal, hot_deal_sort: r.hot_deal_sort || 0,
    discount_pct: r.discount_pct == null ? null : Number(r.discount_pct),
    description: r.description || '', benefits: r.benefits || [], storage_tip: r.storage_tip || '',
    promo_start: r.promo_start, promo_end: r.promo_end, hot_deal_auto: r.hot_deal_auto
  };
}
/* category_id is resolved explicitly here (see saveProduct) rather than
   left to the database trigger — sending `cat` without a matching
   `category_id` let the old trigger snap the slug back to whatever
   category_id already sat on the row, which is why an admin's category
   change looked saved but reverted on refresh. `sku` is assigned by the
   database sequence and never sent back up on save. */
const productToRow = (p) => ({
  slug: p.slug, name: p.name, name_bn: p.name_bn || null, cat: p.cat,
  category_id: p.category_id || null, farm: p.farm || null, origin: p.origin || null,
  variants: p.variants || [], images: p.images || [],
  certified: !!p.certified, featured: !!p.featured, active: p.active !== false,
  hot_deal: !!p.hot_deal, hot_deal_sort: p.hot_deal_sort || 0,
  discount_pct: p.discount_pct == null || p.discount_pct === '' ? null : Number(p.discount_pct),
  description: p.description || '', benefits: p.benefits || [], storage_tip: p.storage_tip || '',
  /* only sent when present, so the panel still saves before the pending SQL has been run */
  ...(p.promo_start !== undefined ? { promo_start: p.promo_start || null } : {}),
  ...(p.promo_end !== undefined ? { promo_end: p.promo_end || null } : {}),
  ...(p.hot_deal_auto !== undefined ? { hot_deal_auto: !!p.hot_deal_auto } : {})
});

/* stock follows cancellation both ways: cancelling returns the units,
   re-opening a cancelled order takes them again */
function localRestock(order, sign) {
  const products = LS.get('products', []), log = LS.get('inventory_log', []);
  LS.get('order_items', []).filter(i => i.order_id === order.id).forEach(i => {
    const p = products.find(x => x.id === i.product_id);
    const v = p && (p.variants || []).find(x => x.label === i.variant_label);
    if (!v) return;
    v.stock = Math.max(0, (Number(v.stock) || 0) + sign * i.qty);
    log.unshift({
      id: uid('lg'), product_id: p.id, variant_label: v.label, kind: sign > 0 ? 'return' : 'sale', qty: i.qty,
      unit_cost: i.unit_cost == null ? null : i.unit_cost, amount: (Number(i.unit_price) || 0) * i.qty,
      note: (sign > 0 ? 'Cancelled ' : 'Re-opened ') + order.order_code, created_at: new Date().toISOString()
    });
  });
  LS.set('products', products); LS.set('inventory_log', log);
}

const impl = {
  client: sb,

  /* ===================== CATEGORIES ===================== */
  async categories(includeHidden = false) {
    if (!RB_LIVE) {
      const all = LS.get('categories', []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      return ok(includeHidden ? all : all.filter(c => c.active !== false));
    }
    let q = sb.from('categories').select('*').order('sort');
    if (!includeHidden) q = q.eq('active', true);
    const { data, error } = await q;
    if (!error && !includeHidden) SNAP.save('categories', data);
    return error ? fail(error) : ok(data);
  },
  async saveCategory(c) {
    if (!RB_LIVE) {
      const all = LS.get('categories', []);
      if (c.id) { const i = all.findIndex(x => x.id === c.id); if (i > -1) all[i] = { ...all[i], ...c }; }
      else all.push({ ...c, id: uid('c') });
      LS.set('categories', all); return ok(c);
    }
    const row = {
      slug: c.slug, name: c.name, name_bn: c.name_bn || null,
      icon_svg: c.icon_svg || null, image_url: c.image_url || null,
      desktop_banner_url: c.desktop_banner_url || null,
      mobile_banner_url: c.mobile_banner_url || null,
      sort: c.sort || 0, active: c.active !== false
    };
    const { data, error } = c.id
      ? await sb.from('categories').update(row).eq('id', c.id).select().single()
      : await sb.from('categories').insert([row]).select().single();
    return error ? fail(error) : ok(data);
  },
  async deleteCategory(id) {
    if (!RB_LIVE) { LS.set('categories', LS.get('categories', []).filter(c => c.id !== id)); return ok(true); }
    const { error } = await sb.from('categories').delete().eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ===================== HERO SLIDES ===================== */
  async hero(device, includeHidden = false) {
    if (!RB_LIVE) {
      let all = LS.get('hero', []).slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
      if (device) all = all.filter(h => h.device === device);
      return ok(includeHidden ? all : all.filter(h => h.active !== false));
    }
    let q = sb.from('hero_slides').select('*').order('sort');
    if (device) q = q.eq('device', device);
    if (!includeHidden) q = q.eq('active', true);
    const { data, error } = await q;
    if (!error && !includeHidden && !device) SNAP.save('hero', data);
    return error ? fail(error) : ok(data);
  },
  async saveHeroSlide(s) {
    if (!RB_LIVE) {
      const all = LS.get('hero', []);
      if (s.id) { const i = all.findIndex(x => x.id === s.id); if (i > -1) all[i] = { ...all[i], ...s }; }
      else all.push({ ...s, id: uid('h') });
      LS.set('hero', all); return ok(s);
    }
    const row = { device: s.device, image_url: s.image_url, alt: s.alt || null, sort: s.sort || 0, active: s.active !== false };
    const { data, error } = s.id
      ? await sb.from('hero_slides').update(row).eq('id', s.id).select().single()
      : await sb.from('hero_slides').insert([row]).select().single();
    return error ? fail(error) : ok(data);
  },
  async deleteHeroSlide(id) {
    if (!RB_LIVE) { LS.set('hero', LS.get('hero', []).filter(h => h.id !== id)); return ok(true); }
    const { error } = await sb.from('hero_slides').delete().eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ===================== PRODUCTS ===================== */
  async products(includeHidden = false) {
    if (!RB_LIVE) {
      const all = LS.get('products', []);
      const list = includeHidden ? all : all.filter(p => p.active !== false);
      return ok(IS_ADMIN ? list : list.map(rbResolveForShop));
    }
    let q = sb.from('products').select('*').order('created_at', { ascending: false });
    if (!includeHidden) q = q.eq('active', true);
    const { data, error } = await q;
    if (error) return fail(error);
    const list = data.map(rowToProduct);
    if (!includeHidden) SNAP.save('products', list);
    return ok(IS_ADMIN ? list : list.map(rbResolveForShop));
  },
  async product(slug) {
    if (!RB_LIVE) {
      const p = LS.get('products', []).find(x => x.slug === slug || x.id === slug);
      return p ? ok(IS_ADMIN ? p : rbResolveForShop(p)) : fail('That product is no longer listed.');
    }
    const { data, error } = await sb.from('products').select('*').eq('slug', slug).single();
    if (error) return fail(error);
    return ok(IS_ADMIN ? rowToProduct(data) : rbResolveForShop(rowToProduct(data)));
  },
  async saveProduct(p) {
    if (!RB_LIVE) {
      const all = LS.get('products', []);
      if (p.id) { const i = all.findIndex(x => x.id === p.id); if (i > -1) all[i] = { ...all[i], ...p }; }
      else {
        const nextSku = 'P-' + (1000 + all.length + 1);
        all.unshift({ ...p, id: uid('p'), sku: p.sku || nextSku });
      }
      LS.set('products', all); return ok(p);
    }
    /* Always resolve category_id fresh from the chosen slug so the two
       never disagree — see the note on productToRow above. */
    const { data: catRow } = await sb.from('categories').select('id').eq('slug', p.cat).maybeSingle();
    const row = productToRow({ ...p, category_id: catRow ? catRow.id : null });
    const { data, error } = p.id
      ? await sb.from('products').update(row).eq('id', p.id).select().single()
      : await sb.from('products').insert([row]).select().single();
    return error ? fail(error) : ok(rowToProduct(data));
  },
  async deleteProduct(id) {
    if (!RB_LIVE) { LS.set('products', LS.get('products', []).filter(p => p.id !== id)); return ok(true); }
    const { error } = await sb.from('products').delete().eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ===================== STORAGE ===================== */
  async uploadImage(file, bucket = 'product-media') {
    if (!RB_LIVE) {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = () => rej(new Error('Could not read that file'));
        r.readAsDataURL(file);
      });
      return ok(dataUrl);
    }
    const path = `${uid('')}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, { upsert: true });
    if (error) return fail(error);
    return ok(sb.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  },

  /* ===================== COUPONS ===================== */
  async coupons(includeHidden = false) {
    if (!RB_LIVE) {
      const all = LS.get('coupons', []);
      return ok(includeHidden ? all : all.filter(c => c.active !== false));
    }
    let q = sb.from('coupons').select('*');
    if (!includeHidden) q = q.eq('active', true);
    const { data, error } = await q;
    return error ? fail(error) : ok(data);
  },
  async validateCoupon(code, subtotal) {
    const res = await this.coupons();
    if (!res.ok) return res;
    const c = res.data.find(x => x.code.toUpperCase() === String(code).trim().toUpperCase());
    if (!c) return fail('That code is not valid.');
    if (subtotal < (c.min_subtotal || 0)) return fail(`Spend ৳${c.min_subtotal} to use this code.`);
    return ok(c);
  },
  async saveCoupon(c) {
    if (!RB_LIVE) {
      const all = LS.get('coupons', []);
      const i = all.findIndex(x => x.code === c.code);
      if (i > -1) all[i] = { ...all[i], ...c }; else all.push(c);
      LS.set('coupons', all); return ok(c);
    }
    const { data, error } = await sb.from('coupons').upsert(c, { onConflict: 'code' }).select().single();
    return error ? fail(error) : ok(data);
  },
  async deleteCoupon(code) {
    if (!RB_LIVE) { LS.set('coupons', LS.get('coupons', []).filter(c => c.code !== code)); return ok(true); }
    const { error } = await sb.from('coupons').delete().eq('code', code);
    return error ? fail(error) : ok(true);
  },

  /* ===================== AUTH & CUSTOMER ACCOUNT ===================== */
  async register({ email, password, full_name, phone }) {
    if (shopOffline()) return fail(OFFLINE_MSG);
    if (!RB_LIVE) {
      const all = LS.get('customers', []);
      if (all.some(c => c.email === email)) return fail('An account already uses this email. Sign in instead.');
      const c = {
        id: uid('cu'), customer_code: nextCode('cust'), email, password,
        full_name, phone, city: '', address: '', status: 'active',
        created_at: new Date().toISOString()
      };
      all.push(c); LS.set('customers', all); LS.set('session', c.id);
      return ok(c);
    }
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { full_name, phone } } });
    return error ? fail(error) : ok(data.user);
  },
  async login({ email, password }) {
    if (shopOffline()) return fail(OFFLINE_MSG);
    if (!RB_LIVE) {
      const c = LS.get('customers', []).find(x => x.email === email && x.password === password);
      if (!c) return fail('Email or password is wrong.');
      if (c.status === 'blocked') return fail('This account has been blocked. Contact the shop.');
      LS.set('session', c.id); return ok(c);
    }
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    return error ? fail(error) : ok(data.user);
  },
  async logout() {
    if (!RB_LIVE) { LS.set('session', null); return ok(true); }
    await sb.auth.signOut(); return ok(true);
  },

  /* The signed-in customer's permanent account row — never the contact
     details typed into a checkout. Returns null for a guest. */
  async me() {
    if (!RB_LIVE) {
      const id = LS.get('session', null);
      return id ? (LS.get('customers', []).find(c => c.id === id) || null) : null;
    }
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return null;
    const { data: row } = await sb.from('customers').select('*').eq('user_id', data.user.id).maybeSingle();
    return row || { id: null, email: data.user.email, full_name: '', phone: '' };
  },
  async updateMyAccount(patch) {
    if (!RB_LIVE) {
      const id = LS.get('session', null);
      const all = LS.get('customers', []);
      const i = all.findIndex(c => c.id === id);
      if (i < 0) return fail('You are signed out. Sign in and try again.');
      all[i] = { ...all[i], ...patch }; LS.set('customers', all); return ok(all[i]);
    }
    const me = await this.me();
    if (!me || !me.id) return fail('You are signed out. Sign in and try again.');
    const { data, error } = await sb.from('customers').update(patch).eq('id', me.id).select().single();
    return error ? fail(error) : ok(data);
  },

  /* ===================== CUSTOMERS (admin) ===================== */
  async customers() {
    if (!RB_LIVE) {
      const orders = LS.get('orders', []);
      return ok(LS.get('customers', []).map(c => {
        const mine = orders.filter(o => o.customer_id === c.id);
        return {
          ...c,
          order_count: mine.length,
          lifetime_value: mine.filter(o => o.status !== 'cancelled').reduce((s, o) => s + (o.total || 0), 0),
          last_order_at: mine.length ? mine[0].placed_at : null
        };
      }));
    }
    const { data, error } = await sb.from('customer_overview').select('*').order('created_at', { ascending: false });
    return error ? fail(error) : ok(data);
  },
  async customer(id) {
    if (!RB_LIVE) {
      const c = (await this.customers()).data.find(x => x.id === id);
      return c ? ok(c) : fail('No customer with that ID.');
    }
    const { data, error } = await sb.from('customer_overview').select('*').eq('id', id).single();
    return error ? fail(error) : ok(data);
  },
  async setCustomerStatus(id, status) {
    if (!RB_LIVE) {
      const all = LS.get('customers', []);
      const i = all.findIndex(c => c.id === id);
      if (i > -1) { all[i].status = status; LS.set('customers', all); }
      return ok(true);
    }
    const { error } = await sb.from('customers').update({ status }).eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ===================== ORDERS ===================== */
  /* The payload carries only this order's contact and delivery details.
     The database decides whether it belongs to an account or is a guest
     order — the checkout email is never used to guess. */
  async placeOrder(payload) {
    if (shopOffline()) return fail(OFFLINE_MSG);
    if (!RB_LIVE) {
      const me = await this.me();
      const products = LS.get('products', []);
      let subtotal = 0;
      const lines = [];
      for (const it of payload.items) {
        const p = products.find(x => x.id === it.product_id);
        if (!p) return fail('A product in the basket is no longer available.');
        const v = (p.variants || []).find(x => x.label === it.variant_label);
        if (!v) return fail('That size is no longer sold: ' + it.variant_label);
        if (it.qty > (v.stock || 0)) return fail(`Only ${v.stock} left of ${p.name} (${v.label}).`);
        const price = rbEffPrice(p, v), cost = rbUnitCost(v);
        v.stock -= it.qty;
        subtotal += price * it.qty;
        lines.push({
          id: uid('li'), product_id: p.id, product_name: p.name,
          variant_label: v.label, unit_price: price, unit_cost: cost, qty: it.qty, line_total: price * it.qty
        });
      }
      LS.set('products', products);

      let shipping_fee = payload.ship_zone === 'outside' ? 120 : 60;
      let discount = 0, coupon_code = null;
      if (payload.coupon_code) {
        const c = LS.get('coupons', []).find(x =>
          x.code.toUpperCase() === payload.coupon_code.toUpperCase() && x.active !== false);
        if (c && subtotal >= (c.min_subtotal || 0)) {
          coupon_code = c.code;
          if (c.type === 'percent') discount = Math.round(subtotal * c.value / 100);
          else if (c.type === 'flat') discount = Math.min(c.value, subtotal);
          else if (c.type === 'shipping') shipping_fee = 0;
        }
      }
      if (subtotal >= 2000) shipping_fee = 0;

      const order = {
        id: uid('o'), order_code: nextCode('order'),
        customer_id: me ? me.id : null, is_guest: !me,
        contact_name: payload.contact_name, contact_email: payload.contact_email,
        contact_phone: payload.contact_phone, ship_address: payload.ship_address,
        ship_city: payload.ship_city, ship_zone: payload.ship_zone || 'inside',
        note: payload.note || '', payment_method: payload.payment_method || 'cod',
        payment_status: 'unpaid',
        subtotal, discount, shipping_fee, total: Math.max(0, subtotal - discount + shipping_fee),
        coupon_code, status: 'pending', placed_at: new Date().toISOString()
      };
      const orders = LS.get('orders', []); orders.unshift(order); LS.set('orders', orders);
      const items = LS.get('order_items', []);
      lines.forEach(l => items.push({ ...l, order_id: order.id }));
      LS.set('order_items', items);
      const log = LS.get('inventory_log', []);
      lines.forEach(l => log.unshift({
        id: uid('lg'), product_id: l.product_id, variant_label: l.variant_label, kind: 'sale', qty: l.qty,
        unit_cost: l.unit_cost, amount: l.line_total, note: 'Order ' + order.order_code, created_at: order.placed_at
      }));
      LS.set('inventory_log', log);
      return ok({ order_id: order.id, order_code: order.order_code, total: order.total });
    }

    const { data, error } = await sb.rpc('place_order', { payload });
    if (error) return fail(error);
    const row = Array.isArray(data) ? data[0] : data;
    fetch('/.netlify/functions/send-order-email', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, ...row })
    }).catch(() => {});
    return ok(row);
  },

  async orderItems(orderId) {
    if (!RB_LIVE) return ok(LS.get('order_items', []).filter(i => i.order_id === orderId));
    const { data, error } = await sb.from('order_items').select('*').eq('order_id', orderId);
    return error ? fail(error) : ok(data);
  },

  /* Every order belonging to the signed-in account, however many they
     place. A guest order never appears here. */
  async myOrders() {
    if (!RB_LIVE) {
      const me = await this.me();
      if (!me) return ok([]);
      const items = LS.get('order_items', []);
      return ok(LS.get('orders', [])
        .filter(o => o.customer_id === me.id)
        .map(o => ({ ...o, items: items.filter(i => i.order_id === o.id) })));
    }
    const { data, error } = await sb.from('orders')
      .select('*, order_items(*)').order('placed_at', { ascending: false });
    return error ? fail(error) : ok(data.map(o => ({ ...o, items: o.order_items || [] })));
  },

  async orderByCode(code) {
    if (!RB_LIVE) {
      const o = LS.get('orders', []).find(x => x.order_code.toUpperCase() === String(code).toUpperCase());
      if (!o) return fail('No order found with that number.');
      return ok({ ...o, items: LS.get('order_items', []).filter(i => i.order_id === o.id) });
    }
    const { data, error } = await sb.rpc('track_order', { p_code: code });
    if (error) return fail(error);
    if (!data) return fail('No order found with that number.');
    return ok(data);
  },

  async allOrders(customerId) {
    if (!RB_LIVE) {
      const items = LS.get('order_items', []);
      const customers = LS.get('customers', []);
      let list = LS.get('orders', []);
      if (customerId) list = list.filter(o => o.customer_id === customerId);
      return ok(list.map(o => ({
        ...o,
        items: items.filter(i => i.order_id === o.id),
        customers: o.customer_id ? (() => {
          const c = customers.find(x => x.id === o.customer_id);
          return c ? { customer_code: c.customer_code, full_name: c.full_name } : null;
        })() : null
      })));
    }
    let q = sb.from('orders').select('*, order_items(*), customers(customer_code, full_name)')
      .order('placed_at', { ascending: false });
    if (customerId) q = q.eq('customer_id', customerId);
    const { data, error } = await q;
    return error ? fail(error) : ok(data.map(o => ({ ...o, items: o.order_items || [] })));
  },

  async setOrderStatus(id, status) {
    if (!RB_LIVE) {
      const all = LS.get('orders', []);
      const i = all.findIndex(o => o.id === id);
      if (i > -1) {
        const was = all[i].status;
        if ((was === 'cancelled') !== (status === 'cancelled')) localRestock(all[i], status === 'cancelled' ? 1 : -1);
        all[i].status = status;
        const stamp = { confirmed: 'confirmed_at', shipped: 'shipped_at', delivered: 'delivered_at', cancelled: 'cancelled_at' }[status];
        if (stamp && !all[i][stamp]) all[i][stamp] = new Date().toISOString();
        LS.set('orders', all);
      }
      return ok(true);
    }
    const { error } = await sb.from('orders').update({ status }).eq('id', id);
    return error ? fail(error) : ok(true);
  },

  async setPaymentStatus(id, payment_status) {
    if (!RB_LIVE) {
      const all = LS.get('orders', []);
      const i = all.findIndex(o => o.id === id);
      if (i > -1) { all[i].payment_status = payment_status; LS.set('orders', all); }
      return ok(true);
    }
    const { error } = await sb.from('orders').update({ payment_status }).eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ===================== MESSAGES ===================== */
  /* A message row is either a guest contact-form submission (customer_id
     null, reply by email only) or one side of a signed-in customer's
     thread (customer_id set, sender 'customer' or 'admin'). Everything
     below works off that one table — nothing is duplicated per thread. */
  async saveMessage(msg) {
    if (shopOffline()) return fail(OFFLINE_MSG);
    const me = await this.me();
    const payload = { ...msg, customer_id: me && me.id ? me.id : null, sender: 'customer', read_by_admin: false, read_by_customer: true };
    if (!RB_LIVE) {
      const record = { ...payload, id: uid('m'), created_at: new Date().toISOString() };
      const all = LS.get('messages', []); all.unshift(record); LS.set('messages', all); return ok(record);
    }
    const { data, error } = await sb.from('messages').insert([payload]).select().single();
    return error ? fail(error) : ok(data);
  },
  async messages() {
    if (!RB_LIVE) return ok(LS.get('messages', []));
    const { data, error } = await sb.from('messages').select('*').order('created_at', { ascending: false });
    return error ? fail(error) : ok(data);
  },
  async deleteMessage(id) {
    if (!RB_LIVE) { LS.set('messages', LS.get('messages', []).filter(m => m.id !== id)); return ok(true); }
    const { error } = await sb.from('messages').delete().eq('id', id);
    return error ? fail(error) : ok(true);
  },

  /* ---------- customer side: their own thread ---------- */
  async myMessages() {
    const me = await this.me();
    if (!me || !me.id) return ok([]);
    if (!RB_LIVE) return ok(LS.get('messages', []).filter(m => m.customer_id === me.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
    const { data, error } = await sb.from('messages').select('*').eq('customer_id', me.id).order('created_at', { ascending: true });
    return error ? fail(error) : ok(data);
  },
  /* A reply (or a fresh message) sent from inside the account page, as
     opposed to the public contact form. Same thread either way. */
  async sendAccountMessage(text) {
    const me = await this.me();
    if (!me || !me.id) return fail('Sign in to send a message.');
    const payload = { customer_id: me.id, sender: 'customer', name: me.full_name || '', email: me.email || '', phone: me.phone || '', subject: null, message: text, read_by_admin: false, read_by_customer: true };
    if (!RB_LIVE) {
      const record = { ...payload, id: uid('m'), created_at: new Date().toISOString() };
      const all = LS.get('messages', []); all.unshift(record); LS.set('messages', all); return ok(record);
    }
    const { data, error } = await sb.from('messages').insert([payload]).select().single();
    return error ? fail(error) : ok(data);
  },
  async markMyMessagesRead() {
    const me = await this.me();
    if (!me || !me.id) return ok(true);
    if (!RB_LIVE) {
      LS.set('messages', LS.get('messages', []).map(m => (m.customer_id === me.id && m.sender === 'admin') ? { ...m, read_by_customer: true } : m));
      return ok(true);
    }
    const { error } = await sb.from('messages').update({ read_by_customer: true }).eq('customer_id', me.id).eq('sender', 'admin').eq('read_by_customer', false);
    return error ? fail(error) : ok(true);
  },
  /* For the little badge on the Account icon in the header. */
  async unreadMessageCount() {
    const me = await this.me();
    if (!me || !me.id) return ok(0);
    if (!RB_LIVE) return ok(LS.get('messages', []).filter(m => m.customer_id === me.id && m.sender === 'admin' && !m.read_by_customer).length);
    const { count, error } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('customer_id', me.id).eq('sender', 'admin').eq('read_by_customer', false);
    return error ? fail(error) : ok(count || 0);
  },

  /* ---------- admin side: reply direct-to-profile ---------- */
  async adminReplyToMessage(customerId, text) {
    const payload = { customer_id: customerId, sender: 'admin', name: (window.RB_ADMIN || {}).email || 'Riyadul BD', email: '', phone: '', subject: null, message: text, read_by_admin: true, read_by_customer: false };
    if (!RB_LIVE) {
      const record = { ...payload, id: uid('m'), created_at: new Date().toISOString() };
      const all = LS.get('messages', []); all.unshift(record); LS.set('messages', all); return ok(record);
    }
    const { data, error } = await sb.from('messages').insert([payload]).select().single();
    return error ? fail(error) : ok(data);
  },
  async markThreadReadByAdmin(customerId) {
    if (!RB_LIVE) {
      LS.set('messages', LS.get('messages', []).map(m => m.customer_id === customerId ? { ...m, read_by_admin: true } : m));
      return ok(true);
    }
    const { error } = await sb.from('messages').update({ read_by_admin: true }).eq('customer_id', customerId).eq('read_by_admin', false);
    return error ? fail(error) : ok(true);
  },
  async markGuestMessageRead(id) {
    if (!RB_LIVE) { LS.set('messages', LS.get('messages', []).map(m => m.id === id ? { ...m, read_by_admin: true } : m)); return ok(true); }
    const { error } = await sb.from('messages').update({ read_by_admin: true }).eq('id', id);
    return error ? fail(error) : ok(true);
  },

    /* ===================== INVENTORY HISTORY (admin) ===================== */
  async inventoryLog(productId) {
    if (!RB_LIVE) {
      const all = LS.get('inventory_log', []);
      return ok(productId ? all.filter(x => x.product_id === productId) : all);
    }
    let q = sb.from('inventory_log').select('*').order('created_at', { ascending: false }).limit(5000);
    if (productId) q = q.eq('product_id', productId);
    const { data, error } = await q;
    return error ? fail(error) : ok(data || []);
  },
  async addInventoryLog(entry) {
    const row = {
      product_id: entry.product_id, variant_label: entry.variant_label || null, kind: entry.kind,
      qty: Math.round(Number(entry.qty) || 0), unit_cost: entry.unit_cost == null ? null : Number(entry.unit_cost),
      amount: Number(entry.amount) || 0, note: entry.note || null,
      created_by: (window.RB_ADMIN && window.RB_ADMIN.email) || null
    };
    if (!RB_LIVE) {
      const all = LS.get('inventory_log', []);
      all.unshift({ ...row, id: uid('lg'), created_at: new Date().toISOString() });
      LS.set('inventory_log', all); return ok(true);
    }
    const { error } = await sb.from('inventory_log').insert([row]);
    return error ? fail(error) : ok(true);
  },
  async deleteInventoryLog(id) {
    if (!RB_LIVE) { LS.set('inventory_log', LS.get('inventory_log', []).filter(x => x.id !== id)); return ok(true); }
    const { error } = await sb.from('inventory_log').delete().eq('id', id);
    return error ? fail(error) : ok(true);
  },

/* ===================== SITE SETTINGS ===================== */
  /* Announcement bar text and the logo override — editable from the
     admin panel Settings tab. Returns an object with sensible defaults
     even before anything has been saved. */
  async settings() {
    if (!RB_LIVE) return ok({ ...rbSettingsBase(), ...LS.get('settings', {}) });
    const { data, error } = await sb.from('site_settings').select('key, value');
    if (error) return fail(error);
    const map = { ...rbSettingsBase() };
    (data || []).forEach(r => { if (r.value !== null) map[r.key] = r.value; });
    SNAP.save('settings', map);
    return ok(map);
  },
  async saveSetting(key, value) {
    if (!RB_LIVE) {
      const s = LS.get('settings', { ...rbSettingsBase() });
      s[key] = value; LS.set('settings', s); return ok(s);
    }
    const { error } = await sb.from('site_settings').upsert({ key, value }, { onConflict: 'key' });
    return error ? fail(error) : ok(true);
  },

  /* ===================== WISHLIST ===================== */
  async wishlist() {
    if (!RB_LIVE) return ok(LS.get('wishlist', []));
    const me = await this.me();
    if (!me || !me.id) return ok(LS.get('wishlist', []));
    const { data, error } = await sb.from('wishlist').select('product_id');
    return error ? fail(error) : ok(data.map(r => r.product_id));
  },
  async toggleWishlist(productId) {
    const cur = (await this.wishlist()).data || [];
    const on = cur.includes(productId);
    LS.set('wishlist', on ? cur.filter(id => id !== productId) : [...cur, productId]);
    if (RB_LIVE) {
      const me = await this.me();
      if (me && me.id) {
        if (on) await sb.from('wishlist').delete().eq('product_id', productId);
        else await sb.from('wishlist').insert([{ product_id: productId }]);
      }
    }
    return ok(!on);
  },

  /* ===================== ADMIN ACCESS ===================== */
  /* Live: the account must sign in AND have a row in `admins`. No
     passcode, and no admin list anywhere in the browser code. */
  async adminLogin({ email, password }) {
    if (!RB_LIVE) return fail('The database is not connected.');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return fail(error);
    const { data: row } = await sb.from('admins').select('email, name').eq('user_id', data.user.id).maybeSingle();
    if (!row) { await sb.auth.signOut(); return fail('That account is not an admin of this shop.'); }
    return ok(row);
  },
  async currentAdmin() {
    if (!RB_LIVE) return null;
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return null;
    const { data: row } = await sb.from('admins').select('email, name').eq('user_id', data.user.id).maybeSingle();
    return row || null;
  }
};

/* Decide the mode before any call runs. Every method of RB_DB waits for
   this, so pages never have to think about it. */
const ready = (async () => {
  if (HAS_BACKEND) RB_MODE = (await probeBackend(SUPABASE_URL, SUPABASE_ANON_KEY)) ? 'live' : 'offline';
  RB_LIVE = RB_MODE === 'live';
  if (RB_MODE === 'offline') LS_PREFIX = 'rbo.';
  if (!RB_LIVE) seedLocal();
  return RB_MODE;
})();

const RB_DB = new Proxy(impl, {
  get(target, key) {
    if (key === 'ready') return ready;
    if (key === 'mode') return RB_MODE;
    if (key === 'live') return RB_LIVE;
    if (key === 'offlineMessage') return OFFLINE_MSG;
    const v = target[key];
    if (typeof v !== 'function') return v;
    return async (...args) => { await ready; return v.apply(RB_DB, args); };
  }
});

/* wipe the browser-only preview data (admin preview "Reset sample data") */
export function resetLocalData() {
  Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX) && !k.startsWith('rb.snap.')).forEach(k => localStorage.removeItem(k));
}

window.RB_DB = RB_DB;
export { RB_DB, RB_COST_KEYS, rbUnitCost, rbPromoState, rbEffPrice, rbResolveForShop };
