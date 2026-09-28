-- ===========================================================================
-- Server-side RPCs. Anything that must be atomic, or that a client must not be
-- trusted to compute, lives here rather than in the app.
-- ===========================================================================

-- --------------------------------------------------------------- config ----
-- Private config used by triggers to reach Edge Functions via pg_net.
-- Operator seeds this once; it is never readable by app users.
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
alter table public.app_config enable row level security;
-- no policies == no access for anon/authenticated. Only service_role bypasses.

create or replace function public.cfg(p_key text)
returns text language sql stable security definer set search_path = public
as $$ select value from public.app_config where key = p_key $$;
revoke all on function public.cfg(text) from anon, authenticated;

-- ------------------------------------------------------- accept an order ----
-- Race-safe: two washers tapping "Accept" at the same moment cannot both win.
-- The row lock serialises them and the loser gets a clear error.
create or replace function public.accept_order(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order   public.orders;
  v_washer  public.profiles;
begin
  select * into v_washer from public.profiles where id = auth.uid();
  if v_washer is null then
    raise exception 'Profile not found.' using errcode = 'no_data_found';
  end if;
  if v_washer.role <> 'washer' then
    raise exception 'Only washers can accept orders.' using errcode = 'insufficient_privilege';
  end if;

  -- Serialise concurrent acceptances on this order.
  select * into v_order from public.orders where id = p_order_id for update;

  if v_order is null then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'pending' or v_order.washer_id is not null then
    raise exception 'This order has already been accepted by another washer.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_order.building_id is distinct from v_washer.building_id then
    raise exception 'You can only accept orders in your own building.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_order.requester_id = auth.uid() then
    raise exception 'You cannot accept your own order.' using errcode = 'check_violation';
  end if;
  if v_order.payment_status <> 'paid' then
    raise exception 'This order is not paid yet.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Honour the female-washer-only preference from the safety policy.
  if exists (
    select 1 from public.profiles rp
    where rp.id = v_order.requester_id and rp.female_washers_only
  ) and coalesce(v_washer.is_female, false) = false then
    raise exception 'This requester has asked for female washers only.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.orders
     set washer_id = auth.uid(), status = 'accepted', accepted_at = now()
   where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, 'pending', 'accepted', auth.uid());

  return v_order;
end $$;

-- ------------------------------------------------ washer is on the way -----
-- Backs the "Washer on the way" automated message. Not a pipeline stage.
create or replace function public.set_washer_en_route(p_order_id uuid)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order is null then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.washer_id <> auth.uid() and not public.is_admin() then
    raise exception 'Not your order.' using errcode = 'insufficient_privilege';
  end if;
  if v_order.status <> 'accepted' then
    raise exception 'You can only go en route on an accepted order.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  update public.orders set en_route_at = now()
   where id = p_order_id and en_route_at is null
  returning * into v_order;

  return coalesce(v_order, (select o from public.orders o where o.id = p_order_id));
end $$;

-- ------------------------------------------------------ advance a stage ----
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

  -- Only forward, one stage at a time.
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

  -- Photo proof is mandatory to close out a delivery.
  if p_to = 'delivered'
     and coalesce(p_photo_path, v_order.delivery_photo_path) is null then
    raise exception 'A delivery photo is required to mark this order delivered.'
      using errcode = 'check_violation';
  end if;

  update public.orders
     set status              = p_to,
         delivery_photo_path = coalesce(p_photo_path, delivery_photo_path),
         picked_up_at        = case when p_to = 'picked_up'        then now() else picked_up_at end,
         washing_at          = case when p_to = 'washing'          then now() else washing_at end,
         out_for_delivery_at = case when p_to = 'out_for_delivery' then now() else out_for_delivery_at end,
         delivered_at        = case when p_to = 'delivered'        then now() else delivered_at end
   where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_id)
  values (p_order_id, v_from, p_to, auth.uid());

  -- Credit the washer's balance on completion. Payout = everything the washer
  -- earns: their share of the service fee, machine cost coverage, and full tip.
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

