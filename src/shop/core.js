/* ============================================================
   Riyadul BD — shared runtime
   Header, footer, cart drawer, toasts, money, small helpers.
   Loaded on every public page before the page script.
   ============================================================ */

import { RB_DB } from '../lib/db.js';
import { RB_SETTINGS } from '../lib/seed.js';

const RB = {
  shop: {
    name: 'Riyadul BD',
    tagline: 'Organic food, straight from the farm',
    phone: '+880 1700 000000',
    whatsapp: '8801700000000',
    email: 'hello@riyadulbd.com',
    address: 'House 14, Road 7, Dhanmondi, Dhaka 1205',
    hours: 'Saturday to Thursday, 9am – 8pm',
    currency: '৳',
    delivery: { inside: 60, outside: 120, freeOver: 2000 }
  }
};

/* ---------- true "back" tracking ----------
   A static multi-page site still gets real history entries from the
   browser, but relying on history.length alone breaks the moment a
   page is refreshed or reached from an external link at some depth.
   We keep our own small stack of pages visited this tab session, and
   trim it correctly when the browser's own back/forward is used, so
   the button always steps back through the actual path taken and only
   ever falls back to the homepage when that path is genuinely empty. */
(function trackNav() {
  try {
    const key = 'rbNavStack';
    const cur = location.pathname + location.search;
    let stack = JSON.parse(sessionStorage.getItem(key) || '[]');
    const nav = (performance.getEntriesByType('navigation')[0] || {}).type;
    if (nav === 'back_forward') {
      const idx = stack.lastIndexOf(cur);
      stack = idx > -1 ? stack.slice(0, idx + 1) : [...stack, cur];
    } else if (stack[stack.length - 1] !== cur) {
      stack.push(cur);
    }
    if (stack.length > 40) stack = stack.slice(-40);
    sessionStorage.setItem(key, JSON.stringify(stack));
    RB._navStack = stack;
  } catch (e) { RB._navStack = []; }
})();

/* ---------- icons ---------- */
const ICON = {
  leaf: '<path d="M4 20c0-8 6-14 16-15 0 10-6 15-14 15" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20c2-5 6-8 10-10" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  fruit: '<circle cx="12" cy="14" r="7" stroke="currentColor" stroke-width="1.7" fill="none"/><path d="M12 7V4M12 4c2 0 3.5-1 4-2" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linecap="round"/>',
  grain: '<path d="M12 21V8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 8c0-3 2-5 5-5 0 3-2 5-5 5ZM12 8c0-3-2-5-5-5 0 3 2 5 5 5ZM12 14c0-3 2-5 5-5 0 3-2 5-5 5ZM12 14c0-3-2-5-5-5 0 3 2 5 5 5Z" stroke="currentColor" stroke-width="1.5" fill="none"/>',
  bottle: '<path d="M10 2h4v3l2 3v11a3 3 0 0 1-3 3h-2a3 3 0 0 1-3-3V8l2-3V2Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M8 13h8" stroke="currentColor" stroke-width="1.5"/>',
  honey: '<path d="M12 3 5 7v8l7 4 7-4V7l-7-4Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M8.5 11h7M9.5 14h5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  milk: '<path d="M9 2h6v3l2 4v10a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3V9l2-4V2Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  spice: '<path d="M7 9h10l-1 11H8L7 9Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M9 9V6a3 3 0 0 1 6 0v3" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  basket: '<path d="M4 9h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="m8.5 9 2-6M15.5 9l-2-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>',
  cart: '<path d="M3 4h2.2l2.3 11.4a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="10" cy="20" r="1.5" fill="currentColor"/><circle cx="18" cy="20" r="1.5" fill="currentColor"/>',
  heart: '<path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 15.6 12 20 12 20Z" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/>',
  heartFill: '<path d="M12 20s-7-4.4-7-9.3A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7 3.7C19 15.6 12 20 12 20Z" fill="currentColor"/>',
  user: '<circle cx="12" cy="8.5" r="3.7" stroke="currentColor" stroke-width="1.8" fill="none"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  search: '<circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  close: '<path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  truck: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><circle cx="7" cy="18" r="1.8" stroke="currentColor" stroke-width="1.7" fill="none"/><circle cx="17" cy="18" r="1.8" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  shield: '<path d="M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-3Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="m9 12 2 2 4-4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.6-5.9" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M20 4v5h-5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><circle cx="12" cy="10" r="2.5" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  whatsapp: '<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.4A10 10 0 1 0 12 2Zm5.3 14c-.2.6-1.2 1.2-1.7 1.2-.5.1-1 .1-1.7-.1a12 12 0 0 1-6.4-5.6c-.5-.9-.8-1.8-.2-2.7.3-.4.6-.7.9-.8h.8c.2 0 .4.4.6.8l.5 1.2c.1.2 0 .5-.1.7l-.4.5c-.1.2-.2.4 0 .7a8 8 0 0 0 3.5 3c.3.1.5.1.7-.1l.7-.8c.2-.2.4-.2.6-.1l1.7.8c.3.1.5.3.5.5s0 .5-.1.8Z" fill="currentColor"/>',
  check: '<path d="m5 13 4 4 10-10" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  box: '<path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="M4 8l8 4 8-4M12 12v8" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  back: '<path d="M15 5 6 12l9 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  basketAdd: '<path d="M4 9h16l-1.6 10.2a2 2 0 0 1-2 1.8H7.6a2 2 0 0 1-2-1.8L4 9Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/><path d="m8.5 9 2-6M15.5 9l-2-6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M12 12.5v4M10 14.5h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  chat: '<path d="M4 5h16v11H8l-4 4V5Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/>',
  send: '<path d="M4 11 20 4l-6 16-3-7-7-2Z" stroke="currentColor" stroke-width="1.7" fill="none" stroke-linejoin="round"/>'
};
const svg = (n, cls) => `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true">${ICON[n] || ''}</svg>`;
RB.svg = svg;

