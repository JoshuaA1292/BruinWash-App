/**
 * Thin wrapper over src/hooks/usePriceQuote.ts, which owns the price_order()
 * call. This is the only file in the checkout feature that knows that hook's
 * result shape.
 *
 * The important distinction it preserves: usePriceQuote always hands back a
 * quote, but until `isEstimate` goes false that quote is the local display
 * mirror, not the server's. Only a server quote may fund a payment, so
 * `authoritative` gates the Pay button.
 */
import { usePriceQuote, type PriceQuoteInput } from '@/hooks/usePriceQuote';
import type { PriceQuote, ServiceTier } from '@/types/database';

export interface CheckoutQuoteOptions {
  tier: ServiceTier;
  loads: number;
  pods: boolean;
  gloves: boolean;
  tipCents: number;
  promoCode: string | null;
  enabled?: boolean;
}

export interface CheckoutQuote {
  /** Never null: the server quote, or the display mirror until it arrives. */
  quote: PriceQuote;
  /** True only when `quote` came from price_order(). */
  authoritative: boolean;
  /** True while the figures on screen may still move. */
  repricing: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCheckoutQuote(options: CheckoutQuoteOptions): CheckoutQuote {
  const input: PriceQuoteInput = {
    tier: options.tier,
    loads: options.loads,
    pods: options.pods,
    gloves: options.gloves,
    tipCents: options.tipCents,
    promoCode: options.promoCode,
    enabled: options.enabled ?? true,
  };

  const result = usePriceQuote(input);

  return {
    quote: result.quote,
    authoritative: !result.isEstimate,
    repricing: result.isEstimate || result.isFetching,
    error: result.error ?? null,
    refetch: () => {
      void result.refetch();
    },
  };
}

/**
 * Belt and braces: the quote must describe exactly the options on screen before
 * it is allowed to fund a charge.
 */
export function quoteMatches(
  quote: PriceQuote,
  options: Pick<CheckoutQuoteOptions, 'tier' | 'loads' | 'tipCents' | 'promoCode'>,
): boolean {
  const expectedCode = options.promoCode?.trim() ? options.promoCode.trim().toUpperCase() : null;
  return (
    quote.tier === options.tier &&
    quote.loads === options.loads &&
    quote.tip_cents === options.tipCents &&
    (quote.promo_code ?? null) === expectedCode
  );
}
