export interface NavItem { key: string; label: string; icon: string }
export interface NavGroup { label: string; items: NavItem[] }

const i = (key: string, label: string, icon: string): NavItem => ({ key, label, icon });

export const NAV_GROUPS: NavGroup[] = [
  { label: 'Overview', items: [i('dash', 'Dashboard', 'home')] },
  { label: 'Sales', items: [i('orders', 'Orders', 'cart'), i('customers', 'Customers', 'users'), i('messages', 'Messages', 'mail')] },
  { label: 'Catalog', items: [i('products', 'Products', 'box'), i('categories', 'Categories', 'tag'), i('inventory', 'Inventory', 'chart'),
      i('hotdeals', 'Hot Deals', 'flame'), i('coupons', 'Discount codes', 'ticket')] },
  { label: 'Storefront', items: [i('hero', 'Hero slides', 'image'), i('settings', 'Settings', 'gear')] }
];
export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);
export const NAV_KEYS = NAV_ITEMS.map(x => x.key);
export const NAV_LABEL: Record<string, string> = Object.fromEntries(NAV_ITEMS.map(x => [x.key, x.label]));
