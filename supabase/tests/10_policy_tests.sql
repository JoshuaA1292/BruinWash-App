-- ===========================================================================
-- Behavioural tests. Every one of these encodes a rule from the product spec
-- or a security boundary. Run with supabase/tests/run_migrations.sh.
-- ===========================================================================
\set ON_ERROR_STOP on
set client_min_messages = notice;

create schema t;
grant usage on schema t to anon, authenticated;
alter default privileges in schema t grant execute on functions to anon, authenticated;

-- The first order created, resolved bypassing RLS so tests can name it from any
-- role. Deterministic even as later tests add more orders.
create or replace view public.orders_all_for_test with (security_invoker = off) as
  select id from public.orders order by created_at, id limit 1;
grant select on public.orders_all_for_test to authenticated;


create or replace function t.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  if p_cond then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;

-- Runs a statement and asserts it raises, with the message matching a pattern.
create or replace function t.raises(p_sql text, p_pattern text, p_label text)
returns void language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FAIL  % (expected an error, none raised)', p_label;
exception
  when others then
    if sqlerrm like 'FAIL %' then raise; end if;
    if sqlerrm ilike p_pattern then
      raise notice 'PASS  %', p_label;
    else
      raise exception 'FAIL  % (wrong error: %)', p_label, sqlerrm;
    end if;
end $$;