/* Default logo. Controlled through a plain image path, not inline
   markup — drop a new file at this path (or set a URL from the admin
   Settings tab) and the whole site picks it up automatically. */
RB.logoDefault = 'assets/img/logo.svg';

/* ---------- helpers ---------- */
RB.money = n => RB.shop.currency + Number(n || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 });
RB.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* Query value, with the clean URLs (/product/<slug>, /category/<cat>) read
   from the path: the host rewrites those to product.html / products.html
   without changing the address bar, so the slug never reaches the query. */
RB.qs = k => {
  const v = new URLSearchParams(location.search).get(k);
  if (v != null) return v;
  const m = location.pathname.match(/^\/(product|category)\/([^/]+)\/?$/);
  if (m && ((m[1] === 'product' && k === 'slug') || (m[1] === 'category' && k === 'cat'))) return decodeURIComponent(m[2]);
  return null;
};
RB.el = (sel, root) => (root || document).querySelector(sel);
RB.els = (sel, root) => Array.from((root || document).querySelectorAll(sel));
RB.lowestPrice = p => Math.min(...(p.variants || [{ price: 0 }]).map(v => v.price));
RB.stockOf = p => (p.variants || []).reduce((s, v) => s + (v.stock || 0), 0);
RB.discountPct = p => {
  const v = (p.variants || [])[0];
  if (!v || !v.mrp || v.mrp <= v.price) return 0;
  return Math.round((1 - v.price / v.mrp) * 100);
};

RB.toast = (msg, bad) => {
  let host = RB.el('.toasts');
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 3200);
};

