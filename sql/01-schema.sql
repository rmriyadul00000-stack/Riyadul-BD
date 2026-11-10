-- ============================================================
-- Riyadul BD — complete database
-- Written for a BRAND NEW Supabase project. It assumes nothing exists.
-- Run this whole file once in the SQL editor, then
-- sql/pending/2026-11-10_run_when_supabase_resumes.sql, then 02-seed.sql.
--
-- What it creates
--   admins         who may open the admin panel
--   customers      one permanent row per registered account (CUST-10001…)
--   categories     aisles, with icon SVG and image managed from the panel
--   products       catalogue, sizes held as JSON variants
--   coupons        discount codes
--   orders         one row per order (ORD-10001…), guest or registered
--   order_items    the lines of each order
--   hero_slides    home page slideshow, separate desktop and mobile images
--   messages       contact form
--   wishlist       saved products per account
--
-- Key rules enforced here, not in the browser
--   A registered account has exactly one customer row, reused for every
--   order they ever place.
--   Order contact and shipping details live on the order. Placing an
--   order never rewrites the customer's account profile.
--   A guest order is flagged is_guest and is never matched to an account
--   by email.
-- ============================================================

create extension if not exists "pgcrypto";

-- ============================================================
-- 1. ADMINS
-- ============================================================
create table admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  name       text,
  added_at   timestamptz not null default now()
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins a where a.user_id = auth.uid());
$$;

-- ============================================================
-- 2. CUSTOMERS
-- One row per registered account. Created automatically on sign-up.
-- ============================================================
create sequence customer_code_seq start 10001;

