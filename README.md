# BruinWash

Mobile client for [CampusWash](https://campuswash.app) — peer-to-peer laundry
pickup and delivery for college students. A requester books a pickup, a verified
student washer in the same building collects it, washes it, and returns it, with
live status the whole way.

Built with Expo SDK 57 / React Native 0.86 against the existing Supabase project.

## Quick start

```bash
npm install
cp .env.example .env          # then fill in the values
npx expo start
```

Push notifications, the camera, and Stripe's native payment sheet all need
native modules, so they require a development build rather than Expo Go:

```bash
npx expo run:ios              # or run:android
# or, in the cloud:
npx eas-cli@latest build --profile development
```

## What's here

```
app/                      expo-router routes (every file is a screen)
  (auth)/                 welcome, login, dual signup flows
  onboarding/             first-launch tour carousel, profile setup
  (requester)/            tabs: home, schedule, orders, settings
  (washer)/               tabs: available jobs, my jobs, earnings, settings
  (admin)/                order dashboard
  order/[id]/             status hero, chat thread, rating modal
  checkout.tsx            payment bottom sheet
  inbox.tsx               system notification feed
src/
  components/ui/          the shared UI kit — use it, don't fork it
  constants/              pricing mirror, product copy
  features/               per-feature components
  hooks/                  react-query data hooks
  lib/                    supabase client, error mapping, formatting
  providers/              auth, query, push, Stripe
  theme/                  design tokens
supabase/
  migrations/             schema, RLS, RPCs, triggers, seed
  functions/              Deno Edge Functions (Stripe, push dispatch)
  tests/                  SQL test harness — 99 assertions
```

## Architecture, briefly

**The database is the product.** Pricing, order state transitions, matching rules,
and the automated messaging fan-out all live in Postgres, not in the app. The
client calls RPCs; it has no INSERT or UPDATE on `orders` or `reviews`. That means
a malicious client cannot misprice an order, jump the pipeline, or mark itself
paid.

**Automated messaging is one trigger.** The seven system messages in the spec are
rows in `public.message_templates` (so copy changes need no deploy). A single
trigger on `orders` renders them into `public.notifications` and pokes an Edge
Function to deliver pushes. No cron, no polling.

**Two message surfaces, never mixed.** `public.notifications` is the system feed;
`public.messages` is the manual requester↔washer chat. Automated copy never
enters the chat thread.

**One-way visibility.** A requester sees an Uber-style card for their assigned
washer — first name, photo, star rating, completed orders — from a row-limited
view. Washers never see requester identity.

## Verify

```bash
npx tsc --noEmit                    # typecheck
./supabase/tests/run_migrations.sh  # spins up Postgres in Docker, runs 99 assertions
npx expo-doctor                     # dependency sanity
```

The SQL suite needs Docker running. It creates and destroys its own container.

## Read next

- [`NOTES.md`](NOTES.md) — build decisions, where the spec and the live site
  disagree, and what still needs doing before launch. **Start here.**
- [`AGENTS.md`](AGENTS.md) — conventions and the non-negotiables.
- [`supabase/functions/README.md`](supabase/functions/README.md) — Edge Function
  deployment and the secrets to set.
