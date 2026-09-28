-- ===========================================================================
-- Security hardening. Every change here closes a defect found by adversarial
-- review and is covered by a new assertion in supabase/tests/10_policy_tests.sql.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. CRITICAL: SECURITY DEFINER helpers were reachable by every signed-in user.
--
-- `revoke ... from anon, authenticated` does NOT remove the implicit EXECUTE
-- grant Postgres gives to PUBLIC on every new function. So the earlier revokes
-- on cfg() and price_cents() were no-ops, and cfg('service_role_key') was
-- callable over PostgREST by any student -- handing out a key that bypasses all
-- RLS. enqueue_notification() and kick_push_dispatch() were likewise callable,
-- letting anyone forge a system notification into another user's feed.
--
-- Fix: deny by default, then grant back only the RPCs the client is meant to
-- call. Trigger functions need no EXECUTE grant; the trigger machinery runs them.
-- ---------------------------------------------------------------------------
revoke all on all functions in schema public from public, anon, authenticated;

-- Helpers used INSIDE RLS policy expressions must stay executable: policies are
-- evaluated as the querying role. Each reveals only the caller's own attributes.
grant execute on function
  public.is_admin(),
  public.current_role(),
  public.my_building_id()
to authenticated;

-- The client-facing RPC surface, and nothing else.
grant execute on function
  public.accept_order(uuid),
  public.set_washer_en_route(uuid),
  public.advance_order_status(uuid, order_status, text),
  public.cancel_order(uuid, text),
  public.validate_promo_code(text, int, service_tier),
  public.submit_review(uuid, int, text),
  public.register_push_token(text, text, text),
  public.my_earnings(),
  public.price_order(service_tier, int, boolean, boolean, int, text),
  public.create_order(uuid, text, text, timestamptz, service_tier, boolean, int,
                      boolean, boolean, int, text, text, text, text, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- 2. HIGH: either chat participant could rewrite the other's messages.
--
-- messages_update_read had `with check (true)`, and RLS cannot restrict columns,
-- so a washer could UPDATE the body of a message the requester sent and leave
-- sender_id pointing at them. Column-level grants are the only real fix.
-- ---------------------------------------------------------------------------
revoke update on public.messages from authenticated, anon;
grant update (read_at) on public.messages to authenticated;

drop policy if exists messages_update_read on public.messages;
create policy messages_mark_read on public.messages
  for update to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
    )
  )
  with check (
    -- You mark the OTHER party's message as read, never your own.
    sender_id <> auth.uid()
  );

-- ---------------------------------------------------------------------------
-- 3. HIGH: washers could read requester room numbers and notes on orders they
--          had not accepted -- and could see unpaid orders at all.
--
-- orders_select served the whole row to any washer in the building for any
-- pending order. The job feed only needs logistics and money, so serve it from a
-- narrow view and drop the broad branch. A washer still gets the full row for
-- orders actually assigned to them, which is where floor/room are needed.
-- ---------------------------------------------------------------------------
drop policy if exists orders_select on public.orders;
create policy orders_select on public.orders
  for select to authenticated using (
    requester_id = auth.uid()
    or washer_id = auth.uid()
    or public.is_admin()
  );

-- The washer job board. No requester_id, no room_number, no notes.
create or replace view public.available_orders
with (security_invoker = off) as
select
  o.id,
  o.building_id,
  b.name              as building_name,
  o.floor,
  o.pickup_at,
  o.tier,
  o.load_count,
  o.add_detergent_pods,
  o.add_gloves,
  o.wash_cycle,
  o.wash_temp,
  o.dry_level,
  o.service_fee_cents,
  o.machine_cost_cents,
  o.tip_cents,
  o.created_at
from public.orders o
join public.buildings b on b.id = o.building_id
where o.status = 'pending'
  and o.washer_id is null
  -- Unpaid orders must never reach the job board: accept_order() rejects them,
  -- so showing them guarantees the washer taps Accept and gets an error.
  and o.payment_status = 'paid'
  and o.requester_id <> auth.uid()
  and public.current_role() = 'washer'
  and o.building_id = public.my_building_id();

grant select on public.available_orders to authenticated;