-- Marks an order paid the way the Stripe webhook does, and stamps a payment
-- intent so a refund has something to reverse. SECURITY DEFINER because clients
-- deliberately cannot write payment columns.
create or replace function t.pay(p_order_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.orders
     set payment_status = 'paid',
         stripe_payment_intent_id = 'pi_test_' || replace(p_order_id::text, '-', '')
   where id = p_order_id;
end $$;

create or replace function t.act_as(p_uid uuid)
returns void language plpgsql as $$
begin
  -- session scope: psql autocommits, so a transaction-local set would vanish
  perform set_config('request.jwt.claim.sub', p_uid::text, false);
end $$;

-- =============================== fixtures =================================
\set req_a  '''11111111-1111-1111-1111-111111111111'''
\set wash_a '''22222222-2222-2222-2222-222222222222'''
\set wash_b '''33333333-3333-3333-3333-333333333333'''
\set wash_x '''44444444-4444-4444-4444-444444444444'''
\set admin  '''55555555-5555-5555-5555-555555555555'''

-- ---------------------------------------------------------------------------
-- 1. The .edu gate
-- ---------------------------------------------------------------------------
do $$ begin
  perform t.raises(
    $q$ insert into auth.users (id, email) values (gen_random_uuid(), 'someone@gmail.com') $q$,
    '%.edu college email%',
    '.edu gate rejects a non-.edu signup'
  );
end $$;

insert into auth.users (id, email, raw_user_meta_data) values
  (:req_a,  'requester.a@ucla.edu', '{"role":"requester","first_name":"Alex"}'),
  (:wash_a, 'washer.a@ucla.edu',    '{"role":"washer","first_name":"Jordan"}'),
  (:wash_b, 'washer.b@ucla.edu',    '{"role":"washer","first_name":"Riley"}'),
  (:wash_x, 'washer.x@g.ucla.edu',  '{"role":"washer","first_name":"Sam"}'),
  (:admin,  'admin@ucla.edu',       '{"role":"admin","first_name":"Admin"}');

do $$ begin
  perform t.ok((select count(*) = 5 from public.profiles), 'profiles auto-provisioned from auth.users');
  perform t.ok((select role = 'washer' from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
               'signup role carried through from user metadata');
  perform t.ok((select count(*) = 1 from public.profiles where edu_email = 'washer.x@g.ucla.edu'),
               'subdomain .edu address accepted (g.ucla.edu)');
end $$;

-- Place everyone except wash_x in Dykstra; wash_x lives in Hedrick.
update public.profiles set building_id = (select id from public.buildings where slug = 'dykstra'), floor = '3'
 where id in (:req_a, :wash_a, :wash_b);
update public.profiles set building_id = (select id from public.buildings where slug = 'hedrick-hall'), floor = '5'
 where id = :wash_x;
update public.profiles set is_female = true where id = :wash_a;

-- ---------------------------------------------------------------------------
-- 2. Server-side pricing matches the spec
-- ---------------------------------------------------------------------------
do $$
declare p jsonb;
begin
  p := public.price_order('full', 1, false, false, 0, null);
  perform t.ok((p->>'service_fee_cents')::int = 1499, 'Full tier service fee is $14.99');
  perform t.ok((p->>'machine_cost_cents')::int = 250,  'Machine cost is $2.50/load');
  -- Spec 2.3: the Schedule CTA reads "Continue to Checkout - $17.49".
  perform t.ok((p->>'cta_cents')::int = 1749, 'Full tier checkout CTA is $17.49');
  perform t.ok((p->>'liability_cap_cents')::int = 2500, 'Liability cap disclosed as $25');

  p := public.price_order('standard', 1, false, false, 0, null);
  perform t.ok((p->>'service_fee_cents')::int = 999, 'Standard tier service fee is $9.99');
  perform t.ok((p->>'cta_cents')::int = 1249, 'Standard tier checkout CTA is $12.49');

  -- Processing fee is 2.9% + $0.30 on subtotal + tip.
  p := public.price_order('full', 1, false, false, 300, null);
  perform t.ok((p->>'subtotal_cents')::int = 1749, 'subtotal excludes the tip');
  perform t.ok((p->>'processing_fee_cents')::int = round((1749 + 300) * 0.029)::int + 30,
               'processing fee is 2.9% + $0.30');
  perform t.ok((p->>'total_cents')::int = 1749 + 300 + ((p->>'processing_fee_cents')::int),
               'total = subtotal + tip + processing');

  -- Multi-load scales both the service fee and the machine cost.
  p := public.price_order('full', 3, true, true, 0, null);
  perform t.ok((p->>'service_fee_cents')::int = 1499 * 3, 'service fee scales per load');
  perform t.ok((p->>'addons_cents')::int = 50 * 3 + 50, 'pods are per load, gloves are flat');
end $$;

-- ---------------------------------------------------------------------------
-- 3. Promo codes
-- ---------------------------------------------------------------------------
insert into public.promo_codes (code, kind, value, max_redemptions, per_user_limit)
values ('WELCOME20', 'percent', 20, 100, 1),
       ('EXPIRED5',  'fixed',  500, 100, 1);
update public.promo_codes set valid_until = now() - interval '1 day' where code = 'EXPIRED5';

set role authenticated;
select t.act_as(:req_a);
do $$
declare v jsonb;
begin
  v := public.validate_promo_code('WELCOME20', 1749, 'full');
  perform t.ok((v->>'valid')::boolean, 'valid promo code is accepted');
  perform t.ok((v->>'discount_cents')::int = round(1749 * 0.2)::int, 'percent discount computed correctly');

  v := public.validate_promo_code('NOPE', 1749, 'full');
  perform t.ok((v->>'valid')::boolean = false, 'unknown promo code rejected');
  -- Spec 2.4 requires this exact toast copy.
  perform t.ok(v->>'message' = 'Invalid or ineligible promo code.', 'invalid-promo copy matches spec');

  v := public.validate_promo_code('EXPIRED5', 1749, 'full');
  perform t.ok((v->>'valid')::boolean = false, 'expired promo code rejected');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 4. Booking: liability acknowledgement gates the order
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:req_a);
do $$
declare v_b uuid := (select id from public.buildings where slug = 'dykstra');
begin
  perform t.raises(
    format($q$ select public.create_order(%L, '3', null, now() + interval '1 day', 'full', false) $q$, v_b),
    '%acknowledge the liability%',
    'booking is refused without the liability acknowledgement'
  );
  perform t.raises(
    format($q$ select public.create_order(%L, '3', null, now() - interval '1 hour', 'full', true) $q$, v_b),
    '%must be in the future%',
    'booking is refused for a pickup time in the past'
  );
  perform t.raises(
    format($q$ select public.create_order(%L, '  ', null, now() + interval '1 day', 'full', true) $q$, v_b),
    '%Floor is required%',
    'booking is refused without a floor'
  );
end $$;

-- A client must not be able to write to orders directly (money integrity).
do $$ begin
  perform t.raises(
    $q$ insert into public.orders (requester_id, building_id, floor, pickup_at, tier,
          service_fee_cents, machine_cost_cents, subtotal_cents, total_cents, liability_ack)
        values (auth.uid(), (select id from public.buildings limit 1), '3',
                now() + interval '1 day', 'full', 0, 0, 0, 0, true) $q$,
    '%permission denied%',
    'direct INSERT into orders is denied to clients'
  );
end $$;

-- The real booking.
do $$
declare v_o public.orders;
begin
  v_o := public.create_order(
    (select id from public.buildings where slug = 'dykstra'),
    '3', '312', now() + interval '1 day', 'full', true,
    1, false, false, 300, 'WELCOME20');
  perform t.ok(v_o.status = 'pending',            'new order starts pending');
  perform t.ok(v_o.payment_status = 'unpaid',     'new order starts unpaid');
  perform t.ok(v_o.discount_cents = 350,          'promo discount applied server-side');
  perform t.ok(v_o.liability_cap_cents = 2500,    'liability cap stamped on the order');
end $$;
reset role;

do $$ begin
  perform t.ok((select count(*) = 0 from public.notifications),
               'no notifications fire for an unpaid order');
end $$;

-- ---------------------------------------------------------------------------
-- 5. "Order placed" fan-out fires on payment, to the right people only
-- ---------------------------------------------------------------------------
-- With app_config empty the trigger must still write the in-app feed and simply
-- skip the push kick, so an unconfigured project degrades gracefully.
do $$ begin
  perform t.ok((select count(*) = 0 from net.calls),
               'no push kick attempted while app_config is unset');
end $$;

insert into public.app_config (key, value) values
  ('functions_base_url', 'https://stub.functions.supabase.co'),
  ('service_role_key',   'stub-service-role-key');

update public.orders set payment_status = 'paid';

do $$
declare v_o uuid := (select id from public.orders limit 1);
begin
  perform t.ok((select count(*) = 1 from public.notifications
                 where user_id = '11111111-1111-1111-1111-111111111111'
                   and template_key = 'order_placed_requester'),
               'requester is notified their order is confirmed');

  -- Same-building matching: both Dykstra washers, and not the Hedrick one.
  perform t.ok((select count(*) = 2 from public.notifications
                 where template_key = 'order_placed_washer'),
               'both same-building washers are alerted');
  perform t.ok((select count(*) = 0 from public.notifications
                 where template_key = 'order_placed_washer'
                   and user_id = '44444444-4444-4444-4444-444444444444'),
               'a washer in a DIFFERENT building is not alerted');

  perform t.ok((select count(*) = 1 from public.notifications
                 where template_key = 'order_placed_admin'),
               'admin is notified of the new order');

  -- Spec copy, verbatim.
  perform t.ok((select body = 'Your order is confirmed! We''re finding a Washer in your building. We''ll notify you as soon as someone accepts.'
                  from public.notifications where template_key = 'order_placed_requester'),
               'requester order-placed copy matches the spec verbatim');
  perform t.ok((select body = 'New laundry order available in your building. Open the app to accept before someone else does.'
                  from public.notifications where template_key = 'order_placed_washer' limit 1),
               'washer order-placed copy matches the spec verbatim');
  perform t.ok((select body like 'New order placed — Dykstra Hall, Wash, Dry & Fold, %. Check dashboard.'
                  from public.notifications where template_key = 'order_placed_admin'),
               'admin copy interpolates building, tier and time');

  perform t.ok((select count(*) > 0 from net.calls where url like '%/dispatch-push'),
               'push dispatch was kicked off');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Same-building visibility (RLS on orders)
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:wash_a);
do $$ begin
  -- The job board is a narrow view. The washer must NOT be able to read the raw
  -- order row for a job they have not accepted -- it carries room_number and notes.
  perform t.ok((select count(*) = 1 from public.available_orders),
               'same-building washer sees the pending job on the job board');
  perform t.ok((select count(*) = 0 from public.orders),
               'washer canNOT read the raw order row before accepting it');
  perform t.raises(
    $q$ select room_number from public.available_orders $q$,
    '%room_number%does not exist%',
    'the job board does not expose room_number at all'
  );
  perform t.raises(
    $q$ select requester_id from public.available_orders $q$,
    '%requester_id%does not exist%',
    'the job board does not expose requester_id at all'
  );
