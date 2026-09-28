-- ===========================================================================
-- Row Level Security, helper functions, and the washer-card view.
-- Trust model:
--   * Washers see only PENDING orders in THEIR OWN building (same-building match).
--   * Requesters never see other requesters' orders.
--   * One-way visibility: a requester may read a limited public card for the
--     washer assigned to their order. Washers can never read requester profiles.
-- ===========================================================================

-- ------------------------------------------------------- helper functions ---
create or replace function public.current_role()
returns user_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false) $$;

create or replace function public.my_building_id()
returns uuid
language sql stable security definer set search_path = public
as $$ select building_id from public.profiles where id = auth.uid() $$;

-- keep updated_at honest
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

drop trigger if exists orders_touch on public.orders;
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------- new-user provisioning ---
-- Mirrors the web product's .edu gate. A signup whose email is not .edu is
-- rejected outright rather than left half-provisioned.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_role  user_role := coalesce((new.raw_user_meta_data->>'role')::user_role, 'requester');
begin
  if v_email !~ '^[^@\s]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$' then
    raise exception 'A valid .edu college email address is required to register.'
      using errcode = 'check_violation';
  end if;

  insert into public.profiles (id, role, edu_email, first_name, last_name)
  values (
    new.id,
    v_role,
    v_email,
    nullif(new.raw_user_meta_data->>'first_name', ''),
    nullif(new.raw_user_meta_data->>'last_name', '')
  )
  on conflict (id) do nothing;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- washer stats ---
create or replace view public.washer_stats
with (security_invoker = off) as
select
  p.id                                          as washer_id,
  coalesce(round(avg(r.rating)::numeric, 2), 0) as avg_rating,
  count(r.id)                                   as review_count,
  (
    select count(*) from public.orders o
    where o.washer_id = p.id and o.status = 'delivered'
  )                                             as completed_orders
from public.profiles p
left join public.reviews r on r.washer_id = p.id
where p.role = 'washer'
group by p.id;

-- ----------------------------------------------------------- washer card ---
-- Backs the Uber-style visibility card (spec 3.1). Exposes FIRST NAME ONLY —
-- the web product's safety policy is that full names are never shared.
-- Rows are limited to washers the caller is actually entitled to see.
create or replace view public.washer_cards
with (security_invoker = off) as
select
  p.id                       as washer_id,
  p.first_name,
  p.avatar_url,
  s.avg_rating,
  s.review_count,
  s.completed_orders
from public.profiles p
join public.washer_stats s on s.washer_id = p.id
where p.role = 'washer'
  and (
    p.id = auth.uid()                       -- a washer may see their own card
    or public.is_admin()
    or exists (                             -- requester on an order with them
      select 1 from public.orders o
      where o.washer_id = p.id
        and o.requester_id = auth.uid()
    )
  );

revoke all on public.washer_stats from anon, authenticated;
grant select on public.washer_cards to authenticated;

-- ============================== enable RLS ================================
alter table public.buildings         enable row level security;
alter table public.profiles          enable row level security;
alter table public.push_tokens       enable row level security;
alter table public.orders            enable row level security;
alter table public.order_events      enable row level security;
alter table public.messages          enable row level security;
alter table public.notifications     enable row level security;
alter table public.message_templates enable row level security;
alter table public.reviews           enable row level security;
alter table public.promo_codes       enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.payouts           enable row level security;
alter table public.disputes          enable row level security;

-- ------------------------------------------------------------- buildings ---
drop policy if exists buildings_read on public.buildings;
create policy buildings_read on public.buildings
  for select to authenticated using (active or public.is_admin());

drop policy if exists buildings_admin_write on public.buildings;
create policy buildings_admin_write on public.buildings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------------- profiles ---
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_admin());

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------- push tokens ---
drop policy if exists push_tokens_own on public.push_tokens;
create policy push_tokens_own on public.push_tokens
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Disputes are inserted directly (policy-checked) but never edited by users.
revoke update, delete on public.disputes from authenticated, anon;

-- ---------------------------------------------------------------- orders ---
-- Requester: own orders. Washer: assigned orders, plus unclaimed pending
-- orders in their own building only.
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated using (
    requester_id = auth.uid()
    or washer_id = auth.uid()
    or public.is_admin()
    or (
      status = 'pending'
      and washer_id is null
      and public.current_role() = 'washer'
      and building_id = public.my_building_id()
    )
  );

-- No client INSERT or UPDATE on orders at all. If a requester could write to
-- this table directly they could set payment_status = 'paid' or total_cents = 0,
-- since RLS cannot restrict individual columns. Every mutation therefore goes
-- through a SECURITY DEFINER RPC that prices the order server-side:
--   create_order()          -- booking
--   accept_order()          -- washer claims it
--   advance_order_status()  -- pipeline stages
--   cancel_order()          -- cancellation + refund tier
-- Payment fields are writable only by service_role (the Stripe webhook).
revoke insert, update, delete on public.orders from authenticated, anon;

drop policy if exists orders_insert_own on public.orders;
drop policy if exists orders_update_requester on public.orders;

drop policy if exists orders_admin_write on public.orders;
create policy orders_admin_write on public.orders
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------- order events ---
drop policy if exists order_events_select on public.order_events;
create policy order_events_select on public.order_events
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  );

-- -------------------------------------------------------------- messages ---
-- Only the two participants of an active order. Chat opens once accepted.
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  );

drop policy if exists messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert to authenticated with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.washer_id is not null
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
        and o.status <> 'cancelled'
    )
  );

drop policy if exists messages_update_read on public.messages;
create policy messages_update_read on public.messages
  for update to authenticated using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  ) with check (true);

-- --------------------------------------------------------- notifications ---
drop policy if exists notifications_own on public.notifications;
create policy notifications_own on public.notifications
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists notifications_mark_read on public.notifications;
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------ message templates ---
drop policy if exists templates_read on public.message_templates;
create policy templates_read on public.message_templates
  for select to authenticated using (true);

drop policy if exists templates_admin_write on public.message_templates;
create policy templates_admin_write on public.message_templates
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- --------------------------------------------------------------- reviews ---
drop policy if exists reviews_select on public.reviews;
create policy reviews_select on public.reviews
  for select to authenticated using (
    requester_id = auth.uid() or washer_id = auth.uid() or public.is_admin()
  );

-- Reviews are written only through submit_review(), which verifies the caller
-- owns a delivered order with that washer.
revoke insert, update, delete on public.reviews from authenticated, anon;
drop policy if exists reviews_insert on public.reviews;

-- ----------------------------------------------------------- promo codes ---
-- Codes are validated server-side via validate_promo_code(); the table itself
-- is not browsable by users (prevents code enumeration).
drop policy if exists promo_admin on public.promo_codes;
create policy promo_admin on public.promo_codes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists promo_redemptions_own on public.promo_redemptions;
create policy promo_redemptions_own on public.promo_redemptions
  for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- --------------------------------------------------------------- payouts ---
drop policy if exists payouts_own on public.payouts;
create policy payouts_own on public.payouts
  for select to authenticated using (washer_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------------- disputes ---
drop policy if exists disputes_select on public.disputes;
create policy disputes_select on public.disputes
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  );

drop policy if exists disputes_insert on public.disputes;
create policy disputes_insert on public.disputes
  for insert to authenticated with check (
    opened_by = auth.uid()
    and exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  );

drop policy if exists disputes_admin_write on public.disputes;
create policy disputes_admin_write on public.disputes
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