/* ---------- cart ---------- */
RB.cart = {
  read() { try { return JSON.parse(localStorage.getItem('rb.cart') || '[]'); } catch { return []; } },
  write(items) {
    try { localStorage.setItem('rb.cart', JSON.stringify(items)); } catch {}
    RB.cart.paint();
    document.dispatchEvent(new CustomEvent('rb:cart'));
  },
  key: (id, variant) => `${id}|${variant}`,
  add(product, variantLabel, qty = 1) {
    const v = product.variants.find(x => x.label === variantLabel) || product.variants[0];
    const items = this.read();
    const key = this.key(product.id, v.label);
    const line = items.find(i => i.key === key);
    const inCart = line ? line.qty : 0;
    if (inCart + qty > (v.stock || 0)) {
      RB.toast(`Only ${v.stock} left of ${product.name} (${v.label}).`, true);
      return false;
    }
    if (line) line.qty += qty;
    else items.push({
      key, id: product.id, slug: product.slug, name: product.name, variant: v.label,
      price: v.price, mrp: v.mrp || 0, stock: v.stock || 0, image: (product.images || [])[0] || '', qty
    });
    this.write(items);
    RB.toast(`${product.name} added to your basket.`);
    return true;
  },
  setQty(key, qty) {
    let items = this.read();
    const line = items.find(i => i.key === key);
    if (!line) return;
    if (qty <= 0) items = items.filter(i => i.key !== key);
    else if (qty > line.stock) { RB.toast(`Only ${line.stock} in stock.`, true); return; }
    else line.qty = qty;
    this.write(items);
  },
  remove(key) { this.write(this.read().filter(i => i.key !== key)); },
  clear() { this.write([]); },
  count() { return this.read().reduce((s, i) => s + i.qty, 0); },
  subtotal() { return this.read().reduce((s, i) => s + i.price * i.qty, 0); },
  shipping(zone = 'inside', coupon) {
    const sub = this.subtotal();
    if (!sub) return 0;
    if (coupon && coupon.type === 'shipping') return 0;
    if (sub >= RB.shop.delivery.freeOver) return 0;
    return zone === 'outside' ? RB.shop.delivery.outside : RB.shop.delivery.inside;
  },
  discount(coupon) {
    if (!coupon) return 0;
    const sub = this.subtotal();
    if (coupon.type === 'percent') return Math.round(sub * coupon.value / 100);
    if (coupon.type === 'flat') return Math.min(coupon.value, sub);
    return 0;
  },
  paint() {
    const n = RB.cart.count();
    RB.els('[data-cart-count]').forEach(b => { b.textContent = n; b.classList.toggle('hide', n === 0); });
    const d = RB.el('#drawer-body');
    if (d) RB.drawer.render();
  }
};

/* ---------- cart drawer ---------- */
RB.drawer = {
  open() {
    RB.el('#drawer').classList.add('on');
    RB.el('#scrim').classList.add('on');
    document.body.classList.add('no-scroll');
    this.render();
  },
  close() {
    RB.el('#drawer').classList.remove('on');
    RB.el('#scrim').classList.remove('on');
    document.body.classList.remove('no-scroll');
  },
  render() {
    const body = RB.el('#drawer-body'), foot = RB.el('#drawer-foot');
    if (!body) return;
    const items = RB.cart.read();
    if (!items.length) {
      body.innerHTML = `<div class="empty">${svg('basket')}<p>Your basket is empty.</p>
        <a class="btn" href="products.html">Start shopping</a></div>`;
      foot.innerHTML = '';
      return;
    }
    body.innerHTML = items.map(i => `
      <div class="line">
        <img src="${i.image}" alt="" loading="lazy">
        <div>
          <b>${RB.esc(i.name)}</b>
          <i>${RB.esc(i.variant)} · ${RB.money(i.price)}</i>
          <div class="qty-inline" style="max-width:118px;margin-top:8px">
            <button data-step="-1" data-key="${i.key}" aria-label="Reduce quantity">−</button>
            <span>${i.qty}</span>
            <button data-step="1" data-key="${i.key}" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div style="text-align:right">
          <b>${RB.money(i.price * i.qty)}</b>
          <button class="rm" data-rm="${i.key}">Remove</button>
        </div>
      </div>`).join('');

    const sub = RB.cart.subtotal();
    const left = RB.shop.delivery.freeOver - sub;
    foot.innerHTML = `
      ${left > 0 ? `<div class="notice">Add ${RB.money(left)} more for free delivery.</div>` : ''}
      <div class="totals"><div class="grand"><span>Subtotal</span><span>${RB.money(sub)}</span></div></div>
      <a class="btn btn-block" href="checkout.html">Go to checkout</a>
      <button class="btn btn-ghost btn-block" style="margin-top:8px" id="keep-shopping">Keep shopping</button>`;

    foot.querySelector('#keep-shopping').onclick = () => RB.drawer.close();
    body.onclick = e => {
      const step = e.target.closest('[data-step]');
      const rm = e.target.closest('[data-rm]');
      if (step) {
        const line = RB.cart.read().find(i => i.key === step.dataset.key);
        RB.cart.setQty(step.dataset.key, line.qty + Number(step.dataset.step));
      }
      if (rm) RB.cart.remove(rm.dataset.rm);
    };
  }
};