end $$;

select t.act_as(:wash_x);
do $$ begin
  perform t.ok((select count(*) = 0 from public.available_orders),
               'washer in another building sees nothing on the job board');
end $$;

-- One-way visibility: a washer must never read a requester's profile.
select t.act_as(:wash_a);
do $$ begin
  perform t.ok((select count(*) = 0 from public.profiles
                 where id = '11111111-1111-1111-1111-111111111111'),
               'washer cannot read the requester profile (one-way visibility)');
  perform t.ok((select count(*) = 1 from public.profiles), 'washer can read only their own profile');
end $$;

-- A user cannot promote themselves.
do $$ begin
  perform t.raises(
    $q$ update public.profiles set role = 'admin' where id = auth.uid() $q$,
    '%cannot change your own account role%',
    'self-promotion to admin is blocked'
  );
  perform t.raises(
    $q$ update public.profiles set stripe_account_id = 'acct_hijack' where id = auth.uid() $q$,
    '%managed by the server%',
    'client cannot attach an arbitrary Stripe account'
  );
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 7. Acceptance is race-safe and building-scoped
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:wash_x);
do $$
declare v_o uuid := (select id from public.orders_all_for_test);
begin
  perform t.raises(
    format($q$ select public.accept_order(%L) $q$, v_o),
    '%own building%',
    'a washer cannot accept an order in another building'
  );
end $$;
reset role;

-- Payment must clear before a washer can claim the job.
-- A client must never be able to mark its own order paid.
set role authenticated;
select t.act_as(:req_a);
do $$ begin
  perform t.raises(
    $q$ update public.orders set payment_status = 'paid' where requester_id = auth.uid() $q$,
    '%permission denied%',
    'a requester cannot mark their own order paid'
  );
end $$;
reset role;

update public.orders set payment_status = 'unpaid';
set role authenticated;
select t.act_as(:wash_a);
do $$
declare v_o uuid := (select id from public.orders_all_for_test);
begin
  perform t.raises(
    format($q$ select public.accept_order(%L) $q$, v_o),
    '%not paid yet%',
    'an unpaid order cannot be accepted'
  );
end $$;
reset role;
update public.orders set payment_status = 'paid';

