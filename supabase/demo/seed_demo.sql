-- ===========================================================================
-- LOCAL DEMO DATA — NEVER APPLY THIS TO PRODUCTION.
--
-- Deliberately NOT in supabase/migrations/, so `supabase db push` can never
-- pick it up. It creates test accounts with known passwords and makes orders
-- auto-pay so the full pipeline can be exercised without Stripe keys.
--
-- Apply with: ./supabase/demo/reset_demo.sh
-- ===========================================================================

-- --------------------------------------------------------------- accounts ---
-- Four confirmed .edu accounts, all password: demo1234
-- handle_new_user() fires on insert and creates the matching profile row, so the
-- .edu gate and the role-from-metadata path are both genuinely exercised here.
do $$
declare
  v_pw text := crypt('demo1234', gen_salt('bf'));
begin
  -- The empty-string token columns are load-bearing. GoTrue scans them into
  -- non-nullable Go strings, so leaving them NULL makes every sign-in fail with
  -- "Database error querying schema".
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  )
  values
    ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'demo.requester@ucla.edu', v_pw, now(),
     '{"provider":"email","providers":["email"]}',
     '{"role":"requester","first_name":"Alex","last_name":"Rivera"}', now(), now(),
     '', '', '', '', '', '', '', ''),

    ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'demo.washer@ucla.edu', v_pw, now(),
     '{"provider":"email","providers":["email"]}',
     '{"role":"washer","first_name":"Jordan","last_name":"Kim"}', now(), now(),
     '', '', '', '', '', '', '', ''),

    ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'demo.washer2@ucla.edu', v_pw, now(),
     '{"provider":"email","providers":["email"]}',
     '{"role":"washer","first_name":"Riley","last_name":"Chen"}', now(), now(),
     '', '', '', '', '', '', '', ''),

    ('aaaaaaaa-0000-4000-8000-000000000004', '00000000-0000-0000-0000-000000000000',
     'authenticated', 'authenticated', 'demo.admin@ucla.edu', v_pw, now(),
     '{"provider":"email","providers":["email"]}',
     '{"role":"admin","first_name":"Sam","last_name":"Admin"}', now(), now(),
     '', '', '', '', '', '', '', '')
  on conflict (id) do nothing;
end $$;

-- Identities, so GoTrue treats these as real email/password users.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
)
select
  gen_random_uuid(), u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where u.email like 'demo.%@ucla.edu'
  and not exists (
    select 1 from auth.identities i where i.user_id = u.id and i.provider = 'email'
  );

-- --------------------------------------------------------------- profiles ---
-- Everyone in Dykstra so same-building matching lines up. The tour flag is left
-- FALSE on purpose: signing in shows the onboarding carousel first.
update public.profiles p
   set building_id  = (select id from public.buildings where slug = 'dykstra'),
       floor        = '3',
       room_number  = case when p.role = 'requester' then '312' else null end,
       onboarding_tour_done = false,
       is_female    = case when p.id = 'aaaaaaaa-0000-4000-8000-000000000003' then true else null end,
       stripe_onboarding_done = (p.role = 'washer')
 where p.id in (
   'aaaaaaaa-0000-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000002',
   'aaaaaaaa-0000-4000-8000-000000000003',
   'aaaaaaaa-0000-4000-8000-000000000004'
 );

-- ------------------------------------------------------------ promo code ---
insert into public.promo_codes (code, kind, value, max_redemptions, per_user_limit)
values ('DEMO20', 'percent', 20, 500, 99)
on conflict (code) do update set active = true, per_user_limit = 99;

-- --------------------------------------------------- DEMO AUTOPAY (local) ---
-- Without Stripe keys, checkout creates the order but never funds it — and an
-- unpaid order is correctly invisible to washers, which would dead-end the demo.
--
-- This trigger stands in for the Stripe webhook: it marks a new order paid, which
-- is the single transition that fires the real "Order placed" fan-out. Everything
-- downstream (notifications, same-building matching, the pipeline) then behaves
-- exactly as it would in production.
--
-- It exists ONLY in this file. Production is driven by stripe-webhook.
create or replace function public.demo_autopay()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(public.cfg('demo_autopay'), 'off') <> 'on' then
    return new;
  end if;

  update public.orders
     set payment_status = 'paid',
         stripe_payment_intent_id = 'pi_demo_' || replace(new.id::text, '-', '')
   where id = new.id;

  return new;
end $$;

drop trigger if exists orders_demo_autopay on public.orders;
create trigger orders_demo_autopay
  after insert on public.orders
  for each row execute function public.demo_autopay();

revoke all on function public.demo_autopay() from public, anon, authenticated;

insert into public.app_config (key, value) values ('demo_autopay', 'on')
on conflict (key) do update set value = 'on';

-- A couple of pre-seeded orders so the requester's Orders tab and the admin
-- dashboard are not empty on first look.
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  v_req uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  v_wash uuid := 'aaaaaaaa-0000-4000-8000-000000000002';
  v_id uuid;
begin
  -- A delivered order, already reviewed, so the washer card shows a real rating.
  insert into public.orders (
    requester_id, washer_id, building_id, floor, room_number, pickup_at, tier,
    service_fee_cents, machine_cost_cents, subtotal_cents, total_cents,
    liability_ack, liability_ack_at, payment_status, status,
    accepted_at, picked_up_at, washing_at, out_for_delivery_at, delivered_at,
    delivery_photo_path
  ) values (
    v_req, v_wash, v_b, '3', '312', now() - interval '3 days', 'full',
    1499, 250, 1749, 1830, true, now() - interval '3 days', 'paid', 'delivered',
    now() - interval '3 days', now() - interval '3 days', now() - interval '3 days',
    now() - interval '3 days', now() - interval '3 days', null
  )
  returning id into v_id;

  insert into public.reviews (order_id, requester_id, washer_id, rating, comment)
  values (v_id, v_req, v_wash, 5, 'Folded better than I ever do. Fast too.')
  on conflict (order_id) do nothing;

  insert into public.payouts (washer_id, order_id, amount_cents)
  values (v_wash, v_id, round(1499 * 0.70)::int + 250);

  -- A second delivered order so the completed-order count is not 1.
  insert into public.orders (
    requester_id, washer_id, building_id, floor, pickup_at, tier,
    service_fee_cents, machine_cost_cents, subtotal_cents, total_cents,
    liability_ack, liability_ack_at, payment_status, status, delivered_at
  ) values (
    v_req, v_wash, v_b, '3', now() - interval '9 days', 'standard',
    999, 250, 1249, 1320, true, now() - interval '9 days', 'paid', 'delivered',
    now() - interval '9 days'
  );
end $$;

select
  (select count(*) from auth.users where email like 'demo.%')      as demo_accounts,
  (select count(*) from public.buildings)                          as buildings,
  (select count(*) from public.orders)                             as orders,
  (select count(*) from public.message_templates)                  as templates,
  (select value from public.app_config where key = 'demo_autopay') as autopay;
