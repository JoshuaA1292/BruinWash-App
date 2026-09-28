# BruinWash — build notes, decisions, and open questions

Written for: whoever picks this codebase up next (and Josh, for the calls that
need a product decision).

I could not log into campuswash.app, so I used the public pages as source of
truth: the homepage, `/manifest.json`, `/terms`, `/privacy`, and `/safety`. The
authenticated `/schedule` and `/dashboard` flows came from the product spec.
Everything below is either a confirmed fact from the live site or a decision I
had to make where the two disagreed.

---

## Confirmed from the live site

| Thing | Value | Source |
|---|---|---|
| Brand primary | `#005581` (deep navy-teal) | `manifest.json` `theme_color`, also `<meta name="theme-color">` |
| Background | `#ffffff` | `manifest.json` |
| Web stack | Next.js | `/_next/` asset paths |
| Standard tier | **Wash & Dry — $9.99/load** | homepage pricing |
| Full tier | **Wash, Dry & Fold — $14.99/load** ("Most popular") | homepage pricing |
| Machine cost | not included in the tier price | homepage: "Price does not include what you'd pay at the washing machines" |
| Add-ons | Detergent pods $0.50/load, Gloves $0.50 | homepage footnote |
| Washer earnings | $7–$11/load, up to $33/hr | homepage |
| Cancellation tiers | >2h = 100%, <2h = 50%, after pickup = 50%, after washing = 0% | `/terms` §11 |
| Female-washer preference | requesters may request female washers only | `/safety` §5 |
| Handoff point | **end of the hall, not your door** | homepage FAQ |
| Privacy rule | full names and room numbers are never shared | `/safety` §3 |

The spec's `$17.49` checkout CTA reconciles exactly: `$14.99 service + $2.50
machine = $17.49`. That confirmed the pricing model, so Standard works out to
`$9.99 + $2.50 = $12.49`. Both figures are asserted in the test suite.

---

## Where the spec and the live product disagree

These are the real decisions. I implemented the spec (it governs the mobile
build) but made each one configurable, and flagged them here rather than
silently picking a side.

### 1. Liability cap: $25 vs $100 — needs your call

- **Spec 2.3 / 2.7:** "$25 maximum liability cap disclosed at booking."
- **Live `/terms` §12 and §14:** recommends capping at "the greater of $100 or
  the total fees paid by the User in the last 3 months," with a comparison table.

These are materially different promises to a user, and the booking disclosure is
the legally load-bearing one. **I implemented $25** per the spec, stored as
`pricing_config.liability_cap` in the database and stamped onto every order as
`orders.liability_cap_cents` at booking time — so the figure a user agreed to is
preserved historically even if the policy later changes.

> **Action for Josh:** confirm $25 is current, or update the
> `pricing_config.liability_cap` row. If the live Terms are authoritative, the
> Terms page and the booking disclosure need to be reconciled with each other
> regardless of what the app does. Worth a look before launch.

### 2. Washer payouts: Stripe Connect vs Venmo/PayPal/Zelle

- **Spec:** Stripe Connect onboarding and payouts (P0).
- **Live homepage:** "Withdraw to Venmo, PayPal, or Zelle."

I built **Stripe Connect** per the spec (Express accounts, account links,
`payouts` table, earnings dashboard). If the live product genuinely pays out by
Venmo/Zelle today, the mobile earnings screen will show a balance that settles
through a different rail than the web app implies, which will confuse washers.
Flagging as a product inconsistency rather than a code bug.

### 3. "Washer on the way" is not a pipeline stage

Spec 3.2 requires a "Washer on the way to pick up your laundry" message, but the
6-stage pipeline (2.5) has no such stage — it goes Accepted → Picked Up.

I added an explicit washer action ("I'm on my way") that stamps
`orders.en_route_at` and fires the message, leaving the 6 stages exactly as
specified. The washer taps it between accepting and picking up.

### 4. Room number vs the end-of-hall handoff

Spec 2.3 includes an optional Room Number field, while the live site says pickup
happens at the end of the hall specifically so room numbers stay private. I kept
the field (optional, as specified) but the room number is only ever visible on
the order to the assigned washer — never in any notification, and never through
the washer card.

### 5. Messages the spec does not give copy for

Spec 3.3 promises requesters "order lifecycle updates (accepted, picked up,
delivered)" but §3.2 only supplies copy for 7 triggers, which omits picked-up.
I seeded four extra templates — picked up, out for delivery, and cancelled for
both parties — marked `[ADDED]` in
`supabase/migrations/20260928000500_seed.sql`. The seven spec messages are marked
`[SPEC]` and are verbatim; the test suite asserts their exact wording so nobody
can reword them by accident.

---

## Security decisions worth knowing about

I tightened several things beyond what the spec describes, because the obvious
implementation had holes:

1. **Clients cannot write to `orders` or `reviews` at all.** RLS cannot restrict
   individual columns, so any policy permissive enough to let a requester edit
   their pending order would also let them set `payment_status = 'paid'` or
   `total_cents = 0`. All mutations go through `SECURITY DEFINER` RPCs that price
   the order server-side. Asserted by tests.
2. **`accept_order` takes a row lock.** Two washers tapping Accept simultaneously
   is a real race — the spec even leans on it ("accept before someone else
   does"). The loser gets a clear message instead of a corrupted order.
3. **A profile trigger blocks self-promotion.** Without it, `profiles_update_self`
   would let any user PATCH their own row to `role = 'admin'`, or attach someone
   else's Stripe account. Asserted by tests.
4. **Order placement notifications fire on payment, not insert.** Otherwise
   washers get alerted to orders that may never be funded.
5. **Storage buckets are private** with policies keyed on the order id being the
   first path segment, so a washer cannot upload proof against someone else's
   order.
6. **The washer card is a row-limited view.** A requester can only see cards for
   washers actually assigned to their own orders — not browse the washer roster.

---

## Verification

```bash
npx tsc --noEmit                    # typecheck
./supabase/tests/run_migrations.sh  # 99 assertions against real Postgres in Docker
```

The SQL test harness (`supabase/tests/`) stands up a throwaway Postgres 17
container, stubs the parts of Supabase the migrations depend on (`auth.uid()`,
the `storage` schema, `pg_net`), applies every migration, and then asserts
behaviour — the .edu gate, the pricing arithmetic, RLS boundaries in both
directions, the notification fan-out and its exact copy, pipeline legality,
photo-proof enforcement, refund tiers, and the female-washer preference.

It is not a substitute for testing against the real project, because the live
Supabase instance has its own existing schema. **Before applying these
migrations to production, diff them against what is already there** — they are
written to be additive and mostly idempotent, but the live project may already
have `profiles` and `orders` tables with different shapes.

---

## Still to do before this ships

- [ ] Fill in `.env` (see `.env.example`) — Supabase URL, publishable key, Stripe key.
- [ ] Reconcile the migrations against the live Supabase schema.
- [ ] Insert the two `app_config` rows so the DB trigger can reach the push
      function (`functions_base_url`, `service_role_key`) — see
      `supabase/functions/README.md`.
- [ ] Set Edge Function secrets: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
      `ADMIN_EMAIL`, optionally `RESEND_API_KEY`.
- [ ] Replace the placeholder EAS `projectId` in `app.json`.
- [ ] Reconcile the seeded UCLA building list against the live building dropdown.
- [ ] Push notifications need a development build, not Expo Go
      (`eas build --profile development`), and a physical device.
- [ ] Resolve the liability cap question in §1 above.