-- The winner takes it; the loser gets a clear, user-facing message. The FOR
-- UPDATE lock in accept_order() is what makes this safe under true concurrency.
set role authenticated;
select t.act_as(:wash_a);
do $$
declare v_o public.orders;
begin
  v_o := public.accept_order((select id from public.orders_all_for_test));
  perform t.ok(v_o.status = 'accepted',   'first washer to accept wins');
  perform t.ok(v_o.washer_id = auth.uid(), 'order is assigned to the accepting washer');
  perform t.ok(v_o.accepted_at is not null, 'accepted_at is stamped');
end $$;

select t.act_as(:wash_b);
do $$ begin
  perform t.raises(
    format($q$ select public.accept_order(%L) $q$, (select id from public.orders_all_for_test)),
    '%already been accepted by another washer%',
    'the second washer is rejected with a clear message'
  );
end $$;
reset role;

do $$ begin
  perform t.ok((select count(*) = 1 from public.notifications
                 where template_key = 'washer_accepted_requester'),
               'requester is notified the washer accepted');
  perform t.ok((select body = 'Jordan has accepted your order and will pick up your laundry at '
                   || to_char((select pickup_at from public.orders limit 1)
                              at time zone 'America/Los_Angeles',
                              'FMDay, FMMon FMDD at FMHH12:MI AM')
                   || '. You can message them in the app.'
                  from public.notifications where template_key = 'washer_accepted_requester'),
               'acceptance copy interpolates washer first name and pickup time');
  -- One-way visibility: only the FIRST name is ever rendered.
  perform t.ok((select body not like '%Jordan %Doe%' from public.notifications
                 where template_key = 'washer_accepted_requester'),
               'no surname leaks into the notification copy');
end $$;

-- ---------------------------------------------------------------------------
-- 8. The washer visibility card (spec 3.1)
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:req_a);
do $$
declare c record;
begin
  select * into c from public.washer_cards
   where washer_id = '22222222-2222-2222-2222-222222222222';
  perform t.ok(c.first_name = 'Jordan', 'requester sees the assigned washer''s first name');
  perform t.ok(c.completed_orders = 0,  'completed order count starts at zero');
  perform t.ok(c.avg_rating = 0,        'rating starts at zero with no reviews');
  perform t.ok((select count(*) = 1 from public.washer_cards),
               'requester sees a card ONLY for washers on their own orders');
end $$;

-- The reverse must not exist: no requester card, and no card for an unrelated washer.
select t.act_as(:wash_a);
do $$ begin
  perform t.ok((select count(*) = 1 from public.washer_cards),
               'a washer sees only their own card, never a requester');
  perform t.ok((select count(*) = 0 from public.washer_cards
                 where washer_id = '33333333-3333-3333-3333-333333333333'),
               'a washer cannot browse other washers'' cards');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 9. Pipeline transitions
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:wash_a);
do $$
declare v_o uuid := (select id from public.orders_all_for_test);
begin
  -- "On my way" is a washer action, not a pipeline stage.
  perform public.set_washer_en_route(v_o);
  perform t.ok((select en_route_at is not null from public.orders where id = v_o),
               'en_route_at is stamped when the washer sets off');

  -- No stage skipping.
  perform t.raises(
    format($q$ select public.advance_order_status(%L, 'delivered') $q$, v_o),
    '%Cannot move an order from accepted to delivered%',
    'stages cannot be skipped'
  );
  -- No going backwards.
  perform public.advance_order_status(v_o, 'picked_up');
  perform t.raises(
    format($q$ select public.advance_order_status(%L, 'accepted') $q$, v_o),
    '%Cannot move an order from picked_up to accepted%',
    'the pipeline cannot run backwards'
  );

  perform public.advance_order_status(v_o, 'washing');
  perform public.advance_order_status(v_o, 'out_for_delivery');

  -- Photo proof is required to close out (spec 3.4).
  perform t.raises(
    format($q$ select public.advance_order_status(%L, 'delivered') $q$, v_o),
    '%delivery photo is required%',
    'delivery cannot be marked complete without photo proof'
  );

  -- A path alone proves nothing: the object has to exist, and it has to live
  -- under this order's folder. Otherwise a washer closes a delivery and
  -- triggers their own payout with no photo at all.
  perform t.raises(
    format($q$ select public.advance_order_status(%L, 'delivered', 'anything') $q$, v_o),
    '%does not belong to this order%',
    'a delivery photo path outside the order folder is rejected'
  );
  perform t.raises(
    format($q$ select public.advance_order_status(%L, 'delivered', %L) $q$,
           v_o, v_o::text || '/never-uploaded.jpg'),
    '%upload did not complete%',
    'a delivery photo path with no uploaded object is rejected'
  );

  -- Now simulate what a real upload leaves behind.
  insert into storage.objects (bucket_id, name)
  values ('delivery-proof', v_o::text || '/proof.jpg');

  perform public.advance_order_status(v_o, 'delivered', v_o::text || '/proof.jpg');
  perform t.ok((select status = 'delivered' from public.orders where id = v_o),
               'order reaches delivered with a real photo proof attached');
end $$;

-- A washer must not be able to drive someone else's order.
select t.act_as(:wash_b);
do $$ begin
  perform t.raises(
    format($q$ select public.set_washer_en_route(%L) $q$, (select id from public.orders_all_for_test)),
    '%Not your order%',
    'a washer cannot act on an order assigned to someone else'
  );
