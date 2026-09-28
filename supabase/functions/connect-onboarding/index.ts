/**
 * connect-onboarding — Stripe Connect Express onboarding for washers.
 *
 * DEPLOY WITH verify_jwt DISABLED:
 *   supabase functions deploy connect-onboarding --no-verify-jwt
 * Not because it is unauthenticated — the POST path verifies the caller's JWT
 * itself, exactly as if verify_jwt were on — but because Stripe's hosted flow
 * redirects a *browser* back to this function's GET path, and that browser has
 * no Supabase JWT to present. See "the bounce" below.
 *
 * POST (from the app, Authorization: Bearer <user token>)
 *   - creates a Connect Express account if the profile has none, saves
 *     profiles.stripe_account_id
 *   - reads the account's live status and stamps profiles.stripe_onboarding_done
 *     when charges_enabled AND details_submitted are both true
 *   - returns { url } — an Account Link the app opens in a web browser
 *   POST { "refresh": true } (or ?refresh=1) is status-only: it re-reads the
 *   account and syncs stripe_onboarding_done without minting a new link. The
 *   other refresh path is the account.updated branch in stripe-webhook, which
 *   catches verification that completes minutes after the washer closes the
 *   browser.
 *
 * THE BOUNCE. Stripe requires https return/refresh URLs, so a raw
 * bruinwash:// scheme cannot be handed to it. Instead the account link points
 * back at GET <this function>?bounce=return|refresh, which answers with a 302 to
 * the bruinwash:// deep link. The app's in-app browser sees the scheme and
 * closes, landing the washer back on the earnings screen. Override either end
 * with CONNECT_RETURN_DEEP_LINK / CONNECT_REFRESH_DEEP_LINK.
 *
 * profiles.stripe_account_id and stripe_onboarding_done are server-managed:
 * guard_profile_privileges() rejects a client that tries to write either, and
 * the service role used here is exempt.
 */
import { preflight, json, fail, redirect } from '../_shared/cors.ts';
import {
  HttpError,
  env,
  errorResponse,
  readJson,
  requireCaller,
  serviceClient,
  supabaseUrl,
} from '../_shared/supabase.ts';
import { type StripeAccount, type StripeAccountLink, stripeRequest } from '../_shared/stripe.ts';

interface ProfileRow {
  id: string;
  role: string;
  first_name: string | null;
  last_name: string | null;
  edu_email: string | null;
  stripe_account_id: string | null;
  stripe_onboarding_done: boolean;
}

/** Where the washer lands in the app after leaving Stripe's flow. */
function deepLink(kind: 'return' | 'refresh'): string {
  return kind === 'return'
    ? (env('CONNECT_RETURN_DEEP_LINK', 'bruinwash:///earnings?connect=return') as string)
    : (env('CONNECT_REFRESH_DEEP_LINK', 'bruinwash:///earnings?connect=refresh') as string);
}

