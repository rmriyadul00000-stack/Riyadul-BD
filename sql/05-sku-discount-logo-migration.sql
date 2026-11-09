-- ============================================================
-- Riyadul BD — migration v4
-- Adds a unique, human-readable product ID (SKU), an optional manual
-- discount-badge override, and an admin-configurable logo height.
-- Purely additive — safe to run on your existing live project.
-- ============================================================

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