end $$;
reset role;

do $$
declare v_o uuid := (select id from public.orders limit 1);
begin
  perform t.ok((select count(*) = 1 from public.notifications
                 where template_key = 'washer_en_route_requester'),
               'requester is notified the washer is on the way');
  perform t.ok((select body = 'Jordan is on the way to pick up your laundry. Make sure your bag is ready!'
                  from public.notifications where template_key = 'washer_en_route_requester'),
               'en-route copy matches the spec verbatim');
  perform t.ok((select body = 'Your laundry has been delivered! How did Jordan do? Tap to leave a rating.'
                  from public.notifications where template_key = 'order_delivered_requester'),
               'delivered copy matches the spec verbatim');
  perform t.ok((select body = 'Order marked complete. Your earnings have been added to your balance.'
                  from public.notifications where template_key = 'order_delivered_washer'),
               'washer delivered copy matches the spec verbatim');

  -- Automated copy must never enter the manual chat thread.
  perform t.ok((select count(*) = 0 from public.messages),
               'automated messages never land in the manual chat thread');

  -- Full audit trail of the pipeline.
  perform t.ok((select count(*) = 5 from public.order_events where order_id = v_o),
               'every transition is recorded in the audit trail');
  perform t.ok((select count(*) = 0 from public.order_events
                 where order_id = v_o and from_status = to_status),
               'audit rows record a real from -> to transition');
end $$;

-- Earnings are credited on delivery.
do $$
declare v_o public.orders := (select o from public.orders o limit 1);
begin
  perform t.ok((select count(*) = 1 from public.payouts where order_id = v_o.id),
               'a payout row is created when the order is delivered');
  perform t.ok((select amount_cents = round(v_o.service_fee_cents * 0.70)::int
                                     + v_o.machine_cost_cents + v_o.tip_cents
                  from public.payouts where order_id = v_o.id),
               'payout covers washer share + machine cost + the full tip');
end $$;

set role authenticated;
select t.act_as(:wash_a);
do $$
declare e jsonb := public.my_earnings();
begin
  perform t.ok((e->>'pending_cents')::int > 0, 'washer earnings dashboard reports a pending balance');
  perform t.ok((e->>'order_count')::int = 1,  'washer earnings dashboard counts the order');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 10. Post-delivery rating feeds the card
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:wash_a);
do $$ begin
  perform t.raises(
    format($q$ select public.submit_review(%L, 5, 'nope') $q$, (select id from public.orders_all_for_test)),
    '%Order not found%',
    'a washer cannot review themselves'
  );
  perform t.raises(
    $q$ insert into public.reviews (order_id, requester_id, washer_id, rating)
        values ((select id from public.orders_all_for_test), auth.uid(), auth.uid(), 5) $q$,
    '%permission denied%',
    'direct INSERT into reviews is denied to clients'
  );
end $$;

select t.act_as(:req_a);
do $$
declare v_r public.reviews;
begin
  v_r := public.submit_review((select id from public.orders_all_for_test), 5, 'Super fast, folded neatly.');
  perform t.ok(v_r.rating = 5, 'requester can rate a delivered order');

  perform t.raises(
    format($q$ select public.submit_review(%L, 9, null) $q$, (select id from public.orders_all_for_test)),
    '%reviews_rating_check%',
    'a rating outside 1-5 is rejected'
  );

  perform t.ok((select avg_rating = 5 from public.washer_cards
                 where washer_id = '22222222-2222-2222-2222-222222222222'),
               'the rating feeds straight into the washer card');
  perform t.ok((select review_count = 1 from public.washer_cards
                 where washer_id = '22222222-2222-2222-2222-222222222222'),
               'review count updates on the washer card');
  perform t.ok((select completed_orders = 1 from public.washer_cards
                 where washer_id = '22222222-2222-2222-2222-222222222222'),
               'completed order count updates on the washer card');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 11. Manual chat
-- ---------------------------------------------------------------------------
set role authenticated;
select t.act_as(:req_a);
insert into public.messages (order_id, sender_id, body)
  values ((select id from public.orders_all_for_test), :req_a, 'Bag is outside the door, thanks!');
reset role;

do $$ begin
  perform t.ok((select count(*) = 1 from public.notifications
                 where template_key = 'chat_message'
                   and user_id = '22222222-2222-2222-2222-222222222222'),
               'the washer is pushed about a new chat message');
  perform t.ok((select count(*) = 0 from public.notifications
                 where template_key = 'chat_message'
                   and user_id = '11111111-1111-1111-1111-111111111111'),
               'the sender is not notified about their own message');
  -- Requester identity stays hidden from the washer even in the push title.
  perform t.ok((select title = 'Your customer' from public.notifications
                 where template_key = 'chat_message'),
               'chat push to a washer does not reveal the requester''s name');
end $$;

