import { useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { PolicySection } from '../components/Policy';
import { ProductCard } from '../components/ProductCard';
import { cart } from '../lib/cart';
import { drawer } from '../lib/drawer';
import { useDocTitle } from '../lib/hooks';
import { useProduct, useProducts, useToggleWishlist, useWishlist } from '../lib/queries';
import { SHOP, discountPct, money } from '../lib/shop';
import { toast } from '../lib/toast';
import type { Product } from '../../lib/types';

type Tab = 'about' | 'keeping' | 'delivery';

function Detail({ p }: { p: Product }) {
  const wl = useWishlist();
  const toggle = useToggleWishlist();
  const [label, setLabel] = useState(() => (p.variants.find(v => (v.stock || 0) > 0) ?? p.variants[0]).label);
  const variant = p.variants.find(v => v.label === label) ?? p.variants[0];
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  const touchX = useRef<number | null>(null);
  const out = (variant.stock || 0) <= 0;
  const wished = (wl.data ?? []).includes(p.id);
  const off = discountPct(p);
  const n = p.images.length;

  return (
    <div className="pdp" id="pdp">
      <div>
        <div className="gallery-main"
          onTouchStart={e => { touchX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchX.current == null || n < 2) return;
            const dx = e.changedTouches[0].clientX - touchX.current;
            if (dx < -40) setImg(i => (i + 1) % n); else if (dx > 40) setImg(i => (i - 1 + n) % n);
            touchX.current = null;
          }}>
          <img src={p.images[img]} alt={p.name} />
          <button className={'wish pdp-wish ' + (wished ? 'on' : '')} aria-label="Save this item"
            onClick={() => toggle.mutate(p.id, { onSuccess: on => toast(on ? 'Saved to your list.' : 'Removed from your list.') })}>
            <Icon name={wished ? 'heartFill' : 'heart'} />
          </button>
        </div>
        {n > 1 && (
          <div className="thumbs">
            {p.images.map((s, i) => <button key={s + i} className={i === img ? 'on' : ''} onClick={() => setImg(i)}><img src={s} alt="" /></button>)}
          </div>
        )}
      </div>
      <div>
        <span className="card-cat">{p.name_bn || ''}</span>
        <h1 className="pdp-title">{p.name}</h1>
        <p className="muted small">{p.farm || ''} · {p.origin || ''}</p>
        <div className="tags" style={{ position: 'static', flexDirection: 'row', margin: '10px 0' }}>
          {p.certified && <span className="tag">Certified organic</span>}
          {off > 0 && <span className="tag sale">{off}% off</span>}
        </div>
        <div className="pdp-price">
          <b>{money(variant.price)}</b>
          {(variant.mrp ?? 0) > variant.price && <s>{money(variant.mrp)}</s>}
          <span className="muted">per {variant.label}</span>
        </div>
        <div className="opt-group">
          <span>Choose a size</span>
          <div className="opts">
            {p.variants.map(v => (
              <button key={v.label} className={'opt' + (v.label === variant.label ? ' on' : '')} disabled={(v.stock || 0) <= 0}
                onClick={() => { setLabel(v.label); setQty(1); }}>{v.label} — {money(v.price)}</button>
            ))}
          </div>
        </div>
        <p className={'small ' + (out ? 'notice bad' : 'muted')}>
          {out ? 'This size is sold out. Pick another, or check back — farm stock refreshes twice a week.' : `${variant.stock} in stock right now`}
        </p>
        <div className="buy-row">
          <div className="stepper">
            <button aria-label="Reduce quantity" onClick={() => setQty(q => Math.max(1, q - 1))}>−</button>
            <span>{qty}</span>
            <button aria-label="Increase quantity" onClick={() => setQty(q => (q < (variant.stock || 0) ? q + 1 : q))}>+</button>
          </div>
          <button className="btn" disabled={out} onClick={() => { if (cart.add(p, variant.label, qty)) drawer.open(); }}>{out ? 'Sold out' : 'Add to basket'}</button>
        </div>
        <div className="facts">
          <div><dt>Farm</dt><dd>{p.farm || '—'}</dd></div>
          <div><dt>Grown in</dt><dd>{p.origin || '—'}</dd></div>
          <div><dt>Sold as</dt><dd>{p.variants.map(v => v.label).join(' · ')}</dd></div>
          <div><dt>Delivery</dt><dd>Inside Dhaka next day · elsewhere in 2–3 days</dd></div>
        </div>
      </div>
    </div>
  );
}

export default function ProductPage() {
  const { slug: routeSlug } = useParams();
  const [sp] = useSearchParams();
  const slug = routeSlug ?? sp.get('slug') ?? undefined;
  const res = useProduct(slug);
  const { data: all = [] } = useProducts();
  const [tab, setTab] = useState<Tab>('about');
  const p = res.data && res.data.ok ? res.data.data : null;
  useDocTitle(p ? `${p.name} — Riyadul BD` : 'Product — Riyadul BD');

  const related = useMemo(() => (p ? all.filter(x => x.cat === p.cat && x.id !== p.id).slice(0, 4) : []), [all, p]);

  /* old links: /product.html?slug=tomato → /product/tomato */
  if (!routeSlug && slug) return <Navigate to={`/product/${slug}`} replace />;

  if (res.isLoading) return <main className="wrap"><div className="pdp" id="pdp" /></main>;
  if (!p) {
    return (
      <main className="wrap">
        <div className="pdp" id="pdp">
          <div className="empty"><Icon name="basket" /><p>{res.data && !res.data.ok ? res.data.error : 'That product is no longer listed.'}</p>
            <Link className="btn" to="/products">Back to the shop</Link></div>
        </div>
      </main>
    );
  }

  const panes: Record<Tab, React.ReactNode> = {
    about: <>
      <p>{p.description}</p>
      <h4>Why this one</h4><ul>{(p.benefits || []).map(b => <li key={b}>{b}</li>)}</ul>
    </>,
    keeping: <>
      <h4>Keeping it fresh</h4><p>{p.storage_tip || 'Store cool and dry.'}</p>
      <h4>What to expect</h4><p>Size, colour and weight vary between deliveries. Produce is weighed after trimming, so what you receive matches what you paid for.</p>
    </>,
    delivery: <>
      <h4>Delivery</h4>
      <p>Inside Dhaka we deliver the next day. Outside Dhaka takes two to three days by courier.
        Delivery is {money(SHOP.delivery.inside)} inside Dhaka, {money(SHOP.delivery.outside)} elsewhere, and free over {money(SHOP.delivery.freeOver)}.</p>
      <h4>If something arrives wrong</h4>
      <p>Photograph it and message us the same day on WhatsApp. We replace it on the next run or refund the item — your choice.</p>
    </>
  };
  const TABS: [Tab, string][] = [['about', 'About this item'], ['keeping', 'Storage'], ['delivery', 'Delivery & returns']];

  return (
    <>
      <main className="wrap">
        <nav className="crumbs" id="crumbs">
          <Link to="/">Home</Link> / <Link to={`/category/${p.cat}`}>{p.cat.replace(/-/g, ' ')}</Link> / {p.name}
        </nav>
        <Detail key={p.id} p={p} />
        <div className="tabs" id="tabs">
          {TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}
        </div>
        <div className="prose" id="pane">{panes[tab]}</div>
        {related.length > 0 && (
          <section className="section" id="related-section">
            <div className="section-head"><div><h2>From the same aisle</h2></div></div>
            <div className="grid" id="related">{related.map(x => <ProductCard key={x.id} p={x} />)}</div>
          </section>
        )}
      </main>
      <PolicySection />
    </>
  );
}
