import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { WasherCard } from '@/types/database';

export function washerCardKey(washerId: string | null | undefined) {
  return ['washer-card', washerId ?? null] as const;
}

const CARD_SELECT = 'washer_id, first_name, avatar_url, avg_rating, review_count, completed_orders';

/**
 * The Uber-style visibility card (spec 3.1), read from the public.washer_cards
 * VIEW — first name only, and row-limited by RLS to washers the caller is
 * entitled to see. Never query profiles for anyone but the signed-in user.
 */
export function useWasherCard(washerId: string | null | undefined) {
  return useQuery<WasherCard | null>({
    queryKey: washerCardKey(washerId),
    enabled: Boolean(washerId) && isSupabaseConfigured,
    // A rating barely moves mid-order; no need to refetch aggressively.
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('washer_cards')
        .select(CARD_SELECT)
        .eq('washer_id', washerId as string)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      const row = data as Record<string, unknown>;
      // avg_rating is numeric(3,2) in Postgres; normalise defensively.
      return {
        washer_id: String(row.washer_id),
        first_name: (row.first_name as string | null) ?? null,
        avatar_url: (row.avatar_url as string | null) ?? null,
        avg_rating: Number(row.avg_rating ?? 0),
        review_count: Number(row.review_count ?? 0),
        completed_orders: Number(row.completed_orders ?? 0),
      } satisfies WasherCard;
    },
  });
}
