-- ===========================================================================
-- Automated messaging (spec 3.2).
--
-- Design: one AFTER trigger on public.orders is the single source of truth.
-- Status changes fan out into public.notifications rows (the in-app feed) and
-- then a single pg_net call asks the `dispatch-push` Edge Function to deliver
-- the unsent ones. No cron, no polling.
--
-- Automated copy NEVER lands in public.messages -- that table is the manual
-- requester <-> washer chat only.
-- ===========================================================================

-- ------------------------------------------------------ template rendering ---
-- Replaces {{placeholders}} in template copy with values from a jsonb bag.
create or replace function public.render_template(p_body text, p_vars jsonb)
returns text
language plpgsql immutable
as $$
declare
  v_out text := coalesce(p_body, '');
  k     text;
  v     text;
begin
  for k, v in select key, coalesce(value, '') from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_out := replace(v_out, '{{' || k || '}}', v);
  end loop;
  return v_out;
end $$;

-- --------------------------------------------------------- enqueue helper ---
-- Honours per-user notification preferences before writing a row.
create or replace function public.enqueue_notification(
  p_user_id  uuid,
  p_order_id uuid,
  p_key      text,
  p_vars     jsonb,
  p_pref     text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  t public.message_templates;
begin
  if p_user_id is null then return; end if;

  select * into t from public.message_templates where key = p_key and enabled;
  if t is null then return; end if;

  -- Respect the user's notification settings when a preference key is given.
  if p_pref is not null and exists (
    select 1 from public.profiles
    where id = p_user_id
      and coalesce((notification_prefs ->> p_pref)::boolean, true) = false
  ) then
    return;
  end if;

  insert into public.notifications (user_id, order_id, template_key, title, body, data)
  values (
    p_user_id,
    p_order_id,
    p_key,
    public.render_template(t.title, p_vars),
    public.render_template(t.body,  p_vars),
    coalesce(p_vars, '{}'::jsonb) || jsonb_build_object('channels', to_jsonb(t.channels))
  );
end $$;

-- ------------------------------------------------------------ push kicker ---
-- Fire-and-forget nudge to the Edge Function. Failure here must never roll back
-- the order transaction, so everything is wrapped.
create or replace function public.kick_push_dispatch()
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_url text := public.cfg('functions_base_url');
  v_key text := public.cfg('service_role_key');
begin
  if v_url is null or v_key is null then
    return;   -- not configured yet (e.g. local dev); in-app feed still works
  end if;

  perform net.http_post(
    url     := v_url || '/dispatch-push',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
exception when others then
  raise warning 'push dispatch kick failed: %', sqlerrm;
end $$;

-- ================================ the trigger ==============================
create or replace function public.on_order_change_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_vars        jsonb;
  v_washer_name text;
  v_building    text;
  v_tier        text;
  v_pickup      text;
  v_admin       uuid;
  v_w           uuid;
  v_placed      boolean := false;
begin
  select name into v_building from public.buildings where id = new.building_id;

  v_tier := case new.tier when 'full' then 'Wash, Dry & Fold' else 'Wash & Dry' end;

  -- Rendered in Pacific time: every campus served is on the west coast.
  v_pickup := to_char(new.pickup_at at time zone 'America/Los_Angeles',
                      'FMDay, FMMon FMDD at FMHH12:MI AM');

  select first_name into v_washer_name
    from public.profiles where id = new.washer_id;

  v_vars := jsonb_build_object(
    'order_id',       new.id::text,
    'building',       coalesce(v_building, 'your building'),
    'tier',           v_tier,
    'scheduled_time', v_pickup,
    'time',           v_pickup,
    'washer_name',    coalesce(v_washer_name, 'Your washer'),
    'total',          to_char(new.total_cents / 100.0, 'FM999990.00')
  );

  -- ---------------------------------------------------------- order placed --
  -- Fires once the order is actually paid for, so washers are never offered an
  -- order that may never be funded.
  if tg_op = 'INSERT' then
    v_placed := (new.payment_status = 'paid');
  else
    v_placed := (old.payment_status <> 'paid' and new.payment_status = 'paid');
  end if;

  if v_placed then
    perform public.enqueue_notification(
      new.requester_id, new.id, 'order_placed_requester', v_vars, 'order_updates');

    -- Same-building matching: only washers in this building are alerted.
    for v_w in
      select p.id from public.profiles p
       where p.role = 'washer'
         and p.building_id = new.building_id
         and p.id <> new.requester_id
    loop
      perform public.enqueue_notification(
        v_w, new.id, 'order_placed_washer', v_vars, 'new_orders');
    end loop;

    for v_admin in select id from public.profiles where role = 'admin' loop
      perform public.enqueue_notification(v_admin, new.id, 'order_placed_admin', v_vars);
    end loop;
  end if;

  if tg_op = 'UPDATE' then
    -- ------------------------------------------------------ washer accepted --
    if old.washer_id is null and new.washer_id is not null then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'washer_accepted_requester', v_vars, 'order_updates');
    end if;

    -- ---------------------------------------------------- washer en route ---
    if old.en_route_at is null and new.en_route_at is not null then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'washer_en_route_requester', v_vars, 'order_updates');
    end if;

    -- -------------------------------------------------------- picked up -----
    if old.status <> 'picked_up' and new.status = 'picked_up' then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'order_picked_up_requester', v_vars, 'order_updates');
    end if;

    -- ---------------------------------------------------- out for delivery --
    if old.status <> 'out_for_delivery' and new.status = 'out_for_delivery' then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'order_out_for_delivery_requester', v_vars, 'order_updates');
    end if;

    -- --------------------------------------------------------- delivered ----
    if old.status <> 'delivered' and new.status = 'delivered' then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'order_delivered_requester', v_vars, 'order_updates');
      perform public.enqueue_notification(
        new.washer_id, new.id, 'order_delivered_washer', v_vars, 'order_updates');
    end if;

    -- --------------------------------------------------------- cancelled ----
    if old.status <> 'cancelled' and new.status = 'cancelled' then
      perform public.enqueue_notification(
        new.requester_id, new.id, 'order_cancelled_requester', v_vars, 'order_updates');
      if new.washer_id is not null then
        perform public.enqueue_notification(
          new.washer_id, new.id, 'order_cancelled_washer', v_vars, 'order_updates');
      end if;
    end if;
  end if;

  perform public.kick_push_dispatch();
  return new;
