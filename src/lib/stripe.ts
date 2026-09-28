/**
 * Optional access to the Stripe native SDK.
 *
 * @stripe/stripe-react-native needs a native module that does NOT exist in Expo
 * Go or on web. A top-level import therefore throws before any of our code runs,
 * taking the whole app down — even though checkout has a perfectly good preview
 * path for when Stripe is unconfigured.
 *
 * So the module is required defensively here, once, and the rest of the app asks
 * this file whether Stripe is actually usable.
 */

type StripeModule = typeof import('@stripe/stripe-react-native');

let loaded: StripeModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  loaded = require('@stripe/stripe-react-native') as StripeModule;
} catch {
  loaded = null;
}

export const stripeModule = loaded;

/**
 * True only in a native build that actually bundled a working Stripe module.
 * On web, metro.config.js resolves the package to an EMPTY module, so require()
 * succeeds but hands back an object with no hooks — check for the hook itself
 * rather than merely a non-null module.
 */
export const stripeNativeAvailable = typeof loaded?.useStripe === 'function';

interface PaymentSheetApi {
  initPaymentSheet?: StripeModule['useStripe'] extends () => infer R
    ? R extends { initPaymentSheet: infer F }
      ? F
      : undefined
    : undefined;
  presentPaymentSheet?: StripeModule['useStripe'] extends () => infer R
    ? R extends { presentPaymentSheet: infer F }
      ? F
      : undefined
    : undefined;
}

/**
 * A hook with a STABLE identity whether or not Stripe loaded, so React's hook
 * order never changes between renders. When Stripe is absent it returns an empty
 * API and checkout falls through to its preview path.
 */
export const useStripeSafe: () => PaymentSheetApi = stripeNativeAvailable
  ? (loaded as StripeModule).useStripe
  : () => ({ initPaymentSheet: undefined, presentPaymentSheet: undefined });
