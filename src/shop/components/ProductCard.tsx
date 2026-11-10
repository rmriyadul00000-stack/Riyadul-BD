import { Link } from 'react-router';
import type { Product } from '../../lib/types';
import { Icon } from './Icon';
import { cart } from '../lib/cart';
import { discountPct, money, stockOf } from '../lib/shop';
import { toast } from '../lib/toast';
import { useToggleWishlist, useWishlist } from '../lib/queries';

/* Same markup and classes as the original card, so style.css applies unchanged. */
export function ProductCard({ p }: { p: Product }) {
  const wl = useWishlist();
  const toggle = useToggleWishlist();
  const v = p.variants[0] ?? { price: 0, label: '', stock: 0, mrp: 0 };
  const out = stockOf(p) <= 0;
  const off = discountPct(p);
  const wished = (wl.data ?? []).includes(p.id);
  const href = `/product/${p.slug}`;

  return (
    <article className="card" data-id={p.id}>
      <div className="card-media">
        <Link to={href} aria-label={p.name}>
          <img src={p.images[0]} alt={p.name} loading="lazy" />
        </Link>
        <div className="tags">
          {p.certified && <span className="tag">Certified organic</span>}
          {off > 0 && <span className="tag sale">{off}% off</span>}
          {out && <span className="tag out">Sold out</span>}
        </div>
        <button className={'wish ' + (wished ? 'on' : '')} aria-label={`Save ${p.name}`}
          onClick={() => toggle.mutate(p.id, { onSuccess: on => toast(on ? 'Saved to your list.' : 'Removed from your list.') })}>
          <Icon name={wished ? 'heartFill' : 'heart'} />
        </button>
      </div>
      <div className="card-body">
        <Link className="card-name" to={href}>{p.name}</Link>
        <span className="card-cat">{p.name_bn || ''}</span>
        <div className="price-row">
          <div className="price">
            <b>{money(v.price)}</b>
            {(v.mrp ?? 0) > v.price && <s>{money(v.mrp)}</s>}
            <em>/ {v.label}</em>
          </div>
          {out
            ? <button className="basket-btn off" disabled aria-label="Sold out"><Icon name="basketAdd" /></button>
            : <button className="basket-btn" aria-label={`Add ${p.name} to basket`} onClick={() => cart.add(p, p.variants[0].label, 1)}><Icon name="basketAdd" /></button>}
        </div>
      </div>
    </article>
  );
}
