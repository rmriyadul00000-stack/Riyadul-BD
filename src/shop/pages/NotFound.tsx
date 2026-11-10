import { Link } from 'react-router';
import { Icon } from '../components/Icon';
import { useDocTitle } from '../lib/hooks';

export default function NotFound() {
  useDocTitle('Page not found — Riyadul BD');
  return (
    <main className="wrap section">
      <div className="empty"><Icon name="basket" /><p>We can't find that page.</p>
        <Link className="btn" to="/products">Back to the shop</Link></div>
    </main>
  );
}
