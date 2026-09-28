This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

---

# BruinWash — project conventions

Mobile client for CampusWash (live at campuswash.app). The mobile app is a
faithful translation of the web product, not a redesign.

## Non-negotiables

1. **The database is authoritative for money.** Never compute a total on the
   client and send it to the server. Call the `price_order` RPC. The helpers in
   `src/constants/pricing.ts` are for optimistic display only.
2. **All order mutations go through RPCs.** `authenticated` has no INSERT/UPDATE
   on `orders` or `reviews`. Use `create_order`, `accept_order`,
   `set_washer_en_route`, `advance_order_status`, `cancel_order`, `submit_review`.
3. **One-way visibility.** A requester may read the assigned washer's card from
   the `washer_cards` view (first name only). A washer must never see requester
   identity. Do not query `profiles` for anyone but the signed-in user.
4. **Automated copy is never chat.** The seven system messages live in
   `public.message_templates` and surface in `public.notifications`. The manual
   chat thread is `public.messages`. Never mix them. Feed UI must filter out
   rows where `data.kind === 'chat'`.
5. **Same-building matching.** Washers only ever see pending orders in their own
   building; RLS enforces it, so just query `orders` and trust it.
6. **Cents, always.** Currency is integer cents named `*_cents`. No floats.

## Conventions

- Imports use the `@/` alias for `src/` (`@/components/ui`, `@/theme`).
- Use the UI kit in `src/components/ui` — `Button`, `Card`, `Screen`, `Field`,
  `Checkbox`, `Stars`, `Banner`, `Text`. Do not add a second button component.
- Style with `StyleSheet.create` and tokens from `@/theme`. No inline hex codes,
  no magic numbers where a spacing token exists.
- Data fetching uses `@tanstack/react-query`; hooks live in `src/hooks/`.
- Surface errors with `friendlyError()` from `@/lib/errors`.
- Every interactive element needs an `accessibilityRole` and label.
- Routes are expo-router files under `app/`. Typed routes are on, so a bad
  `href` is a type error.

## Verify before you finish

```bash
npx tsc --noEmit                    # must pass clean
./supabase/tests/run_migrations.sh  # 137 assertions, must all pass
```

If you change anything under `supabase/migrations/`, add an assertion to
`supabase/tests/10_policy_tests.sql` covering it.