/* ---------- header + footer ---------- */
RB.chrome = async function (activePage) {
  const [cats, , settings] = await Promise.all([
    RB_DB.categories().then(r => r.data || []),
    RB_DB.me(),
    RB_DB.settings().then(r => r.data || RB_SETTINGS)
  ]);
  /* database paused or unreachable: say so once, at the top of every page */
  if (RB_DB.mode === 'offline' && !RB.el('.offline-note')) {
    const note = document.createElement('div');
    note.className = 'offline-note'; note.setAttribute('role', 'status');
    note.innerHTML = `Online ordering is paused for a short while. You can still browse — to order, call <a href="tel:${RB.shop.phone.replace(/\s+/g, '')}">${RB.esc(RB.shop.phone)}</a> or <a href="https://wa.me/${RB.shop.whatsapp}" target="_blank" rel="noopener">WhatsApp us</a>.`;
    document.body.prepend(note);
  }
  const hotDealsLabel = settings.hotdeals_title || 'Hot Deals';
  const nav = [
    { href: 'index.html', label: 'Home', key: 'home' },
    { href: 'products.html?hotdeals=1', label: hotDealsLabel, key: 'hotdeals', hot: true },
    ...cats.map(c => ({ href: `products.html?cat=${c.slug}`, label: c.name, key: 'cat-' + c.slug })),
    { href: 'contact.html', label: 'Contact', key: 'contact' }
  ];
  const logoSrc = settings.logo_url || RB.logoDefault;
  /* Logo studio settings from Admin -> Settings: height, width, fit and frame shape */
  const logoHeight = Math.max(16, Math.min(200, Number(settings.logo_height) || 40));
  const logoWidth = Math.max(0, Math.min(400, Number(settings.logo_width) || 0));   // 0 = auto
  const logoShape = settings.logo_shape || 'none';
  const logoFit = (logoShape === 'circle' || settings.logo_fit === 'cover') ? 'cover' : 'contain';
  const logoStyle = [
    `height:${logoHeight}px`,
    `width:${logoShape === 'circle' ? logoHeight + 'px' : (logoWidth ? logoWidth + 'px' : 'auto')}`,
    'max-width:none',
    `object-fit:${logoFit}`,
    `border-radius:${logoShape === 'circle' ? '50%' : logoShape === 'rounded' ? '10px' : '0'}`
  ].map(r => r + ' !important').join(';');

  const header = RB.el('#site-header');
  if (header) {
    header.innerHTML = `
    ${settings.announcement_text ? `
    <div class="announce" aria-label="Announcement">
      <div class="announce-track"><span>${RB.esc(settings.announcement_text)}</span><span aria-hidden="true">${RB.esc(settings.announcement_text)}</span></div>
    </div>` : ''}
    <header class="hdr">
      <div class="wrap hdr-main">
        <a class="brand" href="index.html">
          <img class="brand-logo" src="${logoSrc}" alt="${RB.esc(RB.shop.name)}" style="${logoStyle}" onerror="this.src='${RB.logoDefault}'">
        </a>
        <div class="searchbar">
          <label class="sr" for="q">Search products</label>
          <input id="q" type="search" placeholder="Search honey, ghee, rice…" autocomplete="off">
          <button type="button" id="q-go" aria-label="Search">${svg('search')}</button>
          <div class="suggest hide" id="suggest"></div>
        </div>
        <div class="hdr-actions">
          <a class="icon-btn" href="wishlist.html" aria-label="Wishlist">${svg('heart')}<span class="badge hide" data-wish-count>0</span></a>
          <a class="icon-btn" href="account.html" aria-label="Account">${svg('user')}<span class="badge hide" data-msg-count>0</span></a>
          <button class="icon-btn" id="open-cart" aria-label="Basket">${svg('cart')}<span class="badge hide" data-cart-count>0</span></button>
          <button class="icon-btn burger" id="burger-toggle" aria-label="Menu" aria-expanded="false">${svg('menu')}</button>
        </div>
      </div>
      <nav class="navbar"><div class="wrap">
        ${nav.map(n => `<a href="${n.href}" class="${n.key === activePage ? 'active' : ''}${n.hot ? ' nav-hot' : ''}">${RB.esc(n.label)}</a>`).join('')}
      </div></nav>
    </header>
    ${activePage !== 'home' ? `<button class="mback" id="mback" aria-label="Go back">${svg('back')}</button>` : ''}`;

    const burger = RB.el('#burger-toggle'), navbar = RB.el('.navbar', header);
    if (burger && navbar) {
      burger.onclick = () => {
        const open = navbar.classList.toggle('open');
        burger.setAttribute('aria-expanded', String(open));
      };
    }
    const back = RB.el('#mback');
    if (back) back.onclick = () => {
      const stack = RB._navStack || [];
      if (stack.length > 1 || history.length > 1) history.back();
      else location.href = 'index.html';
    };
  }

  const footer = RB.el('#site-footer');
  if (footer) {
    footer.innerHTML = `
    <footer class="ftr"><div class="wrap">
      <div class="ftr-grid">
        <div>
          <span class="brand-name" style="font-size:1.3rem">Riyadul BD</span>
          <p style="margin-top:10px;max-width:38ch">We buy from named farms, pack small, and deliver the same week. Nothing sits in a warehouse.</p>
          <p class="small">${RB.esc(RB.shop.address)}<br>${RB.esc(RB.shop.hours)}</p>
        </div>
        <div><h4>Shop</h4><ul>
          ${cats.slice(0, 6).map(c => `<li><a href="products.html?cat=${c.slug}">${RB.esc(c.name)}</a></li>`).join('')}
        </ul></div>
        <div><h4>Help</h4><ul>
          <li><a href="account.html">Track an order</a></li>
          <li><a href="contact.html">Contact us</a></li>
          <li><a href="contact.html#delivery">Delivery &amp; returns</a></li>
          <li><a href="wishlist.html">Saved items</a></li>
        </ul></div>
        <div>
          <h4>Order updates</h4>
          <p class="small">One message a week: what came in from the farms, and what is nearly gone.</p>
          <form class="newsletter" id="news">
            <input type="email" placeholder="Your email" required aria-label="Email address">
            <button class="btn btn-gold" type="submit">Join</button>
          </form>
        </div>
      </div>
      <div class="ftr-bottom">
        <span>© ${new Date().getFullYear()} Riyadul BD. All rights reserved.</span>
        <span>Cash on delivery · bKash · Nagad</span>
      </div>
    </div></footer>
    <a class="wa" href="https://wa.me/${RB.shop.whatsapp}" target="_blank" rel="noopener" aria-label="Chat on WhatsApp">${svg('whatsapp')}</a>`;

    const news = RB.el('#news');
    news.onsubmit = e => { e.preventDefault(); news.reset(); RB.toast('You are on the list.'); };
  }

  // drawer + scrim
  if (!RB.el('#drawer')) {
    const d = document.createElement('div');
    d.innerHTML = `
      <div class="scrim" id="scrim"></div>
      <aside class="drawer" id="drawer" aria-label="Basket">
        <div class="drawer-head"><h3>Your basket</h3>
          <button class="icon-btn" id="close-cart" aria-label="Close basket">${svg('close')}</button></div>
        <div class="drawer-body" id="drawer-body"></div>
        <div class="drawer-foot" id="drawer-foot"></div>
      </aside>`;
    document.body.appendChild(d);
    RB.el('#scrim').onclick = () => RB.drawer.close();
    RB.el('#close-cart').onclick = () => RB.drawer.close();
  }
  const openBtn = RB.el('#open-cart');
  if (openBtn) openBtn.onclick = () => RB.drawer.open();

  // wishlist + unread-message badges
  const [wl, unread] = await Promise.all([
    RB_DB.wishlist().then(r => r.data || []),
    RB_DB.unreadMessageCount ? RB_DB.unreadMessageCount().then(r => r.data || 0) : Promise.resolve(0)
  ]);
  RB.els('[data-wish-count]').forEach(b => { b.textContent = wl.length; b.classList.toggle('hide', !wl.length); });
  RB.els('[data-msg-count]').forEach(b => { b.textContent = unread; b.classList.toggle('hide', !unread); });

  RB.cart.paint();
  wireSearch();

  document.addEventListener('keydown', e => { if (e.key === 'Escape') RB.drawer.close(); });
};