-- An unrelated washer cannot read the thread.
set role authenticated;
select t.act_as(:wash_b);
do $$ begin
  perform t.ok((select count(*) = 0 from public.messages),
               'a washer not on the order cannot read the chat');
  perform t.raises(
    $q$ insert into public.messages (order_id, sender_id, body)
        values ((select id from public.orders_all_for_test), auth.uid(), 'butting in') $q$,
    '%row-level security%',
    'a washer not on the order cannot post to the chat'
  );
end $$;

-- Notification feed is private.
do $$ begin
  perform t.ok((select count(*) = 0 from public.notifications
                 where user_id <> auth.uid()),
               'a user only ever reads their own notification feed');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 12. Cancellation refund tiers (live Terms of Service, section 11)
-- ---------------------------------------------------------------------------
-- An order abandoned at the payment sheet was never charged, so cancelling it
-- must NOT promise a refund. Previously it reported the full total back.
set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o0 public.orders;
begin
  o0 := public.create_order(v_b, '3', null, now() + interval '9 hours', 'standard', true);
  o0 := public.cancel_order(o0.id, 'never paid');
  perform t.ok(o0.refund_cents = 0, 'cancelling an UNPAID order promises no refund');
  perform t.ok((select count(*) = 0 from public.refunds where order_id = o0.id),
               'no refund is queued for an order that was never charged');
end $$;
reset role;

set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o1 public.orders; o2 public.orders;
begin
  -- More than 2 hours out: full refund.
  o1 := public.create_order(v_b, '3', null, now() + interval '3 hours', 'standard', true);
  perform t.pay(o1.id);
  o1 := public.cancel_order(o1.id, 'changed my mind');
  perform t.ok(o1.refund_cents = o1.total_cents, 'cancelling >2h before pickup refunds in full');
  perform t.ok((select amount_cents = o1.total_cents from public.refunds where order_id = o1.id),
               'a refund is actually QUEUED for the money to move');

  -- Inside 2 hours: 50%.
  o2 := public.create_order(v_b, '3', null, now() + interval '90 minutes', 'standard', true);
  perform t.pay(o2.id);
  o2 := public.cancel_order(o2.id, 'too late');
  perform t.ok(o2.refund_cents = round(o2.total_cents * 0.5)::int,
               'cancelling <2h before pickup refunds 50%');

  perform t.raises(
    format($q$ select public.cancel_order(%L) $q$, o2.id),
    '%no longer be cancelled%',
    'an already-cancelled order cannot be cancelled again'
  );
  perform t.raises(
    format($q$ select public.cancel_order(%L) $q$, (select id from public.orders_all_for_test)),
    '%no longer be cancelled%',
    'a delivered order cannot be cancelled'
  );
end $$;
reset role;

-- No refund once washing has begun.
set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o3 public.orders;
begin
  o3 := public.create_order(v_b, '3', null, now() + interval '5 hours', 'full', true);
  perform set_config('bw.test_order', o3.id::text, false);
end $$;
reset role;
update public.orders set payment_status = 'paid'
 where id = current_setting('bw.test_order')::uuid;
set role authenticated;
select t.act_as(:wash_a);
do $$
declare v_o uuid := current_setting('bw.test_order')::uuid;
begin
  perform public.accept_order(v_o);
  perform public.advance_order_status(v_o, 'picked_up');
  perform public.advance_order_status(v_o, 'washing');
end $$;
select t.act_as(:req_a);
do $$
declare v_o public.orders;
begin
  v_o := public.cancel_order(current_setting('bw.test_order')::uuid, 'sorry');
  perform t.ok(v_o.refund_cents = 0, 'no refund once washing has begun');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 13. Female-washer-only preference (live Safety policy, section 5)
-- ---------------------------------------------------------------------------
update public.profiles set female_washers_only = true where id = :req_a;
set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o4 public.orders;
begin
  o4 := public.create_order(v_b, '3', null, now() + interval '2 days', 'full', true);
  perform set_config('bw.test_order2', o4.id::text, false);
end $$;
reset role;
update public.orders set payment_status = 'paid'
 where id = current_setting('bw.test_order2')::uuid;

set role authenticated;
select t.act_as(:wash_b);   -- is_female is not set
do $$ begin
  perform t.raises(
    format($q$ select public.accept_order(%L) $q$, current_setting('bw.test_order2')),
    '%female washers only%',
    'the female-washers-only preference is enforced at acceptance'
  );
end $$;
select t.act_as(:wash_a);   -- is_female = true
do $$
declare v_o public.orders;
begin
  v_o := public.accept_order(current_setting('bw.test_order2')::uuid);
  perform t.ok(v_o.status = 'accepted', 'a female washer can accept that order');
end $$;
reset role;

-- ---------------------------------------------------------------------------
-- 14. Notification preferences are honoured
-- ---------------------------------------------------------------------------
update public.profiles
   set notification_prefs = jsonb_set(notification_prefs, '{new_orders}', 'false')
 where id = :wash_b;

