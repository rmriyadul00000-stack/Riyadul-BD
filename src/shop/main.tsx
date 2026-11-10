import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import './style.css';
import { ShopLayout } from './components/Layout';
import Home from './pages/Home';
import Products from './pages/Products';
import ProductPage from './pages/ProductPage';
import Checkout from './pages/Checkout';
import Account from './pages/Account';
import Wishlist from './pages/Wishlist';
import Contact from './pages/Contact';
import NotFound from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } }
});

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<ShopLayout />}>
          <Route index element={<Home />} />
          <Route path="products" element={<Products />} />
          <Route path="category/:cat" element={<Products />} />
          <Route path="product/:slug" element={<ProductPage />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="account" element={<Account />} />
          <Route path="wishlist" element={<Wishlist />} />
          <Route path="contact" element={<Contact />} />
          {/* addresses from the previous multi-page site keep working */}
          <Route path="index.html" element={<Navigate to="/" replace />} />
          <Route path="products.html" element={<Navigate to="/products" replace />} />
          <Route path="product.html" element={<ProductPage />} />
          <Route path="checkout.html" element={<Navigate to="/checkout" replace />} />
          <Route path="account.html" element={<Navigate to="/account" replace />} />
          <Route path="wishlist.html" element={<Navigate to="/wishlist" replace />} />
          <Route path="contact.html" element={<Navigate to="/contact" replace />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
);
