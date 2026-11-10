-- ============================================================
-- Riyadul BD — RUN THIS WHEN THE SUPABASE PROJECT IS RESUMED
-- File: sql/pending/2026-11-10_run_when_supabase_resumes.sql
--
-- Saved on 2026-11-10 while the project was paused. Nothing in this file
-- has been run yet.
--
-- How to run: Supabase dashboard → SQL editor → paste the whole file → Run.
-- It runs as one transaction: if any statement fails, nothing is changed.
--
-- Safe to run on the existing database and safe to run twice. It never
-- drops a table or deletes a row. It also works straight after
-- 01-schema.sql on a brand new project.
--
-- Parts
--   A. Catch-up: every earlier migration (now in sql/archive/), so it no
--      longer matters which of them were already applied.
--   B. Fixes found in the November 2026 review:
--        B1  placeholder artwork (hero text "undefined", broken banners)
--        B2  a customer could unblock their own account / edit protected fields
--        B3  a customer could rewrite messages in their thread, including the shop's
--        B4  order tracking exposed phone, email and street address to anyone
--            who guessed an order number
--        B5  cancelling an order did not put the stock back
--        B6  indexes for the admin dashboard and inbox
-- ============================================================

begin;

-- ############################################################
-- A. CATCH-UP (idempotent copies of sql/archive/*)
-- ############################################################

-- ---- A1. category banners + site settings (was 03-migration-v2.sql) ----
-- ---------- category banners (separate desktop / mobile images) ----------
alter table categories
  add column if not exists desktop_banner_url text,
  add column if not exists mobile_banner_url  text;

-- ---------- site settings: announcement bar text, logo path ----------
create table if not exists site_settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table site_settings enable row level security;

drop policy if exists settings_read on site_settings;
create policy settings_read on site_settings for select using (true);

drop policy if exists settings_admin on site_settings;
create policy settings_admin on site_settings for all
  using (is_admin()) with check (is_admin());

grant select on site_settings to anon, authenticated;
grant insert, update, delete on site_settings to authenticated;

insert into site_settings (key, value) values
  ('announcement_text', 'Free Delivery Across Bangladesh • Easy Returns • Trusted Products'),
  ('logo_url', '')
on conflict (key) do nothing;

-- stamp updated_at whenever a setting changes
create or replace function stamp_setting() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists settings_stamp on site_settings;
create trigger settings_stamp before update on site_settings
  for each row execute function stamp_setting();

-- ---- A2. hot deals (was 04-hotdeals-migration.sql) ----
alter table products
  add column if not exists hot_deal      boolean not null default false,
  add column if not exists hot_deal_sort int     not null default 0;

create index if not exists products_hotdeal_idx on products(hot_deal, hot_deal_sort) where hot_deal;

insert into site_settings (key, value) values
  ('hotdeals_title', 'Hot Deals')
on conflict (key) do nothing;

-- ---- A3. product SKU, discount badge, logo height (was 05-sku-discount-logo-migration.sql) ----
-- unique product ID, e.g. P-1001, P-1002 …
create sequence if not exists product_sku_seq start 1001;

alter table products
  add column if not exists sku text,
  add column if not exists discount_pct numeric;

-- backfill any existing products that don't have one yet
update products set sku = 'P-' || nextval('product_sku_seq') where sku is null;

alter table products
  alter column sku set default 'P-' || nextval('product_sku_seq'),
  alter column sku set not null;

create unique index if not exists products_sku_idx on products(sku);

insert into site_settings (key, value) values
  ('logo_height', '40')
on conflict (key) do nothing;

insert into site_settings (key, value) values
  ('logo_width', ''), ('logo_fit', 'contain'), ('logo_shape', 'none'), ('low_stock_threshold', '5')
on conflict (key) do nothing;

-- ---- A4. promos, cost tracking, inventory history, place_order v2 (was 02-upgrade.sql) ----
-- ---------- 1. products: scheduled promo + hot-deal auto delist ----------
alter table products add column if not exists promo_start   timestamptz;
alter table products add column if not exists promo_end     timestamptz;
alter table products add column if not exists hot_deal_auto boolean not null default false;

-- Per-size fields live inside products.variants (jsonb), so no more columns are needed:
--   price / mrp                      default selling price and "Was" price
--   promo_price                      price while the promo window is open
--   cost, cost_transport, cost_packaging, cost_labor, cost_storage, cost_other, cost_other_note

-- ---------- 2. order lines remember what the item cost at the time of sale ----------
alter table order_items add column if not exists unit_cost numeric;   -- null on old orders (shown as estimated)

-- ---------- 3. inventory history: stock in, wastage, adjustments, expenses, notes, sales ----------
create table if not exists inventory_log (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid references products(id) on delete cascade,
  variant_label text,
  kind          text not null check (kind in
                  ('purchase','adjustment','wastage','expense','note','sale','return','price_change','cost_change')),
  qty           int  not null default 0,
  unit_cost     numeric,
  amount        numeric not null default 0,
  note          text,
  created_by    text,
  created_at    timestamptz not null default now()
);
create index if not exists inventory_log_product_idx on inventory_log(product_id, created_at desc);
create index if not exists inventory_log_kind_idx    on inventory_log(kind, created_at desc);

alter table inventory_log enable row level security;
drop policy if exists inventory_log_admin on inventory_log;
create policy inventory_log_admin on inventory_log for all using (is_admin()) with check (is_admin());
grant select, insert, update, delete on inventory_log to authenticated;

-- ---------- 4. helpers used by place_order (and handy in reports) ----------
create or replace function rb_num(v jsonb, k text) returns numeric
language sql immutable as $$ select coalesce(nullif(v ->> k, '')::numeric, 0) $$;

create or replace function rb_variant_cost(v jsonb) returns numeric
language sql immutable as $$
  select rb_num(v,'cost') + rb_num(v,'cost_transport') + rb_num(v,'cost_packaging')
       + rb_num(v,'cost_labor') + rb_num(v,'cost_storage') + rb_num(v,'cost_other')
$$;

-- true while a promo has prices set and "now" is inside its window (either end may be open)
create or replace function rb_promo_active(p products) returns boolean
language sql stable as $$
  select (p.promo_start is null or now() >= p.promo_start)
     and (p.promo_end   is null or now() <= p.promo_end)
     and exists (select 1 from jsonb_array_elements(p.variants) x where rb_num(x,'promo_price') > 0)
$$;

create or replace function rb_variant_price(p products, v jsonb) returns numeric
language sql stable as $$
  select case when rb_promo_active(p) and rb_num(v,'promo_price') > 0
              then rb_num(v,'promo_price') else rb_num(v,'price') end
$$;

-- ---------- 5. place_order: time-aware price + cost snapshot + sale history ----------
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
  v_cost       numeric;
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
    v_price := rb_variant_price(v_product, v_variant);
    v_cost  := rb_variant_cost(v_variant);
    v_stock := coalesce((v_variant ->> 'stock')::int, 0);
    if v_qty > v_stock then
      raise exception 'Only % left of % (%).', v_stock, v_product.name, v_variant ->> 'label';
    end if;

    insert into order_items (order_id, product_id, product_name, variant_label, unit_price, unit_cost, qty)
    values (v_order.id, v_product.id, v_product.name, v_variant ->> 'label', v_price, v_cost, v_qty);

    insert into inventory_log (product_id, variant_label, kind, qty, unit_cost, amount, note)
    values (v_product.id, v_variant ->> 'label', 'sale', v_qty, v_cost, v_price * v_qty, 'Order ' || v_order.order_code);

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

-- ---- A5. threaded customer messages (was 03-messages.sql) ----
alter table messages add column if not exists customer_id uuid references customers(id) on delete set null;
alter table messages add column if not exists sender text not null default 'customer' check (sender in ('customer','admin'));
alter table messages add column if not exists read_by_admin boolean not null default false;
alter table messages add column if not exists read_by_customer boolean not null default true;

create index if not exists messages_customer_idx on messages(customer_id, created_at);

-- Replace the old "anyone can insert" policy with one that still lets a
-- guest submit the contact form, but stops a customer from posting into
-- someone else's thread or pretending to be 'admin'.
drop policy if exists messages_insert on messages;
create policy messages_insert on messages for insert
  with check (
    is_admin()
    or (sender = 'customer' and (customer_id is null or customer_id = current_customer_id()))
  );

-- A signed-in customer can read and mark-read their own thread.
drop policy if exists messages_read_own on messages;
create policy messages_read_own on messages for select
  using (is_admin() or (customer_id is not null and customer_id = current_customer_id()));

drop policy if exists messages_update_own on messages;
create policy messages_update_own on messages for update
  using (is_admin() or (customer_id is not null and customer_id = current_customer_id()))
  with check (is_admin() or (customer_id is not null and customer_id = current_customer_id()));

-- messages_admin (full access for admins) already exists from 01-schema.sql.

grant select, update on messages to authenticated;


-- ############################################################
-- B. FIXES
-- ############################################################

-- ---- B1. placeholder artwork --------------------------------------------
-- The starter hero slides were generated with the caption missing, so they
-- read "undefined". Put each slide's own alt text in its place. Uploaded
-- photos are not data: URLs and are left alone.
update hero_slides
   set image_url = replace(image_url, '%3Eundefined%3C',
                           '%3E' || replace(coalesce(nullif(alt, ''), 'Riyadul BD'), ' ', '%20') || '%3C')
 where image_url like 'data:image/svg+xml%'
   and image_url like '%\%3Eundefined\%3C%';

-- Starter category banners with "&" in the name ("Rice & Grains") were
-- invalid SVG and showed as broken images.
update categories
   set desktop_banner_url = replace(desktop_banner_url, '%20%26%20', '%20%26amp%3B%20')
 where desktop_banner_url like 'data:image/svg+xml%' and desktop_banner_url like '%\%20\%26\%20%';
update categories
   set mobile_banner_url = replace(mobile_banner_url, '%20%26%20', '%20%26amp%3B%20')
 where mobile_banner_url like 'data:image/svg+xml%' and mobile_banner_url like '%\%20\%26\%20%';

-- ---- B2. customers cannot change protected fields on their own row ------
-- The policy customers_self_update lets a shopper update their own row,
-- which included `status` — a blocked account could set itself back to
-- 'active'. Name, phone, city and address stay editable; the rest is
-- frozen for everyone except admins (and the SQL editor / service role,
-- where auth.uid() is null).
create or replace function guard_customer_self_update() returns trigger
language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  new.status        := old.status;
  new.customer_code := old.customer_code;
  new.user_id       := old.user_id;
  new.notes         := old.notes;
  new.created_at    := old.created_at;
  return new;
end $$;

drop trigger if exists customers_guard_self_update on customers;
create trigger customers_guard_self_update
  before update on customers
  for each row execute function guard_customer_self_update();

create or replace function stamp_customer_updated() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists customers_stamp_updated on customers;
create trigger customers_stamp_updated
  before update on customers
  for each row execute function stamp_customer_updated();

-- ---- B3. a customer may only mark messages as read ----------------------
-- messages_update_own allowed any column to change, so a shopper could edit
-- the text of the shop's replies. Only read_by_customer may change now.
create or replace function guard_message_update() returns trigger
language plpgsql set search_path = public as $$
declare v_read boolean := new.read_by_customer;
begin
  if auth.uid() is null or is_admin() then return new; end if;
  new := old;
  new.read_by_customer := v_read;
  return new;
end $$;

drop trigger if exists messages_guard_update on messages;
create trigger messages_guard_update
  before update on messages
  for each row execute function guard_message_update();

-- ---- B4. order tracking returns status and items only -------------------
-- Order numbers are sequential (ORD-10001, ORD-10002 …), and track_order()
-- returned the whole row to anyone: phone, email, street address, note.
-- It now returns what a tracking box needs. A signed-in customer still
-- sees full details of their own orders through the orders table.
create or replace function track_order(p_code text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  select jsonb_build_object(
           'id', o.id, 'order_code', o.order_code, 'status', o.status,
           'placed_at', o.placed_at, 'confirmed_at', o.confirmed_at, 'shipped_at', o.shipped_at,
           'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at,
           'contact_name', split_part(btrim(o.contact_name), ' ', 1),
           'ship_city', o.ship_city, 'ship_zone', o.ship_zone,
           'payment_method', o.payment_method, 'payment_status', o.payment_status,
           'subtotal', o.subtotal, 'discount', o.discount, 'shipping_fee', o.shipping_fee, 'total', o.total,
           'items', coalesce((
              select jsonb_agg(jsonb_build_object(
                       'product_name', i.product_name, 'variant_label', i.variant_label,
                       'qty', i.qty, 'unit_price', i.unit_price))
                from order_items i where i.order_id = o.id), '[]'::jsonb))
    into v
  from orders o
  where upper(o.order_code) = upper(btrim(p_code));
  return v;
end $$;
grant execute on function track_order(text) to anon, authenticated;

-- ---- B5. cancelling an order returns its stock --------------------------
-- place_order() takes stock when an order is placed, but nothing gave it
-- back on cancellation, so the shelf count drifted down with every
-- cancelled order. Works both ways: re-opening a cancelled order takes the
-- units again. Each movement is written to inventory_log.
create or replace function restock_on_cancel() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  it     record;
  v_sign int;
  v_new  jsonb;
begin
  if (old.status = 'cancelled') = (new.status = 'cancelled') then return new; end if;
  v_sign := case when new.status = 'cancelled' then 1 else -1 end;

  for it in select * from order_items where order_id = new.id and product_id is not null loop
    perform 1 from products where id = it.product_id for update;
    select jsonb_agg(
             case when x.v ->> 'label' = it.variant_label
               then jsonb_set(x.v, '{stock}', to_jsonb(greatest(0, rb_num(x.v, 'stock')::int + v_sign * it.qty)))
               else x.v end order by x.ord)
      into v_new
      from products p, jsonb_array_elements(p.variants) with ordinality as x(v, ord)
     where p.id = it.product_id;
    if v_new is not null then
      update products set variants = v_new where id = it.product_id;
      insert into inventory_log (product_id, variant_label, kind, qty, unit_cost, amount, note)
      values (it.product_id, it.variant_label, case when v_sign > 0 then 'return' else 'sale' end,
              it.qty, it.unit_cost, it.unit_price * it.qty,
              (case when v_sign > 0 then 'Cancelled ' else 'Re-opened ' end) || new.order_code);
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists orders_restock on orders;
create trigger orders_restock
  after update of status on orders
  for each row execute function restock_on_cancel();

-- ---- B6. indexes for the dashboard and the inbox ------------------------
create index if not exists orders_status_placed_idx on orders(status, placed_at desc);
create index if not exists messages_unread_idx on messages(created_at desc) where not read_by_admin;
create index if not exists order_items_product_idx on order_items(product_id);

commit;

-- Optional check afterwards (read-only):
--   select count(*) from inventory_log;
--   select tgname from pg_trigger where tgname in
--     ('customers_guard_self_update','messages_guard_update','orders_restock');
