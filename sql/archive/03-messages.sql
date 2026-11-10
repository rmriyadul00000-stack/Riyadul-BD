-- ============================================================
-- 03-messages.sql — Threaded customer messages (chat-style inbox)
-- Run ONCE in the Supabase SQL editor, AFTER 01-schema.sql (and
-- 02-upgrade.sql if you've run that too). Additive only: nothing
-- existing is dropped. A guest contact-form message still works
-- exactly as before (customer_id stays null, reply by email).
--
-- What this adds:
--   * messages.customer_id — links a message to the customer who
--     sent it, when they're signed in. Null = guest, email-only.
--   * messages.sender — 'customer' or 'admin', so a thread can hold
--     both sides of the conversation.
--   * messages.read_by_admin / read_by_customer — unread badges on
--     both sides.
--   * RLS so a signed-in customer can read and add to their OWN
--     thread only, never anyone else's, and can never post as 'admin'.
-- ============================================================

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
