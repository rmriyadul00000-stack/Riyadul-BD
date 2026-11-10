/* Domain types shared by the storefront, the admin panel and the data layer. */

export type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Variant {
  label: string;
  price: number;
  mrp?: number;
  stock?: number;
  promo_price?: number;
  cost?: number;
  cost_transport?: number;
  cost_packaging?: number;
  cost_labor?: number;
  cost_storage?: number;
  cost_other?: number;
  cost_other_note?: string;
}

export type PromoState = 'none' | 'scheduled' | 'active' | 'expired';

export interface Product {
  id: string;
  sku?: string;
  slug: string;
  name: string;
  name_bn?: string | null;
  cat: string;
  category_id?: string | null;
  farm?: string | null;
  origin?: string | null;
  variants: Variant[];
  images: string[];
  certified: boolean;
  featured: boolean;
  active: boolean;
  hot_deal?: boolean;
  hot_deal_sort?: number;
  discount_pct?: number | null;
  description: string;
  benefits: string[];
  storage_tip: string;
  promo_start?: string | null;
  promo_end?: string | null;
  hot_deal_auto?: boolean;
  promo_state?: PromoState;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  name_bn?: string | null;
  icon_svg?: string | null;
  image_url?: string | null;
  desktop_banner_url?: string | null;
  mobile_banner_url?: string | null;
  sort: number;
  active: boolean;
}

export interface HeroSlide {
  id: string;
  device: 'desktop' | 'mobile';
  image_url: string;
  alt?: string | null;
  sort: number;
  active: boolean;
}

export type CouponType = 'percent' | 'flat' | 'shipping';
export interface Coupon {
  code: string;
  type: CouponType;
  value: number;
  min_subtotal: number;
  note?: string | null;
  active: boolean;
}

export type OrderStatus = 'pending' | 'confirmed' | 'shipped' | 'delivered' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export interface Customer {
  id: string | null;
  customer_code?: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  city?: string | null;
  address?: string | null;
  status?: 'active' | 'blocked';
  created_at?: string;
  order_count?: number;
  lifetime_value?: number;
  last_order_at?: string | null;
}

export interface OrderItem {
  id?: string;
  order_id?: string;
  product_id?: string | null;
  product_name: string;
  variant_label: string;
  unit_price: number;
  unit_cost?: number | null;
  qty: number;
  line_total?: number;
}

export interface Order {
  id: string;
  order_code: string;
  customer_id: string | null;
  is_guest: boolean;
  contact_name: string;
  contact_email?: string;
  contact_phone?: string;
  ship_address?: string;
  ship_city: string;
  ship_zone: 'inside' | 'outside';
  note?: string;
  payment_method: string;
  payment_status: PaymentStatus;
  subtotal: number;
  discount: number;
  shipping_fee: number;
  total: number;
  coupon_code?: string | null;
  status: OrderStatus;
  placed_at: string;
  confirmed_at?: string | null;
  shipped_at?: string | null;
  delivered_at?: string | null;
  cancelled_at?: string | null;
  items?: OrderItem[];
  customers?: { customer_code: string; full_name: string } | null;
}

export interface OrderPayload {
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  ship_address: string;
  ship_city: string;
  ship_zone: 'inside' | 'outside';
  note: string;
  payment_method: string;
  coupon_code: string | null;
  items: { product_id: string; variant_label: string; qty: number }[];
}

export interface PlacedOrder { order_id: string; order_code: string; total: number }

export interface Message {
  id: string;
  customer_id: string | null;
  sender: 'customer' | 'admin';
  name: string;
  email: string;
  phone?: string | null;
  subject?: string | null;
  message: string;
  read_by_admin: boolean;
  read_by_customer: boolean;
  created_at: string;
}

export interface InventoryLogEntry {
  id?: string;
  product_id: string;
  variant_label?: string | null;
  kind: 'purchase' | 'adjustment' | 'wastage' | 'expense' | 'note' | 'sale' | 'return' | 'price_change' | 'cost_change';
  qty?: number;
  unit_cost?: number | null;
  amount?: number;
  note?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export type Settings = Record<string, string | number | null | undefined>;
export type BackendMode = 'live' | 'offline' | 'local';
export interface AdminUser { email: string; name?: string | null }

export interface CartLine {
  key: string;
  id: string;
  slug: string;
  name: string;
  variant: string;
  price: number;
  mrp: number;
  stock: number;
  image: string;
  qty: number;
}
