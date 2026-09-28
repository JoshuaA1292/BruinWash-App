-- ===========================================================================
-- Server-authoritative pricing + privilege guards.
--
-- Money is computed here and nowhere else. The TypeScript constants in
-- src/constants/pricing.ts mirror these numbers for display only; if the two
-- ever disagree, THIS FILE WINS and the client is wrong.
-- ===========================================================================

-- --------------------------------------------------------------- pricing ----
create table if not exists public.pricing_config (
  key         text primary key,
  cents       int  not null,
  description text
);
alter table public.pricing_config enable row level security;

drop policy if exists pricing_read on public.pricing_config;
create policy pricing_read on public.pricing_config for select to authenticated using (true);

insert into public.pricing_config (key, cents, description) values
  ('service_fee_standard', 999,  'Wash & Dry service fee, per load'),
  ('service_fee_full',    1499,  'Wash, Dry & Fold service fee, per load'),
  ('machine_cost',         250,  'Machine cost passed through, per load'),
  ('addon_detergent_pods',  50,  'Detergent pods, per load'),
  ('addon_gloves',          50,  'Gloves, flat'),
  ('processing_flat',       30,  'Stripe flat fee'),
  ('liability_cap',       2500,  'Maximum liability disclosed at booking')
on conflict (key) do nothing;

create or replace function public.price_cents(p_key text)
returns int language sql stable security definer set search_path = public
as $$ select cents from public.pricing_config where key = p_key $$;

-- Single source of truth for an order total. Returns every line item so the
-- checkout sheet can show an itemised breakdown that always matches the charge.
create or replace function public.price_order(
  p_tier       service_tier,
  p_loads      int default 1,
  p_pods       boolean default false,
  p_gloves     boolean default false,
  p_tip_cents  int default 0,
  p_promo_code text default null
)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  v_service    int;
  v_machine    int;
  v_addons     int := 0;
  v_base       int;
  v_promo      jsonb;
  v_discount   int := 0;
  v_subtotal   int;
  v_tip        int := greatest(coalesce(p_tip_cents, 0), 0);
  v_processing int;
  v_loads      int := greatest(coalesce(p_loads, 1), 1);
begin
  v_service := public.price_cents(
    case p_tier when 'full' then 'service_fee_full' else 'service_fee_standard' end) * v_loads;
  v_machine := public.price_cents('machine_cost') * v_loads;

  if coalesce(p_pods, false)   then v_addons := v_addons + public.price_cents('addon_detergent_pods') * v_loads; end if;
  if coalesce(p_gloves, false) then v_addons := v_addons + public.price_cents('addon_gloves'); end if;

  v_base := v_service + v_machine + v_addons;

  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    v_promo := public.validate_promo_code(p_promo_code, v_base, p_tier);
    if (v_promo ->> 'valid')::boolean then
      v_discount := (v_promo ->> 'discount_cents')::int;
    end if;
  end if;

  v_subtotal   := greatest(v_base - v_discount, 0);
  -- Stripe: 2.9% + $0.30, charged on what the card is actually run for.
  v_processing := round((v_subtotal + v_tip) * 0.029)::int + public.price_cents('processing_flat');

  return jsonb_build_object(
    'tier',                 p_tier,
    'loads',                v_loads,
    'service_fee_cents',    v_service,
    'machine_cost_cents',   v_machine,
    'addons_cents',         v_addons,
    'discount_cents',       v_discount,
    'promo_code',           case when v_discount > 0 then upper(btrim(p_promo_code)) else null end,
    'promo_valid',          coalesce((v_promo ->> 'valid')::boolean, null),
    'promo_message',        v_promo ->> 'message',
    'tip_cents',            v_tip,
    'subtotal_cents',       v_subtotal,
    'processing_fee_cents', v_processing,
    'total_cents',          v_subtotal + v_tip + v_processing,
    -- What the Schedule screen's CTA shows: service + machine, before tip.
    'cta_cents',            v_service + v_machine + v_addons,
    'liability_cap_cents',  public.price_cents('liability_cap')
  );
end $$;

