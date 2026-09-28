import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { OrderStatus, OrderWithBuilding, WasherCard } from '@/types/database';

/**
 * The requester's own orders.
 *
 * RLS already scopes public.orders to `requester_id = auth.uid()` for a
 * requester, so the query carries no user filter — the database decides what is
 * visible. The washer side of the join comes from public.washer_cards (FIRST
 * NAME ONLY); there is no requester card, and profiles is never read for anyone
 * but the signed-in user.
 */

export interface MyOrder extends OrderWithBuilding {
  /** The assigned washer's public card, once one has accepted. */
  washer: WasherCard | null;
  /** True once submit_review() has recorded a review for this order. */
  reviewed: boolean;
}

/** Anything still in the pipeline: not delivered, not cancelled. */
export function isOrderActive(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

export const myOrdersKey = (userId: string | null | undefined) =>
  ['orders', 'mine', userId ?? 'anonymous'] as const;

const ORDER_COLUMNS = '*, buildings ( id, name, slug )';

async function fetchMyOrders(): Promise<MyOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_COLUMNS)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  const orders = (data ?? []) as unknown as OrderWithBuilding[];
  if (orders.length === 0) return [];

  const washerIds = Array.from(
    new Set(orders.map((o) => o.washer_id).filter((id): id is string => Boolean(id))),
  );

  const [cards, reviews] = await Promise.all([
    washerIds.length > 0
      ? supabase
          .from('washer_cards')
          .select('washer_id, first_name, avatar_url, avg_rating, review_count, completed_orders')
          .in('washer_id', washerIds)
      : Promise.resolve({ data: [], error: null }),
    orders.some((o) => o.status === 'delivered')
      ? supabase.from('reviews').select('order_id')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (cards.error) throw new Error(cards.error.message);
  if (reviews.error) throw new Error(reviews.error.message);

  const cardById = new Map<string, WasherCard>(
    ((cards.data ?? []) as unknown as WasherCard[]).map((c) => [c.washer_id, c]),
  );
  const reviewedOrderIds = new Set(
    ((reviews.data ?? []) as unknown as { order_id: string }[]).map((r) => r.order_id),
  );

  return orders.map((order) => ({
    ...order,
    washer: order.washer_id ? cardById.get(order.washer_id) ?? null : null,
    reviewed: reviewedOrderIds.has(order.id),
  }));
}

export interface UseMyOrdersResult {
  orders: MyOrder[];
  /** Still in the pipeline, soonest pickup first. */
  active: MyOrder[];
  /** Delivered or cancelled, newest first. */
  past: MyOrder[];
  /** The one to surface on Home: the active order with the soonest pickup. */
  activeOrder: MyOrder | null;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: UseQueryResult<MyOrder[], Error>['refetch'];
}

export function useMyOrders(): UseMyOrdersResult {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery<MyOrder[], Error>({
    queryKey: myOrdersKey(userId),
    enabled: isSupabaseConfigured && Boolean(userId),
    queryFn: fetchMyOrders,
  });

  // Realtime keeps the Home card and the history list live as the washer walks
  // the order through the pipeline.
  useEffect(() => {
    if (!isSupabaseConfigured || !userId) return;

    const channel = supabase
      .channel(`orders:requester:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `requester_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: myOrdersKey(userId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const { active, past } = useMemo(() => {
    const all = query.data ?? [];
    return {
      active: all
        .filter((o) => isOrderActive(o.status))
        .sort((a, b) => new Date(a.pickup_at).getTime() - new Date(b.pickup_at).getTime()),
      past: all.filter((o) => !isOrderActive(o.status)),
    };
  }, [query.data]);

  return {
    orders: query.data ?? [],
    active,
    past,
    activeOrder: active[0] ?? null,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
