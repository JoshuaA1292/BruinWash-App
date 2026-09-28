/**
 * One shape for every figure the checkout sheet prints, so the UI never has to
 * care whether a number arrived from the price_order RPC or from the local
 * display mirror.
 *
 * `authoritative` is the important field: only a server quote may fund a
 * payment, so the Pay button stays disabled until it is true.
 */
import { PRICING, quoteLocally } from '@/constants/pricing';
import type { PriceQuote, ServiceTier } from '@/types/database';

export interface CheckoutFigures {
  serviceFeeCents: number;
  machineCostCents: number;
  addonsCents: number;
  discountCents: number;
  subtotalCents: number;
  tipCents: number;
  processingFeeCents: number;
  totalCents: number;
  /** service + machine + add-ons, before any discount. What a promo applies to. */
  baseCents: number;
  promoCode: string | null;
  /** True when these came from price_order(). */
  authoritative: boolean;
}

export function figuresFromQuote(quote: PriceQuote, authoritative: boolean): CheckoutFigures {
  return {
    serviceFeeCents: quote.service_fee_cents,
    machineCostCents: quote.machine_cost_cents,
    addonsCents: quote.addons_cents,
    discountCents: quote.discount_cents,
    subtotalCents: quote.subtotal_cents,
    tipCents: quote.tip_cents,
    processingFeeCents: quote.processing_fee_cents,
    totalCents: quote.total_cents,
    baseCents: quote.cta_cents,
    promoCode: quote.promo_code,
    authoritative,
  };
}

/** Optimistic placeholder used only until the first server quote lands. */
export function figuresFromMirror(opts: {
  tier: ServiceTier;
  loads: number;
  pods: boolean;
  gloves: boolean;
  tipCents: number;
  discountCents: number;
  promoCode: string | null;
}): CheckoutFigures {
  const local = quoteLocally(opts);
  return {
    serviceFeeCents: local.serviceFeeCents,
    machineCostCents: local.machineCostCents,
    addonsCents: local.addonsCents,
    discountCents: local.discountCents,
    subtotalCents: local.subtotalCents,
    tipCents: local.tipCents,
    processingFeeCents: local.processingFeeCents,
    totalCents: local.totalCents,
    baseCents: local.ctaCents,
    promoCode: opts.promoCode,
    authoritative: false,
  };
}

/** The per-load service fee, for the "$14.99 per load" sublabel. */
export function serviceFeePerLoadCents(tier: ServiceTier): number {
  return PRICING.serviceFeeCents[tier];
}