do $$
declare v_before int;
begin
  select count(*) into v_before from public.notifications
   where template_key = 'order_placed_washer' and user_id = '33333333-3333-3333-3333-333333333333';

  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', false);
  perform set_config('bw.test_order3',
    (public.create_order((select id from public.buildings where slug = 'dykstra'),
                         '3', null, now() + interval '4 days', 'standard', true)).id::text, false);
  update public.orders set payment_status = 'paid'
   where id = current_setting('bw.test_order3')::uuid;

  perform t.ok((select count(*) = v_before from public.notifications
                 where template_key = 'order_placed_washer'
                   and user_id = '33333333-3333-3333-3333-333333333333'),
               'a washer who muted new-order alerts is not notified');
  perform t.ok((select count(*) = 1 from public.notifications
                 where template_key = 'order_placed_washer'
                   and user_id = '22222222-2222-2222-2222-222222222222'
                   and order_id = current_setting('bw.test_order3')::uuid),
               'a washer who did not mute alerts still is notified');
end $$;


-- ===========================================================================
-- 15. Security hardening (migration 20260928000700). Every assertion below
--     corresponds to a defect found by adversarial review.
-- ===========================================================================

-- --- CRITICAL: SECURITY DEFINER helpers must not be callable by app users. ---
-- `revoke ... from anon, authenticated` does NOT strip the implicit grant to
-- PUBLIC, so these were all reachable over PostgREST. cfg() handed out the
-- service-role key, which bypasses every policy in this file.
insert into public.app_config (key, value)
values ('canary', 'SUPER-SECRET')
on conflict (key) do update set value = excluded.value;

do $$ begin
  perform t.ok(
    has_function_privilege('authenticated', 'public.cfg(text)', 'execute') = false,
    'cfg() is NOT executable by authenticated (service-role key stays secret)');
  perform t.ok(
    has_function_privilege('anon', 'public.cfg(text)', 'execute') = false,
    'cfg() is NOT executable by anon');
  perform t.ok(
    has_function_privilege('authenticated', 'public.price_cents(text)', 'execute') = false,
    'price_cents() is NOT executable by authenticated');
  perform t.ok(
    has_function_privilege('authenticated',
      'public.enqueue_notification(uuid,uuid,text,jsonb,text)', 'execute') = false,
    'enqueue_notification() is NOT executable by authenticated (no forged pushes)');
  perform t.ok(
    has_function_privilege('authenticated', 'public.kick_push_dispatch()', 'execute') = false,
    'kick_push_dispatch() is NOT executable by authenticated');
  perform t.ok(
    has_function_privilege('authenticated', 'public.render_template(text,jsonb)', 'execute') = false,
    'render_template() is NOT executable by authenticated');

  -- ...while the intended client surface stays reachable.
  perform t.ok(
    has_function_privilege('authenticated', 'public.accept_order(uuid)', 'execute'),
    'accept_order() is still executable by authenticated');
  perform t.ok(
    has_function_privilege('authenticated',
      'public.price_order(service_tier,int,boolean,boolean,int,text)', 'execute'),
    'price_order() is still executable by authenticated');
  perform t.ok(
    has_function_privilege('authenticated', 'public.is_admin()', 'execute'),
    'is_admin() stays executable — RLS policies evaluate it as the caller');
end $$;

set role authenticated;
select t.act_as(:req_a);
do $$ begin
  perform t.raises(
    $q$ select public.cfg('canary') $q$,
    '%permission denied%',
    'a signed-in student calling cfg() is refused at runtime'
  );
  perform t.ok((select count(*) = 0 from public.app_config),
               'app_config itself is unreadable by app users');
end $$;
reset role;

-- --- HIGH: a chat participant must not be able to rewrite the other's words ---
set role authenticated;
select t.act_as(:wash_a);
do $$
declare v_o uuid := (select id from public.orders_all_for_test);
begin
  perform t.raises(
    format($q$ update public.messages set body = 'I said keep the $40'
                where order_id = %L $q$, v_o),
    '%permission denied%',
    'the washer cannot rewrite the requester''s chat message'
  );
  -- Marking the other party's message read is still allowed.
  perform t.ok(
    has_column_privilege('authenticated', 'public.messages', 'read_at', 'update'),
    'read_at is still updatable, so read receipts keep working');
  perform t.ok(
    has_column_privilege('authenticated', 'public.messages', 'body', 'update') = false,
    'the message body column is not updatable by anyone');
end $$;
reset role;

-- --- MEDIUM: avatars must not be world-readable to every signed-in user -----
insert into storage.objects (bucket_id, name)
values ('avatars', '11111111-1111-1111-1111-111111111111/face.jpg'),
       ('avatars', '22222222-2222-2222-2222-222222222222/face.jpg')
on conflict do nothing;

set role authenticated;
select t.act_as(:wash_a);
do $$ begin
  perform t.ok((select count(*) = 0 from storage.objects
                 where bucket_id = 'avatars'
                   and name like '11111111-1111-1111-1111-111111111111/%'),
               'a washer cannot read the requester''s avatar (one-way visibility)');
  perform t.ok((select count(*) = 1 from storage.objects
                 where bucket_id = 'avatars'
                   and name like '22222222-2222-2222-2222-222222222222/%'),
               'a washer can still read their own avatar');