/* ---------- header search ---------- */
async function wireSearch() {
  const input = RB.el('#q'), box = RB.el('#suggest'), go = RB.el('#q-go');
  if (!input) return;
  const all = (await RB_DB.products()).data || [];
  const submit = () => {
    const v = input.value.trim();
    location.href = 'products.html' + (v ? '?q=' + encodeURIComponent(v) : '');
  };
  go.onclick = submit;
  input.onkeydown = e => { if (e.key === 'Enter') submit(); };
  input.oninput = () => {
    const v = input.value.trim().toLowerCase();
    if (v.length < 2) { box.classList.add('hide'); return; }
    const hits = all.filter(p =>
      p.name.toLowerCase().includes(v) || (p.name_bn || '').includes(v) || (p.farm || '').toLowerCase().includes(v)
    ).slice(0, 6);
    if (!hits.length) { box.classList.add('hide'); return; }
    box.innerHTML = hits.map(p => `
      <a href="product.html?slug=${p.slug}">
        <img src="${p.images[0]}" alt="">
        <span>${RB.esc(p.name)}<br><small class="muted">${RB.money(RB.lowestPrice(p))}</small></span>
      </a>`).join('');
    box.classList.remove('hide');
  };
  document.addEventListener('click', e => {
    if (!e.target.closest('.searchbar')) box.classList.add('hide');
  });
}

