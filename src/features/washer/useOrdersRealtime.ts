import { useEffect, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

/**
 * Subscribes to public.orders (added to the supabase_realtime publication in
 * the seed migration) so newly posted jobs appear and claimed ones disappear
 * without a manual refresh. Realtime applies the same RLS as a select, so a
 * washer only ever hears about orders they are allowed to see; the callback just
 * re-reads the list, which keeps the join on buildings intact.
 */
export function useOrdersRealtime(channelKey: string, onChange: () => void) {
  const handler = useRef(onChange);

  // Keep the ref current in an effect: assigning during render is a React rule
  // violation. The subscription below always reads the latest callback.
  useEffect(() => {
    handler.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel(`orders-${channelKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        handler.current();
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelKey]);
}
