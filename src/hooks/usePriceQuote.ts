import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { PRICING, quoteLocally } from '@/constants/pricing';
import type { PriceQuote, ServiceTier } from '@/types/database';

/**
 * Server-authoritative pricing.
 *
 * public.price_order() is the single source of truth for money (see
 * supabase/migrations/20260928000600_create_order_and_guards.sql). This hook
 * never sends a computed total anywhere — it asks the server what an order
 * would cost and renders the answer. quoteLocally() is used ONLY as
 * placeholder data so the CTA figure does not flicker while the RPC is in
 * flight; the moment the server answers, the server wins.
 *
 * Shared surface: both Schedule (spec 2.3) and Checkout (spec 2.4) call this.
 */
export interface PriceQuoteInput {
  tier: ServiceTier;
  loads?: number;
  pods?: boolean;
  gloves?: boolean;
  /** Only Checkout sets a tip; Schedule quotes pre-tip. */
  tipCents?: number;
  promoCode?: string | null;
  /** Set false to hold the request (e.g. while the form is incomplete). */
  enabled?: boolean;
}

/** Normalised so the query key and the placeholder always agree. */
function normalise(input: PriceQuoteInput) {
  return {
    tier: input.tier,
    loads: Math.min(Math.max(Math.trunc(input.loads ?? 1), 1), 10),
    pods: Boolean(input.pods),
    gloves: Boolean(input.gloves),
    tipCents: Math.max(Math.trunc(input.tipCents ?? 0), 0),
    promoCode: input.promoCode?.trim() ? input.promoCode.trim().toUpperCase() : null,
  };
}

export function priceQuoteKey(input: PriceQuoteInput) {
  const n = normalise(input);
  return ['price_order', n.tier, n.loads, n.pods, n.gloves, n.tipCents, n.promoCode] as const;
}

/**
 * Optimistic mirror of the RPC's return shape. DISPLAY ONLY — never persist or
 * transmit these numbers. A promo discount cannot be evaluated on the client,
 * so the placeholder reports no discount and lets the server correct it.
 */
export function localPriceQuote(input: PriceQuoteInput): PriceQuote {
  const n = normalise(input);
  const q = quoteLocally({
    tier: n.tier,
    loads: n.loads,
    pods: n.pods,
    gloves: n.gloves,
    tipCents: n.tipCents,
  });

  return {
    tier: n.tier,
    loads: n.loads,
    service_fee_cents: q.serviceFeeCents,
    machine_cost_cents: q.machineCostCents,
    addons_cents: q.addonsCents,
    discount_cents: q.discountCents,
    promo_code: null,
    promo_valid: null,
    promo_message: null,
    tip_cents: q.tipCents,
    subtotal_cents: q.subtotalCents,
    processing_fee_cents: q.processingFeeCents,
    total_cents: q.totalCents,
    cta_cents: q.ctaCents,
    liability_cap_cents: PRICING.liabilityCapCents,
  };
}

async function fetchPriceQuote(input: PriceQuoteInput): Promise<PriceQuote> {
  const n = normalise(input);
  const { data, error } = await supabase.rpc('price_order', {
    p_tier: n.tier,
    p_loads: n.loads,
    p_pods: n.pods,
    p_gloves: n.gloves,
    p_tip_cents: n.tipCents,
    p_promo_code: n.promoCode,
  });

  if (error) throw error;
  if (!data) throw new Error('Pricing is unavailable right now.');
  return data as PriceQuote;
}

export type UsePriceQuoteResult = UseQueryResult<PriceQuote, Error> & {
  /** Always defined: the server quote, or the optimistic mirror until it lands. */
  quote: PriceQuote;
  /** True while the figure on screen is the local mirror rather than the server's. */
  isEstimate: boolean;
};

export function usePriceQuote(input: PriceQuoteInput): UsePriceQuoteResult {
  // Destructured so the memo depends on primitives, not on the caller's object
  // literal (which is rebuilt every render and would defeat the memo). Memoising
  // the normalised value keeps the placeholder stable between quotes, so the
  // price on screen never flickers while the server call is in flight.
  const { tier, loads, pods, gloves, tipCents, promoCode } = input;
  const n = useMemo(
    () => normalise({ tier, loads, pods, gloves, tipCents, promoCode }),
    [tier, loads, pods, gloves, tipCents, promoCode],
  );
  const placeholder = useMemo(() => localPriceQuote(n), [n]);

  const query = useQuery<PriceQuote, Error>({
    queryKey: priceQuoteKey(input),
    queryFn: () => fetchPriceQuote(input),
    enabled: isSupabaseConfigured && (input.enabled ?? true),
    // pricing_config is effectively static; don't re-quote on every keystroke.
    staleTime: 5 * 60_000,
    placeholderData: placeholder,
  });

  return {
    ...query,
    quote: query.data ?? placeholder,
    isEstimate: query.data === undefined || query.isPlaceholderData,
  };
}
