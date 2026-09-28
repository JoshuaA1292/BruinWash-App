-- ===========================================================================
-- BruinWash / CampusWash — core schema
-- Mobile app connects to the SAME Supabase project as the live web product.
-- If a table below already exists on the live project, review before applying:
-- these statements are written to be additive and idempotent where practical.
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_net";

-- ---------------------------------------------------------------- enums ----
do $$ begin
  create type user_role as enum ('requester', 'washer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Standard = Wash + Dry ($9.99). Full = Wash + Dry + Fold ($14.99).
  create type service_tier as enum ('standard', 'full');
exception when duplicate_object then null; end $$;

do $$ begin
  -- The 6-stage pipeline from the spec, plus a terminal cancelled state.
  create type order_status as enum (
    'pending', 'accepted', 'picked_up', 'washing',
    'out_for_delivery', 'delivered', 'cancelled'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_status as enum (
    'unpaid', 'processing', 'paid', 'refunded', 'partially_refunded', 'failed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type dispute_status as enum ('open', 'reviewing', 'resolved', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type promo_kind as enum ('percent', 'fixed');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------ buildings ----
create table if not exists public.buildings (
  id          uuid primary key default gen_random_uuid(),
  campus      text not null default 'UCLA',
  name        text not null,
  slug        text not null,
  sort_order  int  not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (campus, slug)
);

-- ------------------------------------------------------------- profiles ----
create table if not exists public.profiles (
  id                       uuid primary key references auth.users(id) on delete cascade,
  role                     user_role not null default 'requester',
  first_name               text,
  last_name                text,
  avatar_url               text,
  edu_email                text,
  building_id              uuid references public.buildings(id),
  floor                    text,
  room_number              text,
  phone                    text,
  -- Safety page: "Female users may request female washers only."
  is_female                boolean,
  female_washers_only      boolean not null default false,
  -- Washer payouts (Stripe Connect Express)
  stripe_account_id        text,
  stripe_onboarding_done   boolean not null default false,
  stripe_customer_id       text,
  onboarding_tour_done     boolean not null default false,
  notification_prefs       jsonb not null default
    '{"order_updates":true,"new_orders":true,"chat_messages":true,"marketing":false}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists profiles_building_role_idx
  on public.profiles (building_id, role);

-- ----------------------------------------------------------- push tokens ----
-- One row per device so a user can be pushed on all their devices.
create table if not exists public.push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  token       text not null unique,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  device_name text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists push_tokens_user_idx on public.push_tokens (user_id);

-- --------------------------------------------------------------- orders ----
create table if not exists public.orders (
  id                        uuid primary key default gen_random_uuid(),
  requester_id              uuid not null references public.profiles(id) on delete restrict,
  washer_id                 uuid references public.profiles(id) on delete set null,

  -- Pickup details (same-building matching keys off building_id)
  building_id               uuid not null references public.buildings(id),
  floor                     text not null,
  room_number               text,
  pickup_at                 timestamptz not null,

  -- Laundry details
  tier                      service_tier not null,
  load_count                int not null default 1 check (load_count between 1 and 10),
  wash_cycle                text not null default 'Normal',
  wash_temp                 text not null default 'Warm',
  dry_level                 text not null default 'Medium',
  notes                     text,
  add_detergent_pods        boolean not null default false,
  add_gloves                boolean not null default false,

  status                    order_status not null default 'pending',

  -- Money, all integer cents. Never use floats for currency.
  service_fee_cents         int not null,
  machine_cost_cents        int not null,
  addons_cents              int not null default 0,
  tip_cents                 int not null default 0,
  discount_cents            int not null default 0,
  processing_fee_cents      int not null default 0,
  subtotal_cents            int not null,
  total_cents               int not null,
  promo_code                text,

  -- Liability acknowledgement is required before checkout can proceed.
  liability_ack             boolean not null default false,
  liability_ack_at          timestamptz,
  liability_cap_cents       int not null default 2500,

  -- Payment
  payment_status            payment_status not null default 'unpaid',
  stripe_payment_intent_id  text,
  stripe_checkout_session_id text,

  -- Proof of delivery (Supabase Storage object path in the 'delivery-proof' bucket)
  delivery_photo_path       text,

  -- Lifecycle timestamps. en_route_at backs the "Washer on the way" message,
  -- which is a washer action rather than one of the 6 pipeline stages.
  accepted_at               timestamptz,
  en_route_at               timestamptz,
  picked_up_at              timestamptz,
  washing_at                timestamptz,
  out_for_delivery_at       timestamptz,
  delivered_at              timestamptz,
  cancelled_at              timestamptz,
  cancelled_by              uuid references public.profiles(id),
  cancellation_reason       text,
  refund_cents              int not null default 0,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint orders_totals_nonneg check (
    service_fee_cents >= 0 and machine_cost_cents >= 0 and addons_cents >= 0
    and tip_cents >= 0 and discount_cents >= 0 and processing_fee_cents >= 0
    and subtotal_cents >= 0 and total_cents >= 0
  ),
  -- A washer can never be their own requester.
  constraint orders_washer_not_requester check (washer_id is null or washer_id <> requester_id)
);

create index if not exists orders_status_building_idx
  on public.orders (status, building_id, pickup_at);
create index if not exists orders_requester_idx on public.orders (requester_id, created_at desc);
create index if not exists orders_washer_idx    on public.orders (washer_id, created_at desc);

-- --------------------------------------------------------- order events ----
-- Append-only audit trail of every status transition.
create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  from_status order_status,
  to_status   order_status not null,
  actor_id    uuid references public.profiles(id),
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_idx on public.order_events (order_id, created_at);

-- ------------------------------------------------------------- messages ----
-- MANUAL Requester <-> Washer chat ONLY. Automated system copy must never be
-- inserted here; it belongs in public.notifications.
create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  sender_id  uuid not null references public.profiles(id) on delete cascade,
  body       text not null check (length(btrim(body)) between 1 and 2000),
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists messages_order_idx on public.messages (order_id, created_at);

-- -------------------------------------------------- notification feed -----
-- The in-app system/notification inbox. Separate from public.messages.
create table if not exists public.notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  order_id      uuid references public.orders(id) on delete cascade,
  template_key  text not null,
  title         text not null,
  body          text not null,
  data          jsonb not null default '{}'::jsonb,
  read_at       timestamptz,
  push_sent_at  timestamptz,
  push_error    text,
  created_at    timestamptz not null default now()
);

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read_at is null;

-- ------------------------------------------------- message templates ------
-- Automated copy lives here so it can change without a code deploy (spec 3.2).
create table if not exists public.message_templates (
  key         text primary key,
  audience    text not null check (audience in ('requester', 'washer', 'admin')),
  channels    text[] not null default '{push,in_app}',
  title       text not null,
  body        text not null,
  enabled     boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- -------------------------------------------------------------- reviews ----
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null unique references public.orders(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  washer_id    uuid not null references public.profiles(id) on delete cascade,
  rating       int not null check (rating between 1 and 5),
  comment      text,
  created_at   timestamptz not null default now()
);

create index if not exists reviews_washer_idx on public.reviews (washer_id);

-- ---------------------------------------------------------- promo codes ----
create table if not exists public.promo_codes (
  code              text primary key,
  kind              promo_kind not null,
  value             int not null check (value > 0),
  min_subtotal_cents int not null default 0,
  applies_to_tier   service_tier,
  max_redemptions   int,
  redemption_count  int not null default 0,
  per_user_limit    int not null default 1,
  valid_from        timestamptz not null default now(),
  valid_until       timestamptz,
  active            boolean not null default true,
  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null references public.promo_codes(code) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  order_id   uuid not null references public.orders(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (code, order_id)
);

-- ------------------------------------------------------------- payouts ----
create table if not exists public.payouts (
  id                 uuid primary key default gen_random_uuid(),
  washer_id          uuid not null references public.profiles(id) on delete cascade,
  order_id           uuid references public.orders(id) on delete set null,
  amount_cents       int not null,
  status             text not null default 'pending'
                     check (status in ('pending', 'in_transit', 'paid', 'failed', 'reversed')),
  stripe_transfer_id text,
  created_at         timestamptz not null default now(),
  paid_at            timestamptz
);

create index if not exists payouts_washer_idx on public.payouts (washer_id, created_at desc);

-- ------------------------------------------------------------ disputes ----
create table if not exists public.disputes (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references public.orders(id) on delete cascade,
  opened_by    uuid not null references public.profiles(id) on delete cascade,
  category     text not null,
  description  text not null,
  status       dispute_status not null default 'open',
  resolution   text,
  refund_cents int not null default 0,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);

create index if not exists disputes_order_idx on public.disputes (order_id);
