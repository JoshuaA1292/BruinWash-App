# Supabase Edge Functions

Five Deno functions. They are the parts of BruinWash that must not run on a
phone: money, push delivery, and Stripe's webhooks.

These files are **not** part of the React Native bundle, so `npx tsc --noEmit`
does not cover them. Check them with Deno instead:

```bash
deno check supabase/functions/**/*.ts   # or: npm run typecheck:functions
```

| Function | Called by | verify_jwt |
|---|---|---|
| `dispatch-push` | the `kick_push_dispatch()` DB trigger (pg_net), or by hand | on (guards itself) |
| `create-payment-intent` | the checkout screen | on |
| `stripe-webhook` | Stripe | **off — `--no-verify-jwt`** |
| `connect-onboarding` | the washer earnings screen, and Stripe's browser redirect | **off — `--no-verify-jwt`** |
| `admin-notify` | chained from `dispatch-push`, or pg_cron, or by hand | on (guards itself) |
| `process-refund` | the `kick_refund_dispatch()` DB trigger (pg_net), or by hand | on (guards itself) |

Shared code lives in `_shared/`: `cors.ts` (preflight + response helpers),
`supabase.ts` (service-role client, caller verification, small utils) and
`stripe.ts` (a ~100-line form-encoded REST client, used instead of the Stripe SDK
so there is no SDK surface to guess at inside Deno).

---

## The two rows you MUST insert into `public.app_config`

The database is what kicks push delivery. `public.kick_push_dispatch()` reads
these two rows and calls `dispatch-push` over `pg_net`; with either missing it
returns early and **no push notification is ever sent.** The in-app feed
(`public.notifications`, the `/inbox` screen) keeps working perfectly — rows are
still written, badges still count, nothing errors. It is a silent degradation,
which is exactly why it is worth checking on day one.

```sql
insert into public.app_config (key, value) values
  ('functions_base_url', 'https://YOUR-PROJECT-REF.supabase.co/functions/v1'),
  ('service_role_key',   'YOUR_SERVICE_ROLE_KEY')
on conflict (key) do update set value = excluded.value;
```

`app_config` has RLS on with **no policies**, so no app user can read it
directly. `public.cfg()` is `SECURITY DEFINER` and therefore reads it regardless
of RLS — which is exactly why migration `20260928000700_security_hardening.sql`
revokes `EXECUTE` on `cfg()` from `PUBLIC` as well as from `anon`/`authenticated`.

> Revoking from `anon, authenticated` alone is **not enough**. Postgres grants
> `EXECUTE` on every new function to `PUBLIC` implicitly, and revoking from a
> named role does not remove that grant. Before the fix, any signed-in student
> could call `cfg('service_role_key')` over PostgREST and obtain a key that
> bypasses every RLS policy in the project. `supabase/tests/10_policy_tests.sql`
> asserts this stays revoked — do not remove those assertions.

Check it is working:

```sql
select key, left(value, 12) || '…' from public.app_config;
-- anything that never went out will say why:
select id, template_key, push_sent_at, push_error
  from public.notifications
 where push_error is not null
 order by created_at desc limit 20;
```

---

## Secrets

Set these once per project. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are
injected automatically — do not set them yourself.

```bash
# Required for checkout and the webhook
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...

# Required for the admin email half of spec 3.2
supabase secrets set ADMIN_EMAIL=you@example.com          # comma-separate for several
supabase secrets set RESEND_API_KEY=re_...
```

Optional:

