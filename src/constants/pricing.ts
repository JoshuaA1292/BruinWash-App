import type { ServiceTier } from '@/types/database';

/**
 * DISPLAY MIRROR ONLY.
 *
 * These values mirror public.pricing_config in the database. The server prices
 * every order via the price_order() RPC and create_order() ignores anything the
 * client computes. Use these for optimistic UI only; if the two ever disagree,
 * the server is right. Never send a client-computed total to checkout.
 */
export const PRICING = {
  serviceFeeCents: { standard: 999, full: 1499 },
  machineCostCents: 250,
  addonDetergentPodsCents: 50,
  addonGlovesCents: 50,
  processingRate: 0.029,
  processingFlatCents: 30,
  liabilityCapCents: 2500,
} as const;

export const TIERS: ReadonlyArray<{
  id: ServiceTier;
  name: string;
  tagline: string;
  includes: string;
  popular: boolean;
}> = [
  {
    id: 'standard',
    name: 'Wash & Dry',
    tagline: "Perfect if you don't mind a quick fold",
    includes: 'Wash and machine dry',
    popular: false,
  },
  {
    id: 'full',
    name: 'Wash, Dry & Fold',
    tagline: "Sit back — we've got you",
    includes: 'Wash, machine dry, and fold',
    popular: true,
  },
];

/** Quick-select tip percentages from spec 2.4. */
export const TIP_PERCENTS = [15, 18, 20, 25] as const;

/** Default wash settings shown on the checkout summary: "Normal • Warm • Medium". */
export const DEFAULT_WASH_SETTINGS = {
  cycle: 'Normal',
  temp: 'Warm',
  level: 'Medium',
} as const;

export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

/** Optimistic mirror of the server's price_order(). Display only. */
export function quoteLocally(opts: {
  tier: ServiceTier;
  loads?: number;
  pods?: boolean;
  gloves?: boolean;
  tipCents?: number;
  discountCents?: number;
}) {
  const loads = Math.max(opts.loads ?? 1, 1);
  const serviceFeeCents = PRICING.serviceFeeCents[opts.tier] * loads;
  const machineCostCents = PRICING.machineCostCents * loads;
  const addonsCents =
    (opts.pods ? PRICING.addonDetergentPodsCents * loads : 0) +
    (opts.gloves ? PRICING.addonGlovesCents : 0);

  const base = serviceFeeCents + machineCostCents + addonsCents;
  const discountCents = Math.min(opts.discountCents ?? 0, base);
  const subtotalCents = Math.max(base - discountCents, 0);
  const tipCents = Math.max(opts.tipCents ?? 0, 0);
  const processingFeeCents =
    Math.round((subtotalCents + tipCents) * PRICING.processingRate) + PRICING.processingFlatCents;

  return {
    serviceFeeCents,
    machineCostCents,
    addonsCents,
    discountCents,
    subtotalCents,
    tipCents,
    processingFeeCents,
    totalCents: subtotalCents + tipCents + processingFeeCents,
    /** The Schedule CTA figure: "Continue to Checkout · $17.49" for Full. */
    ctaCents: base,
  };
}