/* ---------- product card (shared by home / listing / wishlist) ---------- */
RB.card = function (p, wishIds) {
  const v = p.variants[0] || { price: 0, label: '', stock: 0 };
  const out = RB.stockOf(p) <= 0;
  const off = RB.discountPct(p);
  const wished = (wishIds || []).includes(p.id);
  return `
  <article class="card" data-id="${p.id}">
    <div class="card-media">
      <a href="product.html?slug=${p.slug}" aria-label="${RB.esc(p.name)}">
        <img src="${p.images[0]}" alt="${RB.esc(p.name)}" loading="lazy">
      </a>
      <div class="tags">
        ${p.certified ? '<span class="tag">Certified organic</span>' : ''}
        ${off ? `<span class="tag sale">${off}% off</span>` : ''}
        ${out ? '<span class="tag out">Sold out</span>' : ''}
      </div>
      <button class="wish ${wished ? 'on' : ''}" data-wish="${p.id}" aria-label="Save ${RB.esc(p.name)}">
        ${svg(wished ? 'heartFill' : 'heart')}
      </button>
    </div>
    <div class="card-body">
      <a class="card-name" href="product.html?slug=${p.slug}">${RB.esc(p.name)}</a>
      <span class="card-cat">${RB.esc(p.name_bn || '')}</span>
      <div class="price-row">
        <div class="price">
          <b>${RB.money(v.price)}</b>
          ${v.mrp > v.price ? `<s>${RB.money(v.mrp)}</s>` : ''}
          <em>/ ${RB.esc(v.label)}</em>
        </div>
        ${out
          ? `<button class="basket-btn off" disabled aria-label="Sold out">${svg('basketAdd')}</button>`
          : `<button class="basket-btn" data-add="${p.id}" aria-label="Add ${RB.esc(p.name)} to basket">${svg('basketAdd')}</button>`}
      </div>
    </div>
  </article>`;
};

/* Wire add/wish buttons inside any container that renders RB.card. */
RB.wireCards = function (container, products) {
  container.addEventListener('click', async e => {
    const add = e.target.closest('[data-add]');
    const wish = e.target.closest('[data-wish]');
    if (add) {
      const p = products.find(x => x.id === add.dataset.add);
      if (p) RB.cart.add(p, p.variants[0].label, 1);
    }
    if (wish) {
      const res = await RB_DB.toggleWishlist(wish.dataset.wish);
      wish.classList.toggle('on', res.data);
      wish.innerHTML = svg(res.data ? 'heartFill' : 'heart');
      const wl = (await RB_DB.wishlist()).data || [];
      RB.els('[data-wish-count]').forEach(b => { b.textContent = wl.length; b.classList.toggle('hide', !wl.length); });
      RB.toast(res.data ? 'Saved to your list.' : 'Removed from your list.');
    }
  });
};

window.RB = RB;
export { RB };