-- ---------------------------------------------------------------------------
-- 4. MEDIUM: any authenticated user could read any avatar.
--
-- avatars_read was `bucket_id = 'avatars'` with no scoping, so a washer could
-- list the requester's folder and pull their photo -- exactly the identity leak
-- washer_cards exists to prevent in the other direction.
-- ---------------------------------------------------------------------------
drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated using (
    bucket_id = 'avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text   -- your own
      or public.is_admin()
      -- A requester may see the avatar of a washer on one of their orders. This
      -- is the same entitlement washer_cards grants, and it is one-way.
      or exists (
        select 1 from public.orders o
        where o.washer_id::text = (storage.foldername(name))[1]
          and o.requester_id = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. MEDIUM: delivery photo proof was unverifiable.
--
-- advance_order_status only checked that p_photo_path was non-null, so a washer
-- could pass 'x', close the delivery and trigger their own payout with no photo
-- -- or point at another order's photo. Validate that the path belongs to this
-- order and that the object actually exists.
-- ---------------------------------------------------------------------------
create or replace function public.advance_order_status(
  p_order_id   uuid,
  p_to         order_status,
  p_photo_path text default null
)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order public.orders;
  v_from  order_status;
  v_path  text;
  v_ok    boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.washer_id is distinct from auth.uid() and not public.is_admin() then
    raise exception 'Not your order.' using errcode = 'insufficient_privilege';
  end if;

  v_from := v_order.status;

  v_ok := (v_from, p_to) in (
    ('accepted',         'picked_up'),
    ('picked_up',        'washing'),
    ('washing',          'out_for_delivery'),
    ('out_for_delivery', 'delivered')
  );
  if not v_ok then
    raise exception 'Cannot move an order from % to %.', v_from, p_to
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- A photo path is only meaningful on the delivery transition.
  if p_photo_path is not null and p_to <> 'delivered' then
    raise exception 'A delivery photo only applies when marking an order delivered.'
      using errcode = 'check_violation';
  end if;

  if p_to = 'delivered' then
    v_path := coalesce(p_photo_path, v_order.delivery_photo_path);

    if v_path is null then
      raise exception 'A delivery photo is required to mark this order delivered.'
        using errcode = 'check_violation';
    end if;

    -- The storage policy keys off the first path segment being the order id;
    -- enforce the same rule here so a washer cannot claim someone else's photo.
    if split_part(v_path, '/', 1) <> p_order_id::text then
      raise exception 'That delivery photo does not belong to this order.'
        using errcode = 'check_violation';
    end if;

    -- ...and prove the object is really there, so 'anything' is not a proof.
    if not exists (
      select 1 from storage.objects
      where bucket_id = 'delivery-proof' and name = v_path
    ) then
      raise exception 'The delivery photo upload did not complete. Please try again.'
        using errcode = 'no_data_found';
    end if;
  end if;

  update public.orders
     set status              = p_to,
         delivery_photo_path = coalesce(v_path, delivery_photo_path),
         picked_up_at        = case when p_to = 'picked_up'        then now() else picked_up_at end,
         washing_at          = case when p_to = 'washing'          then now() else washing_at end,
         out_for_delivery_at = case when p_to = 'out_for_delivery' then now() else out_for_delivery_at end,
         delivered_at        = case when p_to = 'delivered'        then now() else delivered_at end
   where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_from, p_to, auth.uid());

  if p_to = 'delivered' then
    insert into public.payouts (washer_id, order_id, amount_cents)
    values (
      v_order.washer_id,
      v_order.id,
      round(v_order.service_fee_cents * 0.70)::int
        + v_order.machine_cost_cents
        + v_order.tip_cents
    )
    on conflict do nothing;
  end if;

  return v_order;
end $$;

grant execute on function public.advance_order_status(uuid, order_status, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. HIGH: cancellation promised a refund that nothing ever issued.
--
-- cancel_order wrote orders.refund_cents and the UI told the user "Refunds land
-- back on your original payment method", but no Stripe refund was ever created.
-- It also computed a refund for orders that were never charged.
--
-- Fix: a refunds queue, drained by the process-refund Edge Function exactly the
-- way dispatch-push drains notifications. Nothing claims money moved until
-- Stripe says so.
-- ---------------------------------------------------------------------------
create table if not exists public.refunds (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null unique references public.orders(id) on delete cascade,
  amount_cents     int not null check (amount_cents > 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'processing', 'succeeded', 'failed')),
  stripe_refund_id text,
  error            text,
  created_at       timestamptz not null default now(),
  processed_at     timestamptz
);

alter table public.refunds enable row level security;

drop policy if exists refunds_participants_read on public.refunds;
create policy refunds_participants_read on public.refunds
  for select to authenticated using (
    public.is_admin()
    or exists (
      select 1 from public.orders o
      where o.id = order_id and o.requester_id = auth.uid()
    )
  );

-- Written only by cancel_order and the Edge Function (service role).
revoke insert, update, delete on public.refunds from authenticated, anon;

create index if not exists refunds_pending_idx on public.refunds (status)
  where status in ('pending', 'processing');

create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order  public.orders;
  v_from   order_status;
  v_hours  numeric;
  v_refund int;
  v_paid   boolean;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.requester_id <> auth.uid()
     and v_order.washer_id is distinct from auth.uid()
     and not public.is_admin() then
    raise exception 'Not your order.' using errcode = 'insufficient_privilege';
  end if;
  if v_order.status in ('delivered', 'cancelled') then
    raise exception 'This order can no longer be cancelled.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_from  := v_order.status;
  v_hours := extract(epoch from (v_order.pickup_at - now())) / 3600.0;
  -- Only a charge that actually settled can be refunded. An order abandoned at
  -- the payment sheet was never charged, so it gets no refund line at all.
  v_paid  := v_order.payment_status in ('paid', 'partially_refunded');

  v_refund := case
    when not v_paid then 0
    -- A washer or admin cancelling is never the requester's fault.
    when v_order.washer_id = auth.uid() or public.is_admin() then v_order.total_cents
    -- The TIME tier dominates for any pre-pickup status. Previously an accepted
    -- order was charged the 50% fee even when pickup was days away, which
    -- contradicted the policy text shown in the cancellation dialog.
    when v_from in ('pending', 'accepted') and v_hours > 2 then v_order.total_cents
    when v_from in ('pending', 'accepted') then round(v_order.total_cents * 0.5)::int
    when v_from = 'picked_up'              then round(v_order.total_cents * 0.5)::int
    else 0  -- washing has begun
  end;

  update public.orders
     set status              = 'cancelled',
         cancelled_at        = now(),
         cancelled_by        = auth.uid(),
         cancellation_reason = p_reason,
         refund_cents        = v_refund
   where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_id, note)
  values (p_order_id, v_from, 'cancelled', auth.uid(), p_reason);

  -- Queue the actual money movement. process-refund turns this into a Stripe
  -- refund; the webhook's charge.refunded branch settles payment_status.
  if v_refund > 0 and v_order.stripe_payment_intent_id is not null then
    insert into public.refunds (order_id, amount_cents)
    values (p_order_id, v_refund)
    on conflict (order_id) do nothing;

    perform public.kick_refund_dispatch();
  end if;

  return v_order;