| Secret | Default | What it does |
|---|---|---|
| `EXPO_ACCESS_TOKEN` | — | Sent as the bearer to the Expo Push API. Set it if you have enabled [Expo push security](https://docs.expo.dev/push-notifications/sending-notifications/#additional-security). |
| `STRIPE_PUBLISHABLE_KEY` | — | Returned to the app as `publishableKey`. The app already has its own `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`, so this is belt-and-braces. |
| `STRIPE_API_VERSION` | `2024-06-20` | The `Stripe-Version` stamped on the ephemeral key. Change it if the Payment Sheet reports an API version mismatch. |
| `STRIPE_WEBHOOK_TOLERANCE` | `300` | Seconds of clock skew allowed on a webhook signature. |
| `ADMIN_EMAIL_FROM` | `CampusWash <onboarding@resend.dev>` | Set this to an address on a domain you have verified in Resend before going live. |
| `CONNECT_RETURN_DEEP_LINK` | `bruinwash:///earnings?connect=return` | Where a washer lands after finishing Stripe onboarding. |
| `CONNECT_REFRESH_DEEP_LINK` | `bruinwash:///earnings?connect=refresh` | Where a washer lands if the Stripe link expired. |
| `CONNECT_RETURN_URL` / `CONNECT_REFRESH_URL` | the function's own bounce URL | Override the https URLs handed to Stripe. |
| `ADMIN_NOTIFY_CHAIN` | `on` | Set to `off` to stop `dispatch-push` from chaining to `admin-notify` (use pg_cron instead). |
| `SERVICE_ROLE_KEY` | — | Escape hatch for projects on the newer `sb_secret_...` key format. |

---

## Deploy

```bash
supabase functions deploy dispatch-push
supabase functions deploy create-payment-intent
supabase functions deploy admin-notify

# These two are reached by something that has no Supabase JWT to present:
supabase functions deploy stripe-webhook      --no-verify-jwt
supabase functions deploy connect-onboarding  --no-verify-jwt
```

`--no-verify-jwt` does **not** mean unauthenticated:

- `stripe-webhook` proves authenticity with an HMAC-SHA256 check of the
  `stripe-signature` header against `STRIPE_WEBHOOK_SECRET`, and rejects
  anything it cannot verify with a 400 before reading or writing a thing.
- `connect-onboarding` verifies the caller's JWT itself on the `POST` path. The
  flag exists only so Stripe's hosted flow can redirect a **browser** back to
  the function's `GET ?bounce=…` path, which does nothing but 302 into the app.

`dispatch-push` and `admin-notify` keep `verify_jwt` on *and* guard themselves:
`verify_jwt` only proves a token belongs to this project, so any signed-in
student would otherwise be able to invoke them. They require either the
service-role key (which is how the DB trigger calls in) or an `admin` profile.

### Stripe webhook endpoint

Add the endpoint in the Stripe dashboard (or `stripe listen --forward-to` while
developing) at:

```
https://YOUR-PROJECT-REF.supabase.co/functions/v1/stripe-webhook
```

Subscribe to:

- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `account.updated` — tick **"listen to events on connected accounts"** as well,
  so washer payout readiness updates itself.

---

## What each function does

### `dispatch-push`

Turns the in-app notification feed into device pushes.

Reads `public.notifications` where `push_sent_at is null`, keeps only the rows
whose `data.channels` contains `'push'`, joins `public.push_tokens`, and posts
batches of up to 100 messages to `https://exp.host/--/api/v2/push/send`.

- **Channel-aware.** `order_delivered_washer` is seeded `{in_app}` and is
  therefore never pushed. Those rows are stamped with an explanatory
  `push_error` rather than left behind, so a burst of in-app-only rows cannot
  starve real pushes out of the scan window.
- **Idempotent and concurrency-safe.** `push_sent_at` doubles as the claim: a
  single `update … where push_sent_at is null` is atomic per row, so two
  simultaneous invocations can never claim the same notification. Read
  `push_sent_at` as *dispatch attempted at*; `push_error is null` is what means
  it actually landed. A row that fails keeps its stamp and gains an error, so a
  permanently bad row is attempted exactly once and never loops.
- **Self-cleaning.** An Expo receipt of `DeviceNotRegistered` deletes that row
  from `public.push_tokens`.
- **Payload.** `data: { order_id, template_key, kind, notification_id }` — the
  three keys `NotificationsProvider` deep-links off, plus the row id. `badge` is
  the recipient's unread feed count so the app icon matches `/inbox`.
- Chat pushes arrive here as notification rows with `data.kind === 'chat'`
  (written by the `on_message_notify` trigger) and are delivered like any other.
  Filtering them out of the feed is the app's job, not this function's.

### `create-payment-intent`

`POST { "order_id": "<uuid>" }`, with the caller's `Authorization` header.

**The amount comes from `orders.total_cents`, never from the request body.**
`public.create_order()` already priced the order server-side through
`price_order()`; this function verifies the caller is that order's requester,
that it is not cancelled/paid/refunded, and charges exactly what the row says.

Creates (or reuses) a Stripe Customer and saves `profiles.stripe_customer_id`,
mints an ephemeral key, and creates the PaymentIntent in USD with
`metadata[order_id]`. Saves `orders.stripe_payment_intent_id` and moves the order
to `payment_status = 'processing'`.

Returns the four keys the React Native Payment Sheet expects:

```json
{ "paymentIntent": "pi_…_secret_…", "ephemeralKey": "ek_…", "customer": "cus_…", "publishableKey": "pk_…" }
```

A retry after a cancelled sheet funds the **same** order: the existing intent is
retrieved and reused rather than leaking a new one per tap. If the intent turns
out to have already succeeded (a missed webhook), the order is promoted to `paid`
here as a safety net — the DB trigger only fires on a real `unpaid -> paid`
transition, so doing it twice is harmless.

The order is never marked `paid` by this function on the happy path. That is the
webhook's call, and only the webhook's.

### `stripe-webhook`

Verifies `stripe-signature` by HMAC-SHA256 over `<timestamp>.<raw body>` (done by
hand: `constructEvent()` needs synchronous crypto Deno does not have, and the
async SDK path would still be one more surface to get wrong). Unverified
requests get a 400 and nothing is read or written. Replays outside
`STRIPE_WEBHOOK_TOLERANCE` seconds are rejected.

| Event | Effect |
|---|---|
| `payment_intent.succeeded` | `orders.payment_status = 'paid'` |
| `payment_intent.payment_failed` | `orders.payment_status = 'failed'` |
| `charge.refunded` | `'refunded'` or `'partially_refunded'`, plus `orders.refund_cents` |
| `account.updated` | `profiles.stripe_onboarding_done` for that connected account |

**The `paid` write is the load-bearing one.** That single transition is what
fires the entire "Order placed" fan-out through the `orders_notify` trigger:
the requester's confirmation, every washer in the same building, and the admin.
It is why washers are never offered an order that might not be funded. Every
handler re-reads the order and no-ops when the state already matches, so Stripe's
retries are safe; a transient database error deliberately returns a 5xx so Stripe
retries rather than silently dropping the payment.

### `connect-onboarding`

`POST` with the washer's JWT. Creates a Stripe Connect **Express** account if
`profiles.stripe_account_id` is empty, saves it, then returns a fresh Account
Link:

```json
{ "url": "https://connect.stripe.com/setup/…", "account_id": "acct_…",
  "onboarding_done": false, "charges_enabled": false,
  "details_submitted": false, "payouts_enabled": false }
```

Account Links are single-use and expire within minutes, so one is always minted
fresh and never cached. A washer who has already submitted their details gets an
`account_update` link instead of `account_onboarding`, so "Set up payouts" and
"Manage payouts" can be the same button.

**Two ways status gets refreshed**, because Stripe often finishes verifying
minutes after the washer closes the browser:

1. `POST { "refresh": true }` (or `?refresh=1`) — status only. Re-reads the
   account and stamps `profiles.stripe_onboarding_done` when `charges_enabled`
   **and** `details_submitted` are both true. Returns `url: null`. Every normal
   `POST` also performs this sync on its way through.
2. The `account.updated` branch of `stripe-webhook` — the hands-off path, and the
   reason to tick "listen to events on connected accounts" above.

Both fields are server-managed: `guard_profile_privileges()` rejects any client
that tries to write `stripe_account_id` or `stripe_onboarding_done`; the service
role used here is exempt.

**The redirect bounce.** Stripe requires https return/refresh URLs, so a raw
`bruinwash://` scheme cannot be handed to it. The account link points back at
`GET <this function>?bounce=return|refresh`, which answers with a 302 to the
`bruinwash:///earnings?connect=…` deep link. The app's in-app browser sees the
scheme, closes, and `useConnectOnboarding` re-reads the profile. This is the only
reason the function needs `--no-verify-jwt`.

### `admin-notify`

The **email** half of spec 3.2's "notify the admin on every new order". The push
half already happens — `order_placed_admin` is seeded `{push,email}`, so
`dispatch-push` delivers it to the admin's devices.

Reads the `order_placed_admin` rows out of `public.notifications` and emails
`ADMIN_EMAIL` through Resend. It never writes its own copy: the wording lives in
`public.message_templates` so it can change without a deploy, and the trigger has
already rendered it.

- **Degrades gracefully.** With no `RESEND_API_KEY` or no `ADMIN_EMAIL` it is a
  logged no-op that still returns 200. Nothing else is affected.
- **Claiming without a schema change.** This function does not own the schema and
  `public.notifications` has no email-state column, so the marker lives in the
  row's own jsonb: `data.email_sent_at` is stamped before the send, and
  `data.email_error` records a failure. One attempt per row, no loops.

```sql
-- what has and has not been emailed
select id, created_at, data ->> 'email_sent_at' as emailed, data ->> 'email_error' as error
  from public.notifications
 where template_key = 'order_placed_admin'
 order by created_at desc limit 20;
```

**Scheduling.** `dispatch-push` chains to it whenever it has just handled an
`order_placed_admin` row, so with `RESEND_API_KEY` set the email goes out within
seconds and no scheduler is needed. Set `ADMIN_NOTIFY_CHAIN=off` and use pg_cron
instead if you would rather batch:

```sql
select cron.schedule('admin-notify', '*/5 * * * *', $$
  select net.http_post(
    url     := public.cfg('functions_base_url') || '/admin-notify',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || public.cfg('service_role_key')),
    body    := '{}'::jsonb);
$$);
```

---

### `process-refund`

Turns queued refunds into real Stripe refunds.

`cancel_order()` never claims that money moved — it computes the refund from the
Terms of Service tiers, writes `orders.refund_cents`, and inserts a row into
`public.refunds` with status `pending`. This function is what actually calls
Stripe, and the webhook's `charge.refunded` branch is what finally settles
`orders.payment_status`. The order screen says "Refund on its way" until that
happens, and "Refund issued" afterwards, so the UI never promises money has
landed before it has.

Two properties matter:

- **Claiming.** `status` doubles as the claim: `update ... where status =
  'pending'` is atomic per row, so two concurrent invocations cannot refund the
  same order twice. A row that then fails is marked `failed` with the reason
  rather than retried forever.
- **Idempotency.** Every call carries `Idempotency-Key: refund_<order_id>`, so
  even a retry that races past the claim cannot produce a second refund.

The amount is re-read from the order row under the service role and clamped to
`total_cents` — a queued amount is never trusted to exceed what was charged.

A refund is only ever queued for an order whose `payment_status` is `paid` (or
`partially_refunded`) and which has a `stripe_payment_intent_id`. An order
abandoned at the payment sheet was never charged, so it produces no refund row at
all.

Check the queue:

```sql
select status, count(*) from public.refunds group by status;
-- anything stuck will say why:
select order_id, amount_cents, status, error from public.refunds
 where status in ('pending', 'processing', 'failed');
```

## Local development

```bash
supabase start
supabase functions serve --no-verify-jwt      # all functions, auth off for convenience
stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook
```

Point `app_config.functions_base_url` at `http://host.docker.internal:54321/functions/v1`
so Postgres-in-Docker can reach the local function runtime.

Push notifications need a development build on a physical device
(`eas build --profile development`) — Expo Go has no push token to register, so
`public.push_tokens` stays empty and `dispatch-push` will report
`no registered device`.