create table customers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid unique references auth.users(id) on delete set null,
  customer_code text unique not null default 'CUST-' || nextval('customer_code_seq'),
  full_name     text,
  email         text,
  phone         text,
  city          text,
  address       text,
  status        text not null default 'active' check (status in ('active','blocked')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index customers_user_idx  on customers(user_id);
create index customers_email_idx on customers(lower(email));
create index customers_phone_idx on customers(phone);

-- every new auth user gets a customer row, once
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into customers (user_id, full_name, email, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- the customer row belonging to whoever is signed in
create or replace function current_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from customers where user_id = auth.uid();
$$;

-- ============================================================
-- 3. CATEGORIES
-- icon_svg holds inline SVG markup; image_url points at the
-- category-media storage bucket.
-- ============================================================
create table categories (
  id                uuid primary key default gen_random_uuid(),
  slug              text unique not null,
  name              text not null,
  name_bn           text,
  icon_svg          text,
  image_url         text,
  desktop_banner_url text,
  mobile_banner_url  text,
  sort              int not null default 0,
  active            boolean not null default true,
  created_at        timestamptz not null default now()
);

create index categories_sort_idx on categories(sort) where active;

-- ============================================================
-- 4. PRODUCTS
-- variants: [{"label":"500 g","price":120,"mrp":150,"stock":20,"cost":90}, ...]
-- ============================================================
create sequence product_sku_seq start 1001;

create table products (
  id          uuid primary key default gen_random_uuid(),
  sku         text unique not null default 'P-' || nextval('product_sku_seq'),
  slug        text unique not null,
  name        text not null,
  name_bn     text,
  category_id uuid references categories(id) on delete set null,
  cat         text not null references categories(slug) on update cascade,
  farm        text,
  origin      text,
  variants    jsonb not null default '[]'::jsonb,
  images      jsonb not null default '[]'::jsonb,
  description text default '',
  benefits    jsonb not null default '[]'::jsonb,
  storage_tip text default '',
  certified   boolean not null default false,
  featured    boolean not null default false,
  hot_deal    boolean not null default false,
  hot_deal_sort int    not null default 0,
  discount_pct numeric,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index products_cat_idx      on products(cat) where active;
create index products_featured_idx on products(featured) where active;
create index products_hotdeal_idx  on products(hot_deal, hot_deal_sort) where hot_deal;

-- keep category_id and cat in step whichever one is written
create or replace function sync_product_category() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.category_id is null and new.cat is not null then
    select id into new.category_id from categories where slug = new.cat;
  elsif new.category_id is not null then
    select slug into new.cat from categories where id = new.category_id;
  end if;
  return new;
end $$;

create trigger products_sync_category
  before insert or update on products
  for each row execute function sync_product_category();

-- ============================================================
-- 5. COUPONS
-- ============================================================
create table coupons (
  code         text primary key,
  type         text not null check (type in ('percent','flat','shipping')),
  value        numeric not null default 0,
  min_subtotal numeric not null default 0,
  note         text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ============================================================
-- 6. ORDERS
-- customer_id is set only for a signed-in account. A guest order keeps
-- customer_id null and is_guest true — the checkout email is never used
-- to attach it to an account.
-- ============================================================
create sequence order_code_seq start 10001;

create table orders (
  id             uuid primary key default gen_random_uuid(),
  order_code     text unique not null default 'ORD-' || nextval('order_code_seq'),
  customer_id    uuid references customers(id) on delete set null,
  is_guest       boolean not null default true,

  -- contact and delivery details for THIS order only
  contact_name   text not null,
  contact_email  text not null,
  contact_phone  text not null,
  ship_address   text not null,
  ship_city      text not null,
  ship_zone      text not null default 'inside' check (ship_zone in ('inside','outside')),
  note           text,

  payment_method text not null default 'cod',
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','paid','refunded')),

  subtotal    numeric not null default 0,
  discount    numeric not null default 0,
  shipping_fee numeric not null default 0,
  total       numeric not null default 0,
  coupon_code text,

  status      text not null default 'pending'
              check (status in ('pending','confirmed','shipped','delivered','cancelled')),
  placed_at     timestamptz not null default now(),
  confirmed_at  timestamptz,
  shipped_at    timestamptz,
  delivered_at  timestamptz,
  cancelled_at  timestamptz,
  updated_at    timestamptz not null default now()
);

create index orders_customer_idx on orders(customer_id);
create index orders_status_idx   on orders(status);
create index orders_placed_idx   on orders(placed_at desc);
create index orders_phone_idx    on orders(contact_phone);
create index orders_email_idx    on orders(lower(contact_email));

-- stamp the matching timestamp whenever the status moves
create or replace function stamp_order_status() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if new.status is distinct from old.status then
    case new.status
      when 'confirmed' then new.confirmed_at := coalesce(new.confirmed_at, now());
      when 'shipped'   then new.shipped_at   := coalesce(new.shipped_at, now());
      when 'delivered' then new.delivered_at := coalesce(new.delivered_at, now());
      when 'cancelled' then new.cancelled_at := coalesce(new.cancelled_at, now());
      else null;
    end case;
  end if;
  return new;
end $$;

create trigger orders_stamp_status
  before update on orders
  for each row execute function stamp_order_status();

-- ============================================================
-- 7. ORDER ITEMS
-- Name and price are copied in so an old order still reads correctly
-- after a product is renamed, repriced or deleted.
-- ============================================================
create table order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders(id) on delete cascade,
  product_id    uuid references products(id) on delete set null,
  product_name  text not null,
  variant_label text not null,
  unit_price    numeric not null default 0,
  qty           int not null default 1 check (qty > 0),
  line_total    numeric generated always as (unit_price * qty) stored
);

create index order_items_order_idx on order_items(order_id);

-- ============================================================
-- 8. HERO SLIDES — images only, separate per device
-- ============================================================
create table hero_slides (
  id         uuid primary key default gen_random_uuid(),
  device     text not null check (device in ('desktop','mobile')),
  image_url  text not null,
  alt        text,
  sort       int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index hero_device_idx on hero_slides(device, sort) where active;

-- ============================================================
-- 8b. SITE SETTINGS — announcement bar text, logo path
-- ============================================================
create table site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

create or replace function stamp_setting() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

create trigger settings_stamp before update on site_settings
  for each row execute function stamp_setting();

insert into site_settings (key, value) values
  ('announcement_text', 'Free Delivery Across Bangladesh • Easy Returns • Trusted Products'),
  ('logo_url', ''),
  ('logo_height', '40'),
  ('hotdeals_title', 'Hot Deals');

-- ============================================================
-- 9. MESSAGES + WISHLIST
-- ============================================================
create table messages (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  phone      text,
  subject    text,
  message    text not null,
  handled    boolean not null default false,
  created_at timestamptz not null default now()
);

create table wishlist (
  customer_id uuid not null references customers(id) on delete cascade,
  product_id  uuid not null references products(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (customer_id, product_id)
);

create or replace function attach_wishlist_customer() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.customer_id is null then new.customer_id := current_customer_id(); end if;
  return new;
end $$;

create trigger wishlist_attach before insert on wishlist
  for each row execute function attach_wishlist_customer();

-- ============================================================
-- 10. PLACE ORDER
-- One call writes the order, its lines and the stock change together, so
-- a half-written order is impossible. Works for guests and accounts.
-- payload example:
-- {
--   "contact_name":"…","contact_email":"…","contact_phone":"…",
--   "ship_address":"…","ship_city":"Dhaka","ship_zone":"inside",
--   "note":"","payment_method":"cod","coupon_code":"FRESH10",
--   "items":[{"product_id":"…","variant_label":"500 g","qty":2}]
-- }
-- ============================================================
create or replace function place_order(payload jsonb)
returns table (order_id uuid, order_code text, total numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_customer   uuid := current_customer_id();
  v_order      orders%rowtype;
  v_item       jsonb;
  v_product    products%rowtype;
  v_variant    jsonb;
  v_price      numeric;
  v_stock      int;
  v_qty        int;
  v_subtotal   numeric := 0;
  v_discount   numeric := 0;
  v_ship       numeric := 0;
  v_coupon     coupons%rowtype;
  v_free_over  numeric := 2000;
  v_new_variants jsonb;
begin
  if payload -> 'items' is null or jsonb_array_length(payload -> 'items') = 0 then
    raise exception 'The basket is empty.';
  end if;

  insert into orders (
    customer_id, is_guest,
    contact_name, contact_email, contact_phone,
    ship_address, ship_city, ship_zone, note,
    payment_method, coupon_code
  ) values (
    v_customer, v_customer is null,
    payload ->> 'contact_name', payload ->> 'contact_email', payload ->> 'contact_phone',
    payload ->> 'ship_address', payload ->> 'ship_city',
    coalesce(payload ->> 'ship_zone', 'inside'), payload ->> 'note',
    coalesce(payload ->> 'payment_method', 'cod'), nullif(payload ->> 'coupon_code', '')
  ) returning * into v_order;

  for v_item in select * from jsonb_array_elements(payload -> 'items') loop
    select * into v_product from products
      where id = (v_item ->> 'product_id')::uuid and active for update;
    if not found then raise exception 'A product in the basket is no longer available.'; end if;

    select v into v_variant
      from jsonb_array_elements(v_product.variants) v
      where v ->> 'label' = v_item ->> 'variant_label';
    if v_variant is null then raise exception 'That size is no longer sold: %', v_item ->> 'variant_label'; end if;

    v_qty   := (v_item ->> 'qty')::int;
    v_price := (v_variant ->> 'price')::numeric;
    v_stock := coalesce((v_variant ->> 'stock')::int, 0);
    if v_qty > v_stock then
      raise exception 'Only % left of % (%).', v_stock, v_product.name, v_variant ->> 'label';
    end if;

    insert into order_items (order_id, product_id, product_name, variant_label, unit_price, qty)
    values (v_order.id, v_product.id, v_product.name, v_variant ->> 'label', v_price, v_qty);

    v_subtotal := v_subtotal + (v_price * v_qty);

    select jsonb_agg(
             case when v ->> 'label' = v_variant ->> 'label'
               then jsonb_set(v, '{stock}', to_jsonb(v_stock - v_qty))
               else v end)
      into v_new_variants
      from jsonb_array_elements(v_product.variants) v;
    update products set variants = v_new_variants where id = v_product.id;
  end loop;

  -- delivery
  v_ship := case when coalesce(payload ->> 'ship_zone', 'inside') = 'outside' then 120 else 60 end;

  -- discount
  if nullif(payload ->> 'coupon_code', '') is not null then
    select * into v_coupon from coupons
      where upper(code) = upper(payload ->> 'coupon_code') and active;
    if found and v_subtotal >= v_coupon.min_subtotal then
      if v_coupon.type = 'percent'  then v_discount := round(v_subtotal * v_coupon.value / 100);
      elsif v_coupon.type = 'flat'  then v_discount := least(v_coupon.value, v_subtotal);
      elsif v_coupon.type = 'shipping' then v_ship := 0;
      end if;
    else
      update orders set coupon_code = null where id = v_order.id;
    end if;
  end if;

  if v_subtotal >= v_free_over then v_ship := 0; end if;

  update orders set
    subtotal = v_subtotal,
    discount = v_discount,
    shipping_fee = v_ship,
    total = greatest(0, v_subtotal - v_discount + v_ship)
  where id = v_order.id
  returning orders.id, orders.order_code, orders.total
  into order_id, order_code, total;

  return next;
end $$;

grant execute on function place_order(jsonb) to anon, authenticated;

-- look up one order by its number, for the "track my order" box
create or replace function track_order(p_code text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  select to_jsonb(o) || jsonb_build_object(
           'items', coalesce((select jsonb_agg(to_jsonb(i)) from order_items i where i.order_id = o.id), '[]'::jsonb))
    into v
  from orders o
  where upper(o.order_code) = upper(p_code);
  return v;
end $$;

grant execute on function track_order(text) to anon, authenticated;

-- ============================================================
-- 11. ADMIN VIEW — customers with their order totals
-- ============================================================
create or replace view customer_overview
with (security_invoker = true) as
select
  c.*,
  count(o.id)                              as order_count,
  coalesce(sum(o.total) filter (where o.status <> 'cancelled'), 0) as lifetime_value,
  max(o.placed_at)                         as last_order_at
from customers c
left join orders o on o.customer_id = c.id
group by c.id;

-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================
alter table admins      enable row level security;
alter table customers   enable row level security;
alter table categories  enable row level security;
alter table products    enable row level security;
alter table coupons     enable row level security;
alter table orders      enable row level security;
alter table order_items enable row level security;
alter table hero_slides enable row level security;
alter table site_settings enable row level security;
alter table messages    enable row level security;
alter table wishlist    enable row level security;

-- admins: only an admin can see the list
create policy admins_read on admins for select using (is_admin());

-- customers: you see your own row, admins see all; nobody may change
-- customer_code or user_id from the browser
create policy customers_self_read on customers for select
  using (user_id = auth.uid() or is_admin());
create policy customers_self_update on customers for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy customers_admin_all on customers for all
  using (is_admin()) with check (is_admin());

-- catalogue: public reads the live rows, admins do everything
create policy categories_read  on categories for select using (active or is_admin());
create policy categories_admin on categories for all using (is_admin()) with check (is_admin());

create policy products_read  on products for select using (active or is_admin());
create policy products_admin on products for all using (is_admin()) with check (is_admin());

create policy coupons_read  on coupons for select using (active or is_admin());
create policy coupons_admin on coupons for all using (is_admin()) with check (is_admin());

create policy hero_read  on hero_slides for select using (active or is_admin());
create policy hero_admin on hero_slides for all using (is_admin()) with check (is_admin());

create policy settings_read  on site_settings for select using (true);
create policy settings_admin on site_settings for all using (is_admin()) with check (is_admin());

-- orders: created only through place_order(); readable by their owner
-- or an admin; changeable only by an admin
create policy orders_read on orders for select
  using (is_admin() or (customer_id is not null and customer_id = current_customer_id()));
create policy orders_admin_write on orders for all
  using (is_admin()) with check (is_admin());

create policy order_items_read on order_items for select
  using (is_admin() or exists (
    select 1 from orders o
    where o.id = order_items.order_id
      and o.customer_id is not null
      and o.customer_id = current_customer_id()));
create policy order_items_admin on order_items for all
  using (is_admin()) with check (is_admin());

-- contact form: anyone may write, only admins may read
create policy messages_insert on messages for insert with check (true);
create policy messages_admin  on messages for all using (is_admin()) with check (is_admin());

-- wishlist: your own rows only
create policy wishlist_own on wishlist for all
  using (customer_id = current_customer_id())
  with check (customer_id = current_customer_id());

-- ============================================================
-- 12b. GRANTS
-- Supabase normally grants these by default; stated explicitly so the
-- schema is complete on its own. Row level security above is what
-- actually decides who sees which row.
-- ============================================================
grant usage on schema public to anon, authenticated;

grant select on categories, products, coupons, hero_slides, site_settings to anon, authenticated;
grant insert on messages to anon, authenticated;
grant select on orders, order_items to authenticated;
grant select, update on customers to authenticated;
grant select on customer_overview to authenticated;
grant select, insert, delete on wishlist to authenticated;
grant select on admins to authenticated;

-- admins work through the same client, so they need write access; the
-- policies above still require is_admin() on every row
grant insert, update, delete on
  categories, products, coupons, hero_slides, orders, order_items,
  messages, customers, hero_slides, site_settings to authenticated;

grant usage, select on all sequences in schema public to authenticated;

-- ============================================================
-- 13. STORAGE
-- Three public buckets. Only admins may upload or delete.
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('product-media',  'product-media',  true),
  ('category-media', 'category-media', true),
  ('hero-media',     'hero-media',     true)
on conflict (id) do nothing;

drop policy if exists storage_public_read on storage.objects;
create policy storage_public_read on storage.objects for select
  using (bucket_id in ('product-media','category-media','hero-media'));

drop policy if exists storage_admin_write on storage.objects;
create policy storage_admin_write on storage.objects for insert
  with check (bucket_id in ('product-media','category-media','hero-media') and is_admin());

drop policy if exists storage_admin_update on storage.objects;
create policy storage_admin_update on storage.objects for update
  using (bucket_id in ('product-media','category-media','hero-media') and is_admin())
  with check (bucket_id in ('product-media','category-media','hero-media') and is_admin());

drop policy if exists storage_admin_delete on storage.objects;
create policy storage_admin_delete on storage.objects for delete
  using (bucket_id in ('product-media','category-media','hero-media') and is_admin());

-- ============================================================
-- 14. LAST STEP — make yourself an admin
--
--   1. Authentication → Users → Add user (email + password).
--   2. Run this with that email:
--
--      insert into admins (user_id, email, name)
--      select id, email, 'Owner' from auth.users
--      where email = 'owner@riyadulbd.com';
--
-- Until a row exists here, the admin panel refuses every login.
-- ============================================================