end $$;

grant execute on function public.cancel_order(uuid, text) to authenticated;

create or replace function public.kick_refund_dispatch()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text := public.cfg('functions_base_url');
  v_key text := public.cfg('service_role_key');
begin
  if v_url is null or v_key is null then return; end if;

  perform net.http_post(
    url     := v_url || '/process-refund',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'refund dispatch kick failed: %', sqlerrm;
end $$;

revoke all on function public.kick_refund_dispatch() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. MEDIUM: a promo code was burned by an order that was never paid.
--
-- create_order recorded the redemption immediately, so abandoning the payment
-- sheet consumed a single-use code forever. Record it on the unpaid -> paid
-- transition instead.
-- ---------------------------------------------------------------------------
create or replace function public.record_promo_redemption()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.promo_code is null then return new; end if;
  if not (tg_op = 'INSERT' and new.payment_status = 'paid')
     and not (tg_op = 'UPDATE' and old.payment_status <> 'paid' and new.payment_status = 'paid') then
    return new;
  end if;

  insert into public.promo_redemptions (code, user_id, order_id)
  values (new.promo_code, new.requester_id, new.id)
  on conflict (code, order_id) do nothing;

  if found then
    update public.promo_codes
       set redemption_count = redemption_count + 1
     where code = new.promo_code;
  end if;

  return new;
end $$;

drop trigger if exists orders_record_promo on public.orders;
create trigger orders_record_promo
  after insert or update of payment_status on public.orders
  for each row execute function public.record_promo_redemption();

-- ---------------------------------------------------------------------------
-- 8. MEDIUM: a large discount could pay the washer out of the platform's pocket
--            and push the charge under Stripe's 50-cent minimum.
--
-- The discount was capped at the whole base, machine cost included. A $17.49
-- fixed-value code on a $17.49 order left a 30-cent total: Stripe rejects that,
-- so the order could never be paid, while the washer payout still included the
-- full machine-cost reimbursement.
--
-- Fix: a discount may only ever consume the platform's own margin -- the service
-- fee and add-ons. Machine cost is money the washer physically spends, so it is
-- never discountable. That also keeps every total comfortably above Stripe's
-- minimum.
-- ---------------------------------------------------------------------------
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
  v_cap        int;
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
  -- A promo may consume the platform's margin only, never the machine cost.
  v_cap  := v_service + v_addons;

  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    v_promo := public.validate_promo_code(p_promo_code, v_base, p_tier);
    if (v_promo ->> 'valid')::boolean then
      v_discount := least((v_promo ->> 'discount_cents')::int, v_cap);
    end if;
  end if;

  v_subtotal   := greatest(v_base - v_discount, 0);
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
    'cta_cents',            v_service + v_machine + v_addons,
    'liability_cap_cents',  public.price_cents('liability_cap')
  );
end $$;

grant execute on function
  public.price_order(service_tier, int, boolean, boolean, int, text) to authenticated;

-- create_order no longer records the redemption; the trigger above does it when
-- the order is actually paid for.
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

  -- Stripe rejects a charge below 50 cents; never create an order that cannot
  -- be funded. The discount cap in price_order() makes this unreachable today,
  -- but it is the invariant that matters, so assert it rather than assume it.
  if (v_price->>'total_cents')::int < 50 then
    raise exception 'That order total is too low to charge. Please contact support.'
      using errcode = 'check_violation';
  end if;

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

  return v_order;
end $$;

grant execute on function
  public.create_order(uuid, text, text, timestamptz, service_tier, boolean, int,
                      boolean, boolean, int, text, text, text, text, text) to authenticated;
