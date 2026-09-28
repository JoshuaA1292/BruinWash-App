import { useQuery } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import type { EarningsSummary, Order, Payout } from '@/types/database';

export const earningsKey = ['earnings'] as const;
export const payoutsKey = ['payouts'] as const;

/** A payout row with just enough of its order to label it. */
export interface PayoutWithOrder extends Payout {
  orders:
    | (Pick<Order, 'id' | 'pickup_at' | 'tier' | 'load_count' | 'delivered_at'> & {
        buildings: { name: string } | null;
      })
    | null;
}

const EMPTY: EarningsSummary = {
  pending_cents: 0,
  paid_cents: 0,
  lifetime_cents: 0,
  order_count: 0,
};

/**
 * Earnings dashboard data.
 *
 * Headline balances come from the my_earnings() RPC (it sums public.payouts
 * server-side); the history comes straight from public.payouts, which the
 * payouts_own policy already scopes to the signed-in washer. Every figure is
 * integer cents.
 */
export function useEarnings() {
  const { session, profile } = useAuth();
  const washerId = session?.user.id;
  const enabled = isSupabaseConfigured && profile?.role === 'washer' && Boolean(washerId);

  const summary = useQuery({
    queryKey: [...earningsKey, washerId ?? 'anon'],
    enabled,
    queryFn: async (): Promise<EarningsSummary> => {
      const { data, error } = await supabase.rpc('my_earnings');
      if (error) throw error;
      return { ...EMPTY, ...((data ?? {}) as Partial<EarningsSummary>) };
    },
  });

  const payouts = useQuery({
    queryKey: [...payoutsKey, washerId ?? 'anon'],
    enabled,
    queryFn: async (): Promise<PayoutWithOrder[]> => {
      const { data, error } = await supabase
        .from('payouts')
        .select(
          'id, washer_id, order_id, amount_cents, status, stripe_transfer_id, created_at, paid_at, orders(id, pickup_at, tier, load_count, delivered_at, buildings(name))',
        )
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as unknown as PayoutWithOrder[];
    },
  });

  return {
    summary: summary.data ?? EMPTY,
    payouts: payouts.data ?? [],
    isLoading: summary.isLoading || payouts.isLoading,
    isRefetching: summary.isRefetching || payouts.isRefetching,
    error: summary.error
      ? friendlyError(summary.error)
      : payouts.error
        ? friendlyError(payouts.error)
        : null,
    enabled,
    refetch: async () => {
      await Promise.all([summary.refetch(), payouts.refetch()]);
    },
  };
}