end $$;

select t.act_as(:req_a);
do $$ begin
  perform t.ok((select count(*) = 1 from storage.objects
                 where bucket_id = 'avatars'
                   and name like '22222222-2222-2222-2222-222222222222/%'),
               'a requester CAN read the avatar of a washer on their order');
end $$;
reset role;

-- --- HIGH: the time tier must dominate for a pre-pickup cancellation -------
-- An accepted order cancelled days before pickup was being charged the 50% fee,
-- contradicting the policy text the cancellation dialog shows.
set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o public.orders;
begin
  o := public.create_order(v_b, '3', null, now() + interval '2 days', 'standard', true);
  perform t.pay(o.id);
  perform set_config('bw.accepted_order', o.id::text, false);
end $$;
select t.act_as(:wash_a);
do $$ begin
  perform public.accept_order(current_setting('bw.accepted_order')::uuid);
end $$;
select t.act_as(:req_a);
do $$
declare o public.orders;
begin
  o := public.cancel_order(current_setting('bw.accepted_order')::uuid, 'plans changed');
  perform t.ok(o.refund_cents = o.total_cents,
               'an ACCEPTED order cancelled >2h before pickup still refunds in full');
end $$;
reset role;

-- --- MEDIUM: a promo code must not be burned by an unpaid order ------------
insert into public.promo_codes (code, kind, value, max_redemptions, per_user_limit)
values ('ONCEONLY', 'percent', 10, 50, 1);

set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o public.orders;
begin
  o := public.create_order(v_b, '3', null, now() + interval '3 days', 'standard', true,
                           1, false, false, 0, 'ONCEONLY');
  perform t.ok(o.discount_cents > 0, 'the promo discount is applied to the order');
  perform t.ok((select count(*) = 0 from public.promo_redemptions where code = 'ONCEONLY'),
               'an UNPAID order does not consume the promo redemption');
  perform set_config('bw.promo_order', o.id::text, false);
end $$;
reset role;

-- promo_codes is admin-only under RLS, so read the counter outside that role.
do $$ begin
  perform t.ok((select redemption_count = 0 from public.promo_codes where code = 'ONCEONLY'),
               'the redemption counter is untouched until payment clears');
end $$;

select t.pay(current_setting('bw.promo_order')::uuid);

do $$ begin
  perform t.ok((select count(*) = 1 from public.promo_redemptions where code = 'ONCEONLY'),
               'the redemption is recorded once the order is paid');
  perform t.ok((select redemption_count = 1 from public.promo_codes where code = 'ONCEONLY'),
               'the redemption counter increments on payment');
end $$;

-- Paying twice (a Stripe retry) must not double-count the redemption.
select t.pay(current_setting('bw.promo_order')::uuid);
do $$ begin
  perform t.ok((select redemption_count = 1 from public.promo_codes where code = 'ONCEONLY'),
               'a repeated paid transition does not double-count the redemption');
end $$;

-- --- MEDIUM: a discount may consume the margin, never the machine cost -----
-- Otherwise the washer's machine reimbursement comes out of the platform's
-- pocket, and the charge can fall under Stripe's 50-cent minimum.
insert into public.promo_codes (code, kind, value, per_user_limit)
values ('FREEWASH', 'fixed', 100000, 99);

do $$
declare p jsonb;
begin
  p := public.price_order('full', 1, false, false, 0, 'FREEWASH');
  perform t.ok((p->>'discount_cents')::int = 1499,
               'an oversized discount is capped at the service fee, not the whole base');
  perform t.ok((p->>'subtotal_cents')::int = 250,
               'the machine cost survives any discount');
  perform t.ok((p->>'total_cents')::int >= 50,
               'the total can never fall below Stripe''s 50-cent minimum');
end $$;

-- --- MEDIUM: an unpaid order must never reach the washer job board ---------
set role authenticated;
select t.act_as(:req_a);
do $$
declare
  v_b uuid := (select id from public.buildings where slug = 'dykstra');
  o public.orders;
begin
  o := public.create_order(v_b, '7', null, now() + interval '5 days', 'full', true);
  perform set_config('bw.unpaid_order', o.id::text, false);
end $$;

select t.act_as(:wash_a);
do $$ begin
  perform t.ok((select count(*) = 0 from public.available_orders
                 where id = current_setting('bw.unpaid_order')::uuid),
               'an unpaid order is NOT offered on the job board');
  perform t.raises(
    format($q$ select public.accept_order(%L) $q$, current_setting('bw.unpaid_order')),
    '%not paid yet%',
    'and accepting it is refused server-side too'
  );
end $$;
reset role;

select t.pay(current_setting('bw.unpaid_order')::uuid);
set role authenticated;
select t.act_as(:wash_a);
do $$ begin
  perform t.ok((select count(*) = 1 from public.available_orders
                 where id = current_setting('bw.unpaid_order')::uuid),
               'once paid, the same order appears on the job board');
end $$;
reset role;

select '---- all assertions passed ----' as result;
