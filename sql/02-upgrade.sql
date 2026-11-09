-- ============================================================
-- 02-upgrade.sql  —  Hot deals, scheduled promos, costs & inventory history
-- Run ONCE in the Supabase SQL editor, AFTER 01-schema.sql.
-- Additive only: nothing existing is dropped or rewritten except the
-- place_order() function, which is replaced so that
--   * it charges the promo price only while the promo window is open, and
--   * it snapshots each item's buying cost onto the order line (for real profit).
-- ============================================================

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
