import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Order, OrderWithBuilding } from '@/types/database';

/** Single source of truth for the cache key, shared with useOrderRealtime. */
export function orderKey(orderId: string | undefined) {
  return ['order', orderId ?? null] as const;
}

const ORDER_SELECT = '*, buildings ( id, name, slug )';

/**
 * One order plus its building name. RLS restricts this to the requester, the
 * assigned washer, an admin, or a washer looking at a pending order in their
 * own building, so no extra filtering is needed here.
 */
export function useOrder(orderId: string | undefined) {
  return useQuery<OrderWithBuilding | null>({
    queryKey: orderKey(orderId),
    enabled: Boolean(orderId) && isSupabaseConfigured,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('id', orderId as string)
        .maybeSingle();

      if (error) throw error;
      return (data as OrderWithBuilding | null) ?? null;
    },
  });
}

/**
 * cancel_order() is the only way a client may cancel: `authenticated` has no
 * UPDATE on orders. The server computes the refund tier from the Terms of
 * Service — we never send a refund amount.
 */
export function useCancelOrder(orderId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, { reason?: string } | void>({
    mutationFn: async (vars) => {
      const reason = vars && 'reason' in vars ? vars.reason : undefined;
      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId as string,
        p_reason: reason ?? null,
      });
      if (error) throw error;
      return data as Order;
    },
    onSuccess: (cancelled) => {
      queryClient.setQueryData<OrderWithBuilding | null>(orderKey(orderId), (prev) =>
        prev ? { ...prev, ...cancelled } : prev,
      );
      void queryClient.invalidateQueries({ queryKey: orderKey(orderId) });
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
