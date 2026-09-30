# Testing BruinWash — a walkthrough

Every feature below is really working: real auth, real Postgres with real
row-level security, real Supabase Realtime. Only the card charge is simulated
(no Stripe keys yet).

## Get in

**Phone (Expo Go)** — sign into Expo Go with the same account as the computer
(`jp12345`), and the project appears under **"Development servers"** on Expo Go's
home screen. Tap it. Or enter the URL manually:

```
exp://qt8kgiq-jp12345-8081.exp.direct
```

**Computer (browser)** — press `w` in the Expo terminal, or open
http://localhost:8081. Fastest way to poke around, and it's how you run two
roles side by side.

## Accounts — password is `demo1234` for all

| Email | Role |
|---|---|
| `demo.requester@ucla.edu` | Requester |
| `demo.washer@ucla.edu` | Washer |
| `demo.washer2@ucla.edu` | Second washer (same building) |
| `demo.admin@ucla.edu` | Admin |

All four live in **Dykstra Hall**. Promo code **`DEMO20`** = 20% off.

> Best setup: **requester on your phone, washer in a browser window.** Most of
> what makes this app interesting is what happens between two people.

---

## 1. Signup and the .edu gate

Sign out, tap **Get your laundry done**, and try to register with a
`@gmail.com` address. It is rejected — and not by the form. The database trigger
`handle_new_user()` raises on any non-`.edu` address, so the rule holds even if
someone bypasses the app entirely.

Then try a real one, e.g. `you@ucla.edu`. Note the **two separate signup flows**:
"Get your laundry done" creates a requester, "Become a washer" creates a washer.

## 2. Onboarding tour

First login shows the full-screen carousel: 'Schedule a Wash' then
"You're All Set!", with Back/Next and dot progress. Swipe between them. Finish
it, then force-quit and reopen — **it must not come back.** That flag lives on
your profile row, not in local storage.

## 3. Schedule a pickup

Tap **Schedule**. Check each of these:

- Building dropdown (defaults to your profile's building), Floor, and Room
  Number marked optional
- The date/time picker is the **native** iOS/Android one, not a web imitation
- Toggle **Standard** vs **Full** — the price moves
- Scroll the **amber liability box**. It scrolls inside itself.
- The CTA is **disabled** until you tick the acknowledgement checkbox
- With Full + 1 load it reads exactly **Continue to Checkout · $17.49**
  ($14.99 service + $2.50 machine)
- Try a past pickup time — refused

## 4. Checkout

It opens as a **bottom sheet**, not a browser redirect.

- Order summary shows the service fee, the machine cost, and the wash settings
  line **Normal • Warm • Medium**
- Apply **`DEMO20`** → 20% comes off. Then try `GARBAGE` → the error reads
  exactly *"Invalid or ineligible promo code."*
- Tip quick-picks 15 / 18 / 20 / 25% plus Custom
- Subtotal, Processing fee (2.9% + $0.30), Total

Pay. With no Stripe key this runs the **preview path**: the order is created for
real and a demo trigger marks it paid, standing in for the Stripe webhook.

**Worth trying:** pay, dismiss the sheet, then try to change the tip. The tip and
promo **lock** once the order exists, and a banner explains why. Before that was
fixed, the screen re-priced while Stripe still charged the original amount.

## 5. Watch it go live

With the washer open in the other window: the job appears on their board
**immediately**. No refresh, no pull-down — that is Supabase Realtime.

Accept it. The requester's screen updates live with the **washer card**: first
name large, photo circle, star rating, completed-order count. It should show
**★ 5.0** and 2 completed orders from the seeded history.

## 6. The interesting boundaries

These are the ones worth actually poking, because they are enforced by the
database rather than by the UI hiding things.

**The accept race.** Open the job board as `demo.washer` AND `demo.washer2` at
once. Tap Accept simultaneously. One wins; the other gets *"This order has
already been accepted by another washer."* A row lock serialises them, so there
is no window where both succeed.

**One-way visibility.** The requester sees the washer's first name, photo and
rating. Open the chat as the **washer** — the other party is just
**"Your customer."** No name, ever.

**The narrow job board.** Before accepting, the washer cannot see the room number
or your notes at all. Those columns are not in the view they query.

**Same-building matching.** The washers are all in Dykstra. A washer in another
building sees nothing.

**Photo proof.** As the washer, run the pipeline: I'm on my way → Picked Up →
Washing → Out for Delivery → **Mark Delivered**. It demands a camera photo and
refuses without one. The server also verifies the uploaded file really exists, so
a faked path is rejected.

**Two message surfaces.** Automated messages land in the **notification inbox**.
The chat thread stays clean. They never mix.

## 7. Notifications

Open the inbox as the requester. You should see, in the exact spec wording:

- *"Your order is confirmed! We're finding a Washer in your building..."*
- *"[Washer] has accepted your order and will pick up your laundry at..."*
- *"[Washer] is on the way to pick up your laundry. Make sure your bag is ready!"*
- *"Your laundry has been delivered! How did [Washer] do? Tap to leave a rating."*

Sign in as `demo.admin@ucla.edu` — the admin gets a new-order alert too, and the
dashboard lists every order with building, tier, time, status and total.

## 8. Rating

After delivery, tap the rating prompt. 1–5 stars plus an optional review. Submit,
then look at the washer card again — the aggregate score moved.

## 9. Cancellation and refunds

Book a new order and cancel it **more than 2 hours** before pickup → full refund.
Book another with pickup **inside 2 hours** → 50% retained, matching the live
Terms of Service.

Read the wording carefully: it says **"Refund on its way"**, not "issued", until
Stripe would have confirmed. And an order you never actually paid for says
**"Nothing was charged"** rather than promising money back.

## 10. Washer earnings

As the washer: **Earnings** shows pending and paid balances plus payout history,
credited automatically when an order is delivered.

---

## What is NOT real

- **The card charge.** No Stripe key, so checkout runs its preview path and a
  local-only trigger marks the order paid. In production that transition comes
  from the `stripe-webhook` function. The trigger exists only in
  `supabase/demo/seed_demo.sql`, never in a migration.
- **OS-level push notifications** and Apple/Google Pay. Both need a native build
  on a physical device (`npx expo run:ios`). The in-app notification feed works
  fully; only the lock-screen banner does not.

## Reset

```bash
./supabase/demo/reset_demo.sh        # clean slate, fresh demo accounts
python3 supabase/demo/e2e_smoke.py   # 35 assertions against the live stack
```

## If something looks broken

The tunnels change URL every restart, and `EXPO_PUBLIC_*` values are baked into
the bundle at build time — so a stale Supabase URL shows up as an app that loads
but cannot read data. Check that `EXPO_PUBLIC_SUPABASE_URL` in `.env` matches the
live `cloudflared` URL, then restart with `npx expo start --tunnel --clear`.