end $$;

drop trigger if exists orders_notify on public.orders;
create trigger orders_notify
  after insert or update on public.orders
  for each row execute function public.on_order_change_notify();

-- -------------------------------------- manual chat -> push notification ----
-- A manual chat message also earns a push, but it does NOT create a
-- notification-feed row; the chat thread is its own surface.
create or replace function public.on_message_notify()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_order     public.orders;
  v_recipient uuid;
  v_sender    text;
begin
  select * into v_order from public.orders where id = new.order_id;
  if v_order is null then return new; end if;

  v_recipient := case
    when new.sender_id = v_order.requester_id then v_order.washer_id
    else v_order.requester_id
  end;
  if v_recipient is null then return new; end if;

  -- Requesters see the washer's first name; washers see a neutral label,
  -- preserving the product's one-way visibility rule.
  if new.sender_id = v_order.washer_id then
    select coalesce(first_name, 'Your washer') into v_sender
      from public.profiles where id = new.sender_id;
  else
    v_sender := 'Your customer';
  end if;

  if exists (
    select 1 from public.profiles
    where id = v_recipient
      and coalesce((notification_prefs ->> 'chat_messages')::boolean, true) = false
  ) then
    return new;
  end if;

  insert into public.notifications
    (user_id, order_id, template_key, title, body, data)
  values (
    v_recipient, new.order_id, 'chat_message', v_sender,
    left(new.body, 140),
    jsonb_build_object(
      'order_id', new.order_id::text,
      'kind', 'chat',
      'channels', to_jsonb(array['push']::text[])
    )
  );

  perform public.kick_push_dispatch();
  return new;
end $$;

drop trigger if exists messages_notify on public.messages;
create trigger messages_notify after insert on public.messages
  for each row execute function public.on_message_notify();