-- ---------------------------------------------------------- create order ----
create or replace function public.create_order(
  p_building_id  uuid,
  p_floor        text,
  p_room_number  text,
  p_pickup_at    timestamptz,
  p_tier         service_tier,
  p_liability_ack boolean,
  p_loads        int default 1,
  p_pods         boolean default false,
  p_gloves       boolean default false,
  p_tip_cents    int default 0,
  p_promo_code   text default null,
  p_wash_cycle   text default 'Normal',
  p_wash_temp    text default 'Warm',
  p_dry_level    text default 'Medium',
  p_notes        text default null
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_price jsonb;
  v_order public.orders;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;
  -- Spec 2.3: the acknowledgement checkbox gates checkout.
  if coalesce(p_liability_ack, false) = false then
    raise exception 'You must acknowledge the liability and care-of-items terms to book.'
      using errcode = 'check_violation';
  end if;
  if p_pickup_at <= now() then
    raise exception 'Pickup time must be in the future.' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.buildings where id = p_building_id and active) then
    raise exception 'Please choose a valid building.' using errcode = 'foreign_key_violation';
  end if;
  if btrim(coalesce(p_floor, '')) = '' then
    raise exception 'Floor is required.' using errcode = 'check_violation';
  end if;

  v_price := public.price_order(p_tier, p_loads, p_pods, p_gloves, p_tip_cents, p_promo_code);

  insert into public.orders (
    requester_id, building_id, floor, room_number, pickup_at,
    tier, load_count, wash_cycle, wash_temp, dry_level, notes,
    add_detergent_pods, add_gloves,
    service_fee_cents, machine_cost_cents, addons_cents, tip_cents,
    discount_cents, processing_fee_cents, subtotal_cents, total_cents, promo_code,
    liability_ack, liability_ack_at, liability_cap_cents,
    status, payment_status
  ) values (
    auth.uid(), p_building_id, btrim(p_floor), nullif(btrim(coalesce(p_room_number,'')), ''),
    p_pickup_at,
    p_tier, greatest(coalesce(p_loads,1),1), p_wash_cycle, p_wash_temp, p_dry_level,
    nullif(btrim(coalesce(p_notes,'')), ''),
    coalesce(p_pods,false), coalesce(p_gloves,false),
    (v_price->>'service_fee_cents')::int,
    (v_price->>'machine_cost_cents')::int,
    (v_price->>'addons_cents')::int,
    (v_price->>'tip_cents')::int,
    (v_price->>'discount_cents')::int,
    (v_price->>'processing_fee_cents')::int,
    (v_price->>'subtotal_cents')::int,
    (v_price->>'total_cents')::int,
    v_price->>'promo_code',
    true, now(), (v_price->>'liability_cap_cents')::int,
    'pending', 'unpaid'
  )
  returning * into v_order;

  if v_order.promo_code is not null then
    insert into public.promo_redemptions (code, user_id, order_id)
    values (v_order.promo_code, auth.uid(), v_order.id)
    on conflict do nothing;

    update public.promo_codes
       set redemption_count = redemption_count + 1
     where code = v_order.promo_code;
  end if;

  return v_order;
end $$;

-- ------------------------------------------------------- privilege guard ----
-- profiles_update_self cannot restrict columns, so without this a user could
-- PATCH their own row to role='admin' or attach someone else's Stripe account.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- service_role and admins are allowed through.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'You cannot change your own account role.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.stripe_account_id  is distinct from old.stripe_account_id
  or new.stripe_customer_id is distinct from old.stripe_customer_id
  or new.stripe_onboarding_done is distinct from old.stripe_onboarding_done then
    raise exception 'Payment account fields are managed by the server.'
      using errcode = 'insufficient_privilege';
  end if;
  if new.edu_email is distinct from old.edu_email then
    raise exception 'Your verified .edu email cannot be changed here.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_privileges();

grant execute on function
  public.price_order(service_tier, int, boolean, boolean, int, text),
  public.create_order(uuid, text, text, timestamptz, service_tier, boolean, int,
                      boolean, boolean, int, text, text, text, text, text)
to authenticated;

revoke all on function public.price_cents(text) from anon, authenticated;
