import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { OrderStatus, OrderWithBuilding } from '@/types/database';

/**
 * Every order, for the admin dashboard (spec 5).
 *
 * The orders_admin_write / orders_select policies grant an admin the whole
 * table, so this is a plain select with the building name joined. Nothing here
 * mutates an order: the dashboard links into /order/[id], which drives the RPCs.
 */

export type AdminStatusFilter = OrderStatus | 'all';

export const ADMIN_STATUS_FILTERS: readonly { id: AdminStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'pending', label: 'Pending' },
  { id: 'accepted', label: 'Accepted' },
  { id: 'picked_up', label: 'Picked up' },
  { id: 'washing', label: 'Washing' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

/** How many rows the dashboard pulls; enough for a campus day, bounded on purpose. */
const ROW_LIMIT = 250;

export const adminOrdersKey = ['orders', 'admin', 'all'] as const;

export interface AdminSummary {
  /** Orders created since local midnight. */
  todayCount: number;
  /** Gross volume of those orders, in cents. */
  todayGrossCents: number;
  /** Pending orders no washer has claimed yet. */
  unclaimedCount: number;
  /** Gross volume across every loaded order, in cents. */
  totalGrossCents: number;
}

async function fetchAllOrders(): Promise<OrderWithBuilding[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('*, buildings ( id, name, slug )')
    .order('created_at', { ascending: false })
    .limit(ROW_LIMIT);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as OrderWithBuilding[];
}

export interface UseAdminOrdersResult {
  /** Rows matching the active filter chip, newest first. */
  orders: OrderWithBuilding[];
  /** Every loaded row, whatever the filter. */
  allOrders: OrderWithBuilding[];
  summary: AdminSummary;
  /** Row count per status, for the filter chips. */
  counts: Record<AdminStatusFilter, number>;
  isLoading: boolean;
  isRefetching: boolean;
  error: Error | null;
  refetch: UseQueryResult<OrderWithBuilding[], Error>['refetch'];
}

export function useAdminOrders(filter: AdminStatusFilter = 'all'): UseAdminOrdersResult {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery<OrderWithBuilding[], Error>({
    queryKey: adminOrdersKey,
    enabled: isSupabaseConfigured && isAdmin,
    queryFn: fetchAllOrders,
  });

  useEffect(() => {
    if (!isSupabaseConfigured || !isAdmin) return;

    const channel = supabase
      .channel('orders:admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        void queryClient.invalidateQueries({ queryKey: adminOrdersKey });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, queryClient]);

  const allOrders = useMemo(() => query.data ?? [], [query.data]);

  const summary = useMemo<AdminSummary>(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const startOfDay = midnight.getTime();

    let todayCount = 0;
    let todayGrossCents = 0;
    let unclaimedCount = 0;
    let totalGrossCents = 0;

    for (const order of allOrders) {
      const billable = order.status !== 'cancelled';
      if (billable) totalGrossCents += order.total_cents;
      if (new Date(order.created_at).getTime() >= startOfDay) {
        todayCount += 1;
        if (billable) todayGrossCents += order.total_cents;
      }
      if (order.status === 'pending' && !order.washer_id) unclaimedCount += 1;
    }

    return { todayCount, todayGrossCents, unclaimedCount, totalGrossCents };
  }, [allOrders]);

  const counts = useMemo(() => {
    const base = ADMIN_STATUS_FILTERS.reduce(
      (acc, chip) => ({ ...acc, [chip.id]: 0 }),
      {} as Record<AdminStatusFilter, number>,
    );
    base.all = allOrders.length;
    for (const order of allOrders) base[order.status] += 1;
    return base;
  }, [allOrders]);

  const orders = useMemo(
    () => (filter === 'all' ? allOrders : allOrders.filter((o) => o.status === filter)),
    [allOrders, filter],
  );

  return {
    orders,
    allOrders,
    summary,
    counts,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    error: query.error ?? null,
    refetch: query.refetch,
  };
}