/** The https URL handed to Stripe, which 302s to the deep link above. */
function bounceUrl(kind: 'return' | 'refresh'): string {
  const override = env(kind === 'return' ? 'CONNECT_RETURN_URL' : 'CONNECT_REFRESH_URL');
  if (override) return override;
  return `${supabaseUrl()}/functions/v1/connect-onboarding?bounce=${kind}`;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    const url = new URL(req.url);
    const bounce = url.searchParams.get('bounce');

    // ------------------------------------------------------- the bounce -----
    // Public by design: it carries no data, reads nothing, and only ever answers
    // with a redirect into the app.
    if (bounce === 'return' || bounce === 'refresh') {
      return redirect(deepLink(bounce));
    }

    if (req.method !== 'POST') return fail('Method not allowed.', 405);

    const admin = serviceClient();
    const caller = await requireCaller(req, admin);

    const body = await readJson<{ refresh?: unknown }>(req);
    const refreshOnly = body.refresh === true || url.searchParams.get('refresh') === '1';

    const { data: profileData, error: profileError } = await admin
      .from('profiles')
      .select('id, role, first_name, last_name, edu_email, stripe_account_id, stripe_onboarding_done')
      .eq('id', caller.id)
      .maybeSingle();
    if (profileError) throw new Error(`reading profile: ${profileError.message}`);

    const profile = profileData as ProfileRow | null;
    if (!profile) throw new HttpError('Finish setting up your profile first.', 404);
    if (profile.role !== 'washer') {
      throw new HttpError('Only washers need a payout account.', 403);
    }

    // ------------------------------------------------- the Connect account ---
    let accountId = profile.stripe_account_id;

    if (!accountId) {
      if (refreshOnly) {
        return json({
          url: null,
          account_id: null,
          onboarding_done: false,
          charges_enabled: false,
          details_submitted: false,
          payouts_enabled: false,
        });
      }

      const accountEmail = profile.edu_email ?? caller.email;
      const created = await stripeRequest<StripeAccount>('/v1/accounts', {
        body: {
          type: 'express',
          country: 'US',
          business_type: 'individual',
          ...(accountEmail ? { email: accountEmail } : {}),
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true },
          },
          business_profile: {
            product_description: 'Peer-to-peer laundry pickup and delivery on campus',
          },
          individual: {
            ...(profile.first_name ? { first_name: profile.first_name } : {}),
            ...(profile.last_name ? { last_name: profile.last_name } : {}),
          },
          metadata: { supabase_user_id: caller.id },
        },
        // One Express account per washer even if they double-tap the button.
        idempotencyKey: `bw_acct_${caller.id}`,
      });
      accountId = created.id;

      const { error } = await admin
        .from('profiles')
        .update({ stripe_account_id: accountId })
        .eq('id', caller.id);
      if (error) throw new Error(`saving stripe_account_id: ${error.message}`);
    }

    // --------------------------------------------------- status refresh -----
    let account: StripeAccount | null = null;
    try {
      account = await stripeRequest<StripeAccount>(`/v1/accounts/${accountId}`, {
        method: 'GET',
      });
    } catch (e) {
      console.warn('[connect] could not read account status:', (e as Error).message);
    }

    const chargesEnabled = account?.charges_enabled === true;
    const detailsSubmitted = account?.details_submitted === true;
    const payoutsEnabled = account?.payouts_enabled === true;
    const onboardingDone = chargesEnabled && detailsSubmitted;

    if (account && onboardingDone !== profile.stripe_onboarding_done) {
      const { error } = await admin
        .from('profiles')
        .update({ stripe_onboarding_done: onboardingDone })
        .eq('id', caller.id);
      if (error) console.error('[connect] could not save onboarding state:', error.message);
    }

    if (refreshOnly) {
      return json({
        url: null,
        account_id: accountId,
        onboarding_done: onboardingDone,
        charges_enabled: chargesEnabled,
        details_submitted: detailsSubmitted,
        payouts_enabled: payoutsEnabled,
      });
    }

    // ------------------------------------------------------- account link ----
    // A washer who has already submitted their details gets the update form
    // rather than the sign-up flow, so "Manage payouts" and "Set up payouts" can
    // be the same button. Account Links are single-use and expire in minutes, so
    // one is always minted fresh here; they are never cached.
    const link = await stripeRequest<StripeAccountLink>('/v1/account_links', {
      body: {
        account: accountId,
        refresh_url: bounceUrl('refresh'),
        return_url: bounceUrl('return'),
        type: detailsSubmitted ? 'account_update' : 'account_onboarding',
        ...(detailsSubmitted ? {} : { collection_options: { fields: 'currently_due' } }),
      },
    });

    if (!link?.url) {
      throw new HttpError('Stripe onboarding is unavailable right now. Please try again.', 502);
    }

    return json({
      url: link.url,
      account_id: accountId,
      onboarding_done: onboardingDone,
      charges_enabled: chargesEnabled,
      details_submitted: detailsSubmitted,
      payouts_enabled: payoutsEnabled,
    });
  } catch (e) {
    return errorResponse(e, (message, status) => fail(message, status));
  }
});
