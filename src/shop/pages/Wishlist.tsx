import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { ProductCard } from '../components/ProductCard';
import { useDocTitle } from '../lib/hooks';
import { useProducts, useWishlist } from '../lib/queries';

export default function Wishlist() {
  useDocTitle('Saved items — Riyadul BD');
  const { data: all = [] } = useProducts();
  const { data: ids = [] } = useWishlist();
  const list = all.filter(p => ids.includes(p.id));
  return (
    <main className="wrap section">
      <div className="section-head"><div><h1 style={{ fontSize: 'clamp(1.8rem,4vw,2.4rem)' }}>Saved items</h1>
        <p>Things you want when they are back in season.</p></div></div>
      <div className="grid" id="wish-grid">
        {list.length ? list.map(p => <ProductCard key={p.id} p={p} />) : (
          <div className="empty" style={{ gridColumn: '1/-1' }}><Icon name="heart" />
            <p>Nothing saved yet. Tap the heart on any product to keep it here.</p>
            <Link className="btn" to="/products">Browse the shop</Link></div>
        )}
      </div>
    </main>
  );
}
