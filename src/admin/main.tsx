import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import './admin.css';
import './shell.css';
import { AdminGate } from './auth';
import { Shell } from './Shell';
import Dashboard from './Dashboard';
import Orders from './screens/Orders';
import Customers from './screens/Customers';
import Hero from './screens/Hero';
import Coupons from './screens/Coupons';
import Messages from './screens/Messages';
import Settings from './screens/Settings';
import Products from './screens/Products';
import Categories from './screens/Categories';
import HotDeals from './screens/HotDeals';
import Inventory from './screens/Inventory';
import { NAV_KEYS } from './nav';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } });

/* the old panel kept the open screen in the URL hash (admin.html#orders) */
function LegacyHash() {
  const { hash } = useLocation();
  const key = hash.slice(1);
  return <Navigate to={NAV_KEYS.includes(key) ? `/admin/${key}` : '/admin/dash'} replace />;
}

function App() {
  return (
    <BrowserRouter>
      <AdminGate>
        <Routes>
          <Route path="/admin" element={<Shell />}>
            <Route index element={<Navigate to="dash" replace />} />
            <Route path="dash" element={<Dashboard />} />
            <Route path="orders" element={<Orders />} />
            <Route path="customers" element={<Customers />} />
            <Route path="hero" element={<Hero />} />
            <Route path="coupons" element={<Coupons />} />
            <Route path="messages" element={<Messages />} />
            <Route path="settings" element={<Settings />} />
            <Route path="products" element={<Products />} />
            <Route path="categories" element={<Categories />} />
            <Route path="hotdeals" element={<HotDeals />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="*" element={<Navigate to="/admin/dash" replace />} />
          </Route>
          <Route path="*" element={<LegacyHash />} />
        </Routes>
      </AdminGate>
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
