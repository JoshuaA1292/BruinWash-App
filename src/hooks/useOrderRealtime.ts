import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type { Order, OrderWithBuilding } from '@/types/database';
import { orderKey } from './useOrder';

/**
 * Subscribes to postgres_changes on the single orders row behind this screen.
 * public.orders is already in the supabase_realtime publication, and RLS is
 * applied to the stream, so a client only ever receives rows it may read.
 *
 * The payload carries the flat row without the buildings join, so it is merged
 * onto the cached order rather than replacing it, then a refetch is queued to
 * pick up anything the payload cannot express.
 */
export function useOrderRealtime(orderId: string | undefined): { live: boolean } {
  const queryClient = useQueryClient();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!orderId || !isSupabaseConfigured) return;

    let channel: RealtimeChannel | null = supabase
      .channel(`order:${orderId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `id=eq.${orderId}`,
        },
        (payload) => {
          const next = payload.new as Partial<Order> | null;
          if (next && next.id) {
            queryClient.setQueryData<OrderWithBuilding | null>(orderKey(orderId), (prev) =>
              prev ? { ...prev, ...next } : prev,
            );
          }
          void queryClient.invalidateQueries({ queryKey: orderKey(orderId) });
          void queryClient.invalidateQueries({ queryKey: ['orders'] });
        },
      )
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
      });

    return () => {
      setLive(false);
      if (channel) {
        void supabase.removeChannel(channel);
        channel = null;
      }
    };
  }, [orderId, queryClient]);

  return { live };
}
