-- ===========================================================================
-- Seed: automated message copy + buildings + storage buckets.
--
-- The seven rows marked [SPEC] use the message copy from the product spec
-- VERBATIM. Do not reword them without a product decision. The rows marked
-- [ADDED] cover lifecycle stages the spec lists under push notifications
-- (3.3 "picked up") but does not give copy for.
-- ===========================================================================

insert into public.message_templates (key, audience, channels, title, body) values

-- [SPEC] Order placed -> Requester
('order_placed_requester', 'requester', '{push,in_app}',
 'Order confirmed',
 'Your order is confirmed! We''re finding a Washer in your building. We''ll notify you as soon as someone accepts.'),

-- [SPEC] Order placed -> Washer
('order_placed_washer', 'washer', '{push,in_app}',
 'New order in your building',
 'New laundry order available in your building. Open the app to accept before someone else does.'),

-- [SPEC] Order placed -> Admin
('order_placed_admin', 'admin', '{push,email}',
 'New order placed',
 'New order placed — {{building}}, {{tier}}, {{time}}. Check dashboard.'),

-- [SPEC] Washer accepted -> Requester
('washer_accepted_requester', 'requester', '{push,in_app}',
 'Washer assigned',
 '{{washer_name}} has accepted your order and will pick up your laundry at {{scheduled_time}}. You can message them in the app.'),

-- [SPEC] Washer on the way -> Requester
('washer_en_route_requester', 'requester', '{push,in_app}',
 'Washer on the way',
 '{{washer_name}} is on the way to pick up your laundry. Make sure your bag is ready!'),

-- [SPEC] Order delivered -> Requester
('order_delivered_requester', 'requester', '{push,in_app}',
 'Laundry delivered',
 'Your laundry has been delivered! How did {{washer_name}} do? Tap to leave a rating.'),

-- [SPEC] Order delivered -> Washer
('order_delivered_washer', 'washer', '{in_app}',
 'Order complete',
 'Order marked complete. Your earnings have been added to your balance.'),

-- [ADDED] lifecycle coverage for spec 3.3
('order_picked_up_requester', 'requester', '{push,in_app}',
 'Laundry picked up',
 '{{washer_name}} has picked up your laundry. We''ll let you know when it''s on the way back.'),

('order_out_for_delivery_requester', 'requester', '{push,in_app}',
 'Out for delivery',
 '{{washer_name}} is on the way back with your clean laundry.'),

('order_cancelled_requester', 'requester', '{push,in_app}',
 'Order cancelled',
 'Your order has been cancelled. Any refund due will appear on your original payment method.'),

('order_cancelled_washer', 'washer', '{push,in_app}',
 'Order cancelled',
 'An order you accepted has been cancelled. It has been removed from your queue.')

on conflict (key) do update
  set title = excluded.title,
      body  = excluded.body,
      audience = excluded.audience,
      channels = excluded.channels,
      updated_at = now();

-- ------------------------------------------------------------- buildings ----
-- UCLA on-campus housing. The live web product's building dropdown is the
-- authority; reconcile this list against it before launch.
insert into public.buildings (campus, name, slug, sort_order) values
  ('UCLA', 'Dykstra Hall',            'dykstra',          10),
  ('UCLA', 'Hedrick Hall',            'hedrick-hall',     20),
  ('UCLA', 'Hedrick Summit',          'hedrick-summit',   30),
  ('UCLA', 'Rieber Hall',             'rieber-hall',      40),
  ('UCLA', 'Rieber Terrace',          'rieber-terrace',   50),
  ('UCLA', 'Rieber Vista',            'rieber-vista',     60),
  ('UCLA', 'Sproul Hall',             'sproul-hall',      70),
  ('UCLA', 'Sproul Cove',             'sproul-cove',      80),
  ('UCLA', 'Sproul Landing',          'sproul-landing',   90),
  ('UCLA', 'De Neve Plaza',           'de-neve',         100),
  ('UCLA', 'Olympic Hall',            'olympic',         110),
  ('UCLA', 'Centennial Hall',         'centennial',      120),
  ('UCLA', 'Hitch Suites',            'hitch',           130),
  ('UCLA', 'Saxon Suites',            'saxon',           140),
  ('UCLA', 'Holly Ridge',             'holly-ridge',     150),
  ('UCLA', 'Gardenia Way',            'gardenia-way',    160),
  ('UCLA', 'Canyon Point',            'canyon-point',    170),
  ('UCLA', 'Tipuana Court',           'tipuana-court',   180),
  ('UCLA', 'Delta Terrace',           'delta-terrace',   190),
  ('UCLA', 'Margan Apartments',       'margan',          200)
on conflict (campus, slug) do nothing;

-- --------------------------------------------------------------- storage ----
-- Private buckets: proof photos and avatars are never world-readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('delivery-proof', 'delivery-proof', false, 10485760,
   array['image/jpeg','image/png','image/webp','image/heic']),
  ('avatars', 'avatars', false, 5242880,
   array['image/jpeg','image/png','image/webp','image/heic'])
on conflict (id) do nothing;

-- Washer uploads proof into a folder named after the order id.
drop policy if exists proof_washer_insert on storage.objects;
create policy proof_washer_insert on storage.objects
  for insert to authenticated with check (
    bucket_id = 'delivery-proof'
    and exists (
      select 1 from public.orders o
      where o.washer_id = auth.uid()
        and o.id::text = (storage.foldername(name))[1]
    )
  );

-- Both parties on the order can read the proof photo.
drop policy if exists proof_participants_read on storage.objects;
create policy proof_participants_read on storage.objects
  for select to authenticated using (
    bucket_id = 'delivery-proof'
    and (
      public.is_admin()
      or exists (
        select 1 from public.orders o
        where o.id::text = (storage.foldername(name))[1]
          and (o.requester_id = auth.uid() or o.washer_id = auth.uid())
      )
    )
  );

-- Avatars live under a folder named after the owning user id.
drop policy if exists avatars_owner_write on storage.objects;
create policy avatars_owner_write on storage.objects
  for all to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists avatars_read on storage.objects;
create policy avatars_read on storage.objects
  for select to authenticated using (bucket_id = 'avatars');

-- ------------------------------------------------------------- realtime -----
-- Mobile subscribes to these tables via Supabase Realtime.
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null; end $$;
