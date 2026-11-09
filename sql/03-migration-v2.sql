-- ============================================================
-- Riyadul BD — migration v2
-- Adds category banners and a site_settings table (announcement text,
-- logo). Purely additive — safe to run on your existing live project.
-- Nothing here touches or resets any table you already have data in.
-- Run this once in the SQL editor.
-- ============================================================

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
