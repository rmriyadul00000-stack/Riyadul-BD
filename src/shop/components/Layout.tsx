import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Icon } from './Icon';
import { cart, cartCount, cartSubtotal, useCart } from '../lib/cart';
import { drawer, useDrawerOpen } from '../lib/drawer';
import { LOGO_DEFAULT, SHOP, lowestPrice, money } from '../lib/shop';
import { Toasts, toast } from '../lib/toast';
import { useBackendReady, useCategories, useProducts, useSettings, useUnreadCount, useWishlist } from '../lib/queries';

/* Which nav item is "active" for the current URL. */
function useActiveKey(): string {
  const { pathname } = useLocation();
  const [sp] = useSearchParams();
  if (pathname === '/') return 'home';
  const cat = pathname.match(/^\/category\/([^/]+)/)?.[1] ?? (pathname === '/products' ? sp.get('cat') : null);
  if (pathname === '/products' && sp.get('hotdeals') === '1') return 'hotdeals';
  if (cat) return 'cat-' + decodeURIComponent(cat);
  return pathname.replace(/^\//, '').split('/')[0];
}

function OfflineNote() {
  const ready = useBackendReady();
  if (ready.data !== 'offline') return null;
  return (
    <div className="offline-note" role="status">
      Online ordering is paused for a short while. You can still browse — to order, call{' '}
      <a href={`tel:${SHOP.phone.replace(/\s+/g, '')}`}>{SHOP.phone}</a> or{' '}
      <a href={`https://wa.me/${SHOP.whatsapp}`} target="_blank" rel="noopener noreferrer">WhatsApp us</a>.
    </div>
  );
}

function SearchBar() {
  const navigate = useNavigate();
  const { data: all = [] } = useProducts();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const hits = useMemo(() => {
    const v = q.trim().toLowerCase();
    if (v.length < 2) return [];
    return all.filter(p => p.name.toLowerCase().includes(v) || (p.name_bn || '').includes(v) || (p.farm || '').toLowerCase().includes(v)).slice(0, 6);
  }, [q, all]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('click', away);
    return () => document.removeEventListener('click', away);
  }, []);

  const submit = () => {
    const v = q.trim();
    setOpen(false);
    navigate('/products' + (v ? '?q=' + encodeURIComponent(v) : ''));
  };

  return (
    <div className="searchbar" ref={box}>
      <label className="sr" htmlFor="q">Search products</label>
      <input id="q" type="search" placeholder="Search honey, ghee, rice…" autoComplete="off" value={q}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
      <button type="button" id="q-go" aria-label="Search" onClick={submit}><Icon name="search" /></button>
      <div className={'suggest' + (open && hits.length ? '' : ' hide')} id="suggest">
        {hits.map(p => (
          <Link key={p.id} to={`/product/${p.slug}`} onClick={() => { setOpen(false); setQ(''); }}>
            <img src={p.images[0]} alt="" />
            <span>{p.name}<br /><small className="muted">{money(lowestPrice(p))}</small></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Header({ activeKey }: { activeKey: string }) {
  const { data: cats = [] } = useCategories();
  const { data: s = {} } = useSettings();
  const wl = useWishlist();
  const unread = useUnreadCount();
  const lines = useCart();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [navOpenAt, setNavOpenAt] = useState<string | null>(null);   // open for this path only, so any navigation closes it
  const navOpen = navOpenAt === pathname;

  const logoSrc = String(s.logo_url || LOGO_DEFAULT);
  const logoH = Math.max(16, Math.min(200, Number(s.logo_height) || 40));
  const logoW = Math.max(0, Math.min(400, Number(s.logo_width) || 0));
  const shape = String(s.logo_shape || 'none');
  const fit = shape === 'circle' || s.logo_fit === 'cover' ? 'cover' : 'contain';
  const logoStyle = {
    height: logoH, maxWidth: 'none', objectFit: fit,
    width: shape === 'circle' ? logoH : logoW || 'auto',
    borderRadius: shape === 'circle' ? '50%' : shape === 'rounded' ? 10 : 0
  } as const;

  const nav = [
    { to: '/', label: 'Home', key: 'home', hot: false },
    { to: '/products?hotdeals=1', label: String(s.hotdeals_title || 'Hot Deals'), key: 'hotdeals', hot: true },
    ...cats.map(c => ({ to: `/category/${c.slug}`, label: c.name, key: 'cat-' + c.slug, hot: false })),
    { to: '/contact', label: 'Contact', key: 'contact', hot: false }
  ];
  const wishN = wl.data?.length ?? 0, msgN = unread.data ?? 0, cartN = cartCount(lines);

  return (
    <>
      {s.announcement_text ? (
        <div className="announce" aria-label="Announcement">
          <div className="announce-track">
            <span>{String(s.announcement_text)}</span><span aria-hidden="true">{String(s.announcement_text)}</span>
          </div>
        </div>
      ) : null}
      <header className="hdr">
        <div className="wrap hdr-main">
          <Link className="brand" to="/">
            <img className="brand-logo" src={logoSrc} alt={SHOP.name} style={logoStyle}
              onError={e => { if (!e.currentTarget.src.endsWith(LOGO_DEFAULT)) e.currentTarget.src = LOGO_DEFAULT; }} />
          </Link>
          <SearchBar />
          <div className="hdr-actions">
            <Link className="icon-btn" to="/wishlist" aria-label="Wishlist"><Icon name="heart" /><span className={'badge' + (wishN ? '' : ' hide')}>{wishN}</span></Link>
            <Link className="icon-btn" to="/account" aria-label="Account"><Icon name="user" /><span className={'badge' + (msgN ? '' : ' hide')}>{msgN}</span></Link>
            <button className="icon-btn" id="open-cart" aria-label="Basket" onClick={drawer.open}><Icon name="cart" /><span className={'badge' + (cartN ? '' : ' hide')}>{cartN}</span></button>
            <button className="icon-btn burger" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpenAt(navOpen ? null : pathname)}><Icon name="menu" /></button>
          </div>
        </div>
        <nav className={'navbar' + (navOpen ? ' open' : '')}>
          <div className="wrap">
            {nav.map(n => (
              <Link key={n.key} to={n.to} className={(n.key === activeKey ? 'active' : '') + (n.hot ? ' nav-hot' : '')}>{n.label}</Link>
            ))}
          </div>
        </nav>
      </header>
      {activeKey !== 'home' && (
        <button className="mback" aria-label="Go back"
          onClick={() => ((window.history.state?.idx ?? 0) > 0 ? navigate(-1) : navigate('/'))}><Icon name="back" /></button>
      )}
    </>
  );
}

function Footer() {
  const { data: cats = [] } = useCategories();
  return (
    <>
      <footer className="ftr">
        <div className="wrap">
          <div className="ftr-grid">
            <div>
              <span className="brand-name" style={{ fontSize: '1.3rem' }}>Riyadul BD</span>
              <p style={{ marginTop: 10, maxWidth: '38ch' }}>We buy from named farms, pack small, and deliver the same week. Nothing sits in a warehouse.</p>
              <p className="small">{SHOP.address}<br />{SHOP.hours}</p>
            </div>
            <div><h4>Shop</h4><ul>
              {cats.slice(0, 6).map(c => <li key={c.id}><Link to={`/category/${c.slug}`}>{c.name}</Link></li>)}
            </ul></div>
            <div><h4>Help</h4><ul>
              <li><Link to="/account">Track an order</Link></li>
              <li><Link to="/contact">Contact us</Link></li>
              <li><Link to="/contact#delivery">Delivery &amp; returns</Link></li>
              <li><Link to="/wishlist">Saved items</Link></li>
            </ul></div>
            <div>
              <h4>Order updates</h4>
              <p className="small">One message a week: what came in from the farms, and what is nearly gone.</p>
              <form className="newsletter" onSubmit={(e: FormEvent<HTMLFormElement>) => { e.preventDefault(); e.currentTarget.reset(); toast('You are on the list.'); }}>
                <input type="email" placeholder="Your email" required aria-label="Email address" />
                <button className="btn btn-gold" type="submit">Join</button>
              </form>
            </div>
          </div>
          <div className="ftr-bottom">
            <span>© {new Date().getFullYear()} Riyadul BD. All rights reserved.</span>
            <span>Cash on delivery · bKash · Nagad</span>
          </div>
        </div>
      </footer>
      <a className="wa" href={`https://wa.me/${SHOP.whatsapp}`} target="_blank" rel="noopener noreferrer" aria-label="Chat on WhatsApp"><Icon name="whatsapp" /></a>
    </>
  );
}

function CartDrawer() {
  const open = useDrawerOpen();
  const lines = useCart();
  const sub = cartSubtotal(lines);
  const left = SHOP.delivery.freeOver - sub;
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') drawer.close(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  return (
    <>
      <div className={'scrim' + (open ? ' on' : '')} id="scrim" onClick={drawer.close} />
      <aside className={'drawer' + (open ? ' on' : '')} id="drawer" aria-label="Basket">
        <div className="drawer-head"><h3>Your basket</h3>
          <button className="icon-btn" aria-label="Close basket" onClick={drawer.close}><Icon name="close" /></button></div>
        <div className="drawer-body" id="drawer-body">
          {lines.length === 0 ? (
            <div className="empty"><Icon name="basket" /><p>Your basket is empty.</p>
              <Link className="btn" to="/products" onClick={drawer.close}>Start shopping</Link></div>
          ) : lines.map(i => (
            <div className="line" key={i.key}>
              <img src={i.image} alt="" loading="lazy" />
              <div>
                <b>{i.name}</b>
                <i>{i.variant} · {money(i.price)}</i>
                <div className="qty-inline" style={{ maxWidth: 118, marginTop: 8 }}>
                  <button aria-label="Reduce quantity" onClick={() => cart.setQty(i.key, i.qty - 1)}>−</button>
                  <span>{i.qty}</span>
                  <button aria-label="Increase quantity" onClick={() => cart.setQty(i.key, i.qty + 1)}>+</button>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <b>{money(i.price * i.qty)}</b>
                <button className="rm" onClick={() => cart.remove(i.key)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
        <div className="drawer-foot" id="drawer-foot">
          {lines.length > 0 && (
            <>
              {left > 0 && <div className="notice">Add {money(left)} more for free delivery.</div>}
              <div className="totals"><div className="grand"><span>Subtotal</span><span>{money(sub)}</span></div></div>
              <Link className="btn btn-block" to="/checkout" onClick={drawer.close}>Go to checkout</Link>
              <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={drawer.close}>Keep shopping</button>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Scroll to top on navigation, or to the #anchor when the URL has one. */
function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) { requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView()); return; }
    window.scrollTo({ top: 0 });
    drawer.close();
  }, [pathname, hash]);
  return null;
}

export function ShopLayout() {
  const activeKey = useActiveKey();
  return (
    <>
      <OfflineNote />
      <Header activeKey={activeKey} />
      <Outlet />
      <Footer />
      <CartDrawer />
      <Toasts />
      <ScrollToTop />
    </>
  );
}
