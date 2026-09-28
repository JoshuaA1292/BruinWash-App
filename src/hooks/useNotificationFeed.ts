import { useCallback, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import type { AppNotification } from '@/types/database';

/**
 * The in-app SYSTEM notification feed (spec 3.2 / 3.3).
 *
 * public.notifications carries two very different kinds of row:
 *   1. the seven automated order messages rendered from public.message_templates
 *      — these ARE the feed, and
 *   2. rows written by the messages_notify trigger purely to carry a push for a
 *      manual chat message. Those are stamped data.kind = 'chat' with
 *      template_key = 'chat_message' and must NEVER appear in the feed: the
 *      chat thread is its own surface.
 *
 * The exclusion is applied twice on purpose. Server side we filter on
 * template_key, because `not(data->>kind, eq, chat)` compiles to
 * `NOT (data->>'kind' = 'chat')`, which is NULL — and therefore excludes the row
 * — for every automated notification, since those rows carry no `kind` key at
 * all. Client side we then apply the spec's data.kind rule verbatim, so a future
 * chat-ish template key still cannot leak into the feed.
 */

/** template_key stamped on the push-only rows written for a chat message. */
export const CHAT_NOTIFICATION_TEMPLATE_KEY = 'chat_message';
/** data.kind stamped on the same rows. */
export const CHAT_NOTIFICATION_KIND = 'chat';
/** Delivery is the notification that leads to the rating prompt (spec 3.5). */
export const DELIVERED_TEMPLATE_KEY = 'order_delivered_requester';

const FEED_LIMIT = 100;

export const notificationKeys = {
  all: ['notifications'] as const,
  feed: (userId: string | undefined) => ['notifications', 'feed', userId] as const,
  unread: (userId: string | undefined) => ['notifications', 'unread', userId] as const,
};

/** The spec's rule, applied to a row we already hold. */
export function isSystemNotification(row: AppNotification): boolean {
  return row.data?.kind !== CHAT_NOTIFICATION_KIND;
}

/** Where a feed row deep-links to. Null when it references no order. */
export type NotificationTarget =
  | { pathname: '/order/[id]'; params: { id: string } }
  | { pathname: '/order/[id]/rate'; params: { id: string } };

export function notificationTarget(row: AppNotification): NotificationTarget | null {
  const orderId =
    row.order_id ?? (typeof row.data?.order_id === 'string' ? row.data.order_id : null);
  if (!orderId) return null;
  if (row.template_key === DELIVERED_TEMPLATE_KEY) {
    return { pathname: '/order/[id]/rate', params: { id: orderId } };
  }
  return { pathname: '/order/[id]', params: { id: orderId } };
}

/**
 * Keeps the feed and the unread badge live. Realtime is filtered to the
 * signed-in user, which matches what RLS would let us read anyway.
 */
function useNotificationRealtime(scope: string): void {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) return;

    const channel = supabase
      .channel(`notifications:${scope}:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, scope, userId]);
}

export function useNotificationFeed() {
  const { session } = useAuth();
  const userId = session?.user.id;

  useNotificationRealtime('feed');

  return useQuery({
    queryKey: notificationKeys.feed(userId),
    enabled: Boolean(userId) && isSupabaseConfigured,
    queryFn: async (): Promise<AppNotification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .neq('template_key', CHAT_NOTIFICATION_TEMPLATE_KEY)
        .order('created_at', { ascending: false })
        .limit(FEED_LIMIT);

      if (error) throw error;
      return ((data ?? []) as AppNotification[]).filter(isSystemNotification);
    },
  });
}

/**
 * Unread system notifications. Exported on its own so the requester and washer
 * tab bars can badge the inbox without rendering the feed.
 */
export function useUnreadNotificationCount(): number {
  const { session } = useAuth();
  const userId = session?.user.id;

  useNotificationRealtime('unread');

  const { data } = useQuery({
    queryKey: notificationKeys.unread(userId),
    enabled: Boolean(userId) && isSupabaseConfigured,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .neq('template_key', CHAT_NOTIFICATION_TEMPLATE_KEY)
        .is('read_at', null);

      if (error) throw error;
      return count ?? 0;
    },
  });

  return data ?? 0;
}

export function useMarkNotificationRead() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .is('read_at', null);
      if (error) throw error;
    },
    onMutate: (notificationId: string) => {
      // Optimistic: tapping a row should dim it before the round trip lands.
      queryClient.setQueryData<AppNotification[]>(
        notificationKeys.feed(userId),
        (rows) =>
          rows?.map((row) =>
            row.id === notificationId && !row.read_at
              ? { ...row, read_at: new Date().toISOString() }
              : row,
          ),
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const { mutate } = mutation;
  return useCallback((notificationId: string) => mutate(notificationId), [mutate]);
}

export function useMarkAllNotificationsRead() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!userId) return;
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userId)
        .is('read_at', null);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
