# Running the BruinWash demo

A fully working demo: real authentication, real Postgres with real RLS, real
Supabase Realtime. The only thing simulated is the Stripe card charge, because
there are no Stripe keys yet.

## What's already running

If this session is still alive, both servers are up and you can skip to
**Try it**. Otherwise:

```bash
npx supabase start                  # Postgres, auth, storage, realtime (Docker)
./supabase/demo/reset_demo.sh       # migrations + demo accounts
npx expo start                      # the app
```

`npx supabase start` prints the local keys. If they differ from `.env`, update
`EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — and keep
the URL as this machine's **LAN IP**, not `127.0.0.1`, or a phone cannot reach it.

## Accounts

Password for every account: **`demo1234`**

| Email | Role | What it shows |
|---|---|---|
| `demo.requester@ucla.edu` | Requester | Booking, checkout, live order status, the washer card, rating |
| `demo.washer@ucla.edu` | Washer | Job board, accept, the 6-stage pipeline, photo proof, earnings |
| `demo.washer2@ucla.edu` | Washer | Second washer in the same building — use for the accept race |
| `demo.admin@ucla.edu` | Admin | Order dashboard, and the admin new-order alert |

All four live in **Dykstra Hall**, so same-building matching lines up. Promo code
**`DEMO20`** gives 20% off at checkout.

You can also sign up fresh — the `.edu` gate is live, so a `@gmail.com` address is
genuinely rejected by the database, not just the form.

## Try it

**The main flow.** Sign in as the requester. You get the onboarding carousel
first (it only appears once). Then Schedule a pickup → pick Dykstra, a floor, a
time, choose Wash/Dry/Fold, scroll the amber liability box and tick the box — the
CTA stays disabled until you do — and it reads **Continue to Checkout · $17.49**.
In checkout, try `DEMO20`, add a tip, then pay. With no Stripe key this runs the
preview path: the order is created for real and a demo trigger marks it paid,
standing in for the Stripe webhook.

**Watch it come alive.** Open the washer account in a second window (or a phone
alongside the laptop). The job appears on the washer's board immediately — that
is Supabase Realtime, not polling. Accept it, and the requester's screen updates
live with the Uber-style washer card: first name, star rating, completed orders.

**The interesting parts to poke at:**

- **The accept race.** Have `demo.washer` and `demo.washer2` both open the job
  board and tap Accept at the same time. One wins; the other gets
  *"This order has already been accepted by another washer."* The database
  serialises it with a row lock, so there is no window where both succeed.
- **One-way visibility.** The requester sees the washer's first name, photo and
  rating. The washer never sees who the requester is — the chat header just says
  "Your customer". That is enforced by RLS, not by the UI hiding it.
- **The narrow job board.** Before accepting, the washer cannot read the room
  number or the notes at all. Those columns are not in the view they query.
- **Photo proof.** As the washer, try Mark Delivered. It refuses until you
  actually take a photo, and the server checks the uploaded file really exists.
- **Two message surfaces.** The automated messages land in the notification
  inbox; the chat thread stays clean. They never mix.
- **Cancellation.** Cancel more than 2 hours before pickup for a full refund,
  inside 2 hours for 50%. The wording tracks the real state of the money: it says
  "on its way", not "issued", until Stripe would have confirmed.

## What is simulated, and what is not

**Not simulated** — real: `.edu` signup and email verification logic, every RLS
boundary, all pricing (computed server-side by `price_order`), the full order
state machine, the 7 automated messages with their exact spec copy, Realtime,
same-building matching, the accept race, reviews and ratings, earnings.

**Simulated** — the card charge. There is no Stripe key, so checkout runs its
preview path and a local-only trigger (`supabase/demo/seed_demo.sql`) marks the
order paid. In production that transition comes from the `stripe-webhook`
function. The trigger exists **only** in the demo seed, never in a migration, so
it cannot reach production.

**Not exercised at all** — push notifications and Apple/Google Pay. Both need a
native build and a physical device (see below). The in-app notification feed
works fully; only the OS-level push does not.

## Phone vs browser

**Browser** (easiest): press `w` in the Expo terminal, or open the localhost URL
it prints. Everything above works.

**Phone with Expo Go**: scan the QR code. Two caveats worth knowing before you
judge anything broken:

1. The Stripe native module is not in Expo Go, so checkout runs the preview path.
   That is the same path the browser takes, and it is deliberate — see
   `src/lib/stripe.ts` and `metro.config.js`.
2. Remote push notifications do not work in Expo Go. For those you need a
   development build: `npx expo run:ios` (needs Xcode) or
   `npx eas-cli@latest build --profile development`.

Your phone must be on the **same Wi-Fi** as this machine, since it talks to
Supabase at the LAN address in `.env`.

## Checking your work

```bash
python3 supabase/demo/e2e_smoke.py   # 35 assertions against the LIVE local stack
./supabase/demo/reset_demo.sh        # back to a clean demo
```

The smoke test drives real sign-in, RLS as the real `authenticated` role, the
RPCs and the notification triggers. It mutates the demo database, so reset after.
