import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrdersRealtime } from '@/features/washer/useOrdersRealtime';
import type { OrderWithBuilding } from '@/types/database';

export const availableOrdersKey = ['orders', 'available'] as const;
export const washerJobsKey = ['orders', 'washer'] as const;

/**
 * Unclaimed pending jobs.
 *
 * Same-building matching is enforced by the orders_select RLS policy
 * (status = 'pending' AND washer_id IS NULL AND building_id = my_building_id()),
 * so this is a plain select — there is no client-side building filter to get
 * wrong. Nothing here touches public.profiles: a washer never sees who the
 * requester is.
 */
export function useAvailableOrders() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const enabled = isSupabaseConfigured && profile?.role === 'washer' && Boolean(profile?.building_id);

  const query = useQuery({
    queryKey: availableOrdersKey,
    enabled,
    queryFn: async (): Promise<OrderWithBuilding[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, buildings(id, name, slug)')
        .eq('status', 'pending')
        .is('washer_id', null)
        .order('pickup_at', { ascending: true });

      if (error) throw error;
      return (data ?? []) as unknown as OrderWithBuilding[];
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: availableOrdersKey });
  }, [queryClient]);

  useOrdersRealtime('available', refresh);

  const acceptMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { data, error } = await supabase.rpc('accept_order', { p_order_id: orderId });
      if (error) throw error;
      return data as unknown;
    },
    onMutate: (orderId: string) => {
      setAcceptingId(orderId);
      setAcceptError(null);
    },
    onSettled: () => {
      setAcceptingId(null);
      // Whoever won, the list is now stale: a lost race must not leave the card
      // sitting there, and a win must move the job to My Jobs.
      void queryClient.invalidateQueries({ queryKey: availableOrdersKey });
      void queryClient.invalidateQueries({ queryKey: washerJobsKey });
    },
    onError: (error) => {
      // accept_order() raises the copy we want to show verbatim: the lost race
      // ("already been accepted by another washer"), the female-washers-only
      // rejection, and "This order is not paid yet."
      setAcceptError(friendlyError(error, 'That job could not be accepted. Pull to refresh.'));
    },
  });

  return {
    orders: query.data ?? [],
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    loadError: query.error ? friendlyError(query.error) : null,
    refetch: query.refetch,
    enabled,
    accept: (orderId: string) => acceptMutation.mutate(orderId),
    acceptingId,
    acceptError,
    clearAcceptError: () => setAcceptError(null),
  };
}
