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

## Adversarial review: what it found

After the build, six independent reviewers went at the code across money,
authorization, state machine, messaging, runtime and spec-fidelity, and every
finding was then handed to two skeptics told to refute it. 28 were raised, 20
survived. All 20 are fixed in
`supabase/migrations/20260928000700_security_hardening.sql` and the client, and
each one now has an assertion in the SQL suite (99 → 137).

The two worth understanding:

### A service-role key was readable by any signed-in student (critical)

`revoke all on function public.cfg(text) from anon, authenticated` looks like it
locks the function down. It does not. **Postgres grants `EXECUTE` on every new
function to `PUBLIC` implicitly, and revoking from a named role does not remove
that grant.** So `cfg()` stayed callable over PostgREST, and once the operator
seeded `app_config` to enable push (a required launch step), any student could
call `cfg('service_role_key')` and get a key that bypasses every RLS policy in
the project — read all profiles, mark their own orders paid, read every chat.

The same no-op revoke applied to `price_cents()`, and `enqueue_notification()`
and `kick_push_dispatch()` had never been revoked at all, so anyone could forge a
system notification into another user's feed and push it.

Fixed by denying execute by default (`revoke all on all functions in schema
public from public, anon, authenticated`) and granting back only the RPCs the
client is meant to call. Note the RLS helpers `is_admin()`, `current_role()` and
`my_building_id()` must stay executable, because policy expressions are evaluated
as the querying role.

### Cancellation promised refunds that nothing issued (high)

`cancel_order()` wrote `orders.refund_cents` and the UI said "Refunds land back
on your original payment method" — but no Stripe refund was ever created. It also
computed a refund for orders that were never charged, so abandoning the payment
sheet and then cancelling reported a full refund of money that never moved.

Fixed with a `public.refunds` queue drained by a new `process-refund` Edge
Function, the same pattern `dispatch-push` uses. `cancel_order` only ever queues;
the function calls Stripe with an idempotency key derived from the order id; the
`charge.refunded` webhook settles `payment_status`. The UI now says "Refund on
its way" until Stripe confirms, "Refund issued" after, and "Nothing was charged"
where that is the truth.

### The rest, briefly

- Washers could read `room_number` and `notes` on orders they had not accepted.
  The job board is now a narrow `available_orders` view with no `requester_id`,
  no room number and no notes, and it only lists **paid** orders — previously it
  offered unpaid ones that `accept_order` then refused.
- `messages_update_read` had `with check (true)`, so either party could rewrite
  the other's chat messages in place. Now a column grant limits updates to
  `read_at`.
- Delivery photo proof accepted any non-empty string, so a washer could close a
  delivery and trigger their own payout with no photo. The path must now start
  with the order id **and** match a real object in Storage.
- Avatars were readable by every authenticated user, letting a washer pull the
  requester's photo. Now scoped the same way `washer_cards` is.
- An accepted order cancelled days before pickup was charged the 50% late fee,
  contradicting the policy text in the dialog. The time tier now dominates.
- A promo code was consumed at order creation, so abandoning payment burned a
  single-use code forever. Recorded on the unpaid → paid transition instead.
- A large fixed-value promo could discount the washer's machine-cost
  reimbursement out of the platform's pocket and push the charge under Stripe's
  50¢ minimum. A discount now consumes only the platform's margin.
- Editing the tip after the order was created re-priced the on-screen total while
  Stripe still charged the original. Tip and promo now lock once the order exists.
- A failed profile fetch left a signed-in user on a permanently blank screen.
  There is now an error state with Retry and Sign out.
- Chat's `KeyboardAvoidingView` sat under a native header, so the composer stayed
  partly under the keyboard on iOS. The chat screen draws its own header inside
  the KAV instead.
- The app icon badge counted chat rows that `/inbox` never shows and nothing ever
  marked read, so it could never return to zero.
- Profile setup claimed the room number is "never shared with your washer" while
  prefilling it into every booking. Copy corrected.

## Verification

Everything below is green as of the last commit.

```bash
npx tsc --noEmit                    # app typecheck — 0 errors (typed routes active)
npx expo lint                       # 0 problems
npm run typecheck:functions         # deno check, all 9 Edge Function files
./supabase/tests/run_migrations.sh  # 137 assertions against real Postgres in Docker
npx expo-doctor                     # 21/21 checks pass
npx expo export --platform ios      # bundles: 2376 modules resolve
```

Two of these are worth calling out. `expo export` is the one that proves the app
actually *builds* — a typecheck will happily pass on an import that Metro cannot
resolve. And the typed-route check only has teeth once `.expo/types/router.d.ts`
exists, which `expo start` generates; with it in place, tsc validates every
`href` in the app against the real route tree.

Edge Functions are Deno, not React Native, so they are excluded from the app's
tsconfig (otherwise it reports ~18 false errors: Deno resolves `.ts` imports and
supplies the `Deno` global, neither of which the RN config knows about). They get
their own `deno check`.

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