-- ---------------------------------------------------------- cancellation ----
-- Refund tiers come straight from the live Terms of Service, section 11.
create or replace function public.cancel_order(p_order_id uuid, p_reason text default null)
returns public.orders
language plpgsql security definer set search_path = public
as $$
declare
  v_order  public.orders;
  v_from   order_status;
  v_hours  numeric;
  v_refund int;
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
    raise exception 'This order can no longer be cancelled.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  v_from  := v_order.status;
  v_hours := extract(epoch from (v_order.pickup_at - now())) / 3600.0;

  v_refund := case
    -- A washer or admin cancelling is never the requester's fault: refund in full.
    when v_order.washer_id = auth.uid() or public.is_admin() then v_order.total_cents
    when v_from = 'pending' and v_hours > 2 then v_order.total_cents
    when v_from in ('pending', 'accepted')  then round(v_order.total_cents * 0.5)::int
    when v_from = 'picked_up'               then round(v_order.total_cents * 0.5)::int
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

  return v_order;
end $$;

-- ----------------------------------------------------------- promo codes ----
-- Returns a verdict rather than exposing the promo_codes table to clients.
create or replace function public.validate_promo_code(
  p_code            text,
  p_subtotal_cents  int,
  p_tier            service_tier
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v    public.promo_codes;
  v_used int;
  v_disc int;
  v_bad  jsonb := jsonb_build_object(
    'valid', false, 'discount_cents', 0,
    'message', 'Invalid or ineligible promo code.'
  );
begin
  if p_code is null or btrim(p_code) = '' then return v_bad; end if;

  select * into v from public.promo_codes where code = upper(btrim(p_code));
  if v is null or not v.active then return v_bad; end if;
  if now() < v.valid_from then return v_bad; end if;
  if v.valid_until is not null and now() > v.valid_until then return v_bad; end if;
  if v.max_redemptions is not null and v.redemption_count >= v.max_redemptions then return v_bad; end if;
  if v.applies_to_tier is not null and v.applies_to_tier <> p_tier then return v_bad; end if;
  if p_subtotal_cents < v.min_subtotal_cents then return v_bad; end if;

  select count(*) into v_used
    from public.promo_redemptions
   where code = v.code and user_id = auth.uid();
  if v_used >= v.per_user_limit then return v_bad; end if;

  v_disc := case
    when v.kind = 'percent' then round(p_subtotal_cents * (v.value / 100.0))::int
    else v.value
  end;
  v_disc := least(v_disc, p_subtotal_cents);

  return jsonb_build_object(
    'valid', true,
    'code', v.code,
    'discount_cents', v_disc,
    'message', 'Promo code applied.'
  );
end $$;

-- -------------------------------------------------------------- reviews ----
create or replace function public.submit_review(
  p_order_id uuid,
  p_rating   int,
  p_comment  text default null
)
returns public.reviews
language plpgsql security definer set search_path = public
as $$
declare
  v_order  public.orders;
  v_review public.reviews;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order is null or v_order.requester_id <> auth.uid() then
    raise exception 'Order not found.' using errcode = 'no_data_found';
  end if;
  if v_order.status <> 'delivered' then
    raise exception 'You can only review a delivered order.' using errcode = 'object_not_in_prerequisite_state';
  end if;
  if v_order.washer_id is null then
    raise exception 'This order has no washer to review.' using errcode = 'object_not_in_prerequisite_state';
  end if;

  insert into public.reviews (order_id, requester_id, washer_id, rating, comment)
  values (p_order_id, auth.uid(), v_order.washer_id, p_rating, nullif(btrim(p_comment), ''))
  on conflict (order_id) do update
    set rating = excluded.rating, comment = excluded.comment
  returning * into v_review;

  return v_review;
end $$;

-- ---------------------------------------------------------- push tokens ----
create or replace function public.register_push_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.push_tokens (user_id, token, platform, device_name)
  values (auth.uid(), p_token, p_platform, p_device_name)
  on conflict (token) do update
    set user_id = auth.uid(), platform = excluded.platform,
        device_name = excluded.device_name, updated_at = now();
end $$;

-- ------------------------------------------------------- washer earnings ----
create or replace function public.my_earnings()
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'pending_cents',   coalesce(sum(amount_cents) filter (where status in ('pending','in_transit')), 0),
    'paid_cents',      coalesce(sum(amount_cents) filter (where status = 'paid'), 0),
    'lifetime_cents',  coalesce(sum(amount_cents) filter (where status <> 'failed'), 0),
    'order_count',     count(*) filter (where status <> 'failed')
  )
  from public.payouts where washer_id = auth.uid();
$$;

grant execute on function
  public.accept_order(uuid),
  public.set_washer_en_route(uuid),
  public.advance_order_status(uuid, order_status, text),
  public.cancel_order(uuid, text),
  public.validate_promo_code(text, int, service_tier),
  public.submit_review(uuid, int, text),
  public.register_push_token(text, text, text),
  public.my_earnings()
to authenticated;
