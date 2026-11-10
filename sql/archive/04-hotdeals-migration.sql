-- ============================================================
-- Riyadul BD — migration v3 (Hot Deals)
-- Adds a Hot Deals flag + order to products, and a settings row for
-- the section title. Purely additive — safe to run on your existing
-- live project. Run this once in the SQL editor.
-- ============================================================

alter table products
  add column if not exists hot_deal      boolean not null default false,
  add column if not exists hot_deal_sort int     not null default 0;

create index if not exists products_hotdeal_idx on products(hot_deal, hot_deal_sort) where hot_deal;

insert into site_settings (key, value) values
  ('hotdeals_title', 'Hot Deals')
on conflict (key) do nothing;
