import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrder } from '@/hooks/useOrder';
import type { Message, OrderWithBuilding } from '@/types/database';

/**
 * The MANUAL requester <-> washer thread (public.messages).
 *
 * Unlike orders, chat is a direct table write: messages_insert RLS lets either
 * participant insert their own row, but only once a washer is assigned and while
 * the order is not cancelled. We mirror exactly that gate in the composer so the
 * rule is explained rather than discovered as a failed send.
 *
 * Automated copy never lands here — the seven system messages surface in
 * public.notifications (see useNotificationFeed).
 */

/** public.messages caps a trimmed body at 2000 characters. */
export const MESSAGE_MAX_LENGTH = 2000;

export const chatKeys = {
  thread: (orderId: string | undefined) => ['chat', 'thread', orderId] as const,
};

export interface ChatThread {
  messages: Message[];
  order: OrderWithBuilding | null;
  /** True while either the order context or the first page of messages loads. */
  isLoading: boolean;
  loadError: string | null;
  /** True when the signed-in user is the requester on this order. */
  viewerIsRequester: boolean;
  /** The assigned washer, or null while the order is still pending. */
  washerId: string | null;
  /** RLS will accept an insert right now. */
  canSend: boolean;
  /** Why the composer is disabled, in the product's voice. */
  disabledReason: string | null;
  send: (body: string) => void;
  sending: boolean;
  sendError: string | null;
  isMine: (message: Message) => boolean;
}

export function useChat(orderId: string | undefined): ChatThread {
  const { session } = useAuth();
  const userId = session?.user.id;
  const queryClient = useQueryClient();
  const ready = Boolean(orderId) && Boolean(userId) && isSupabaseConfigured;

  // Reuses the shared order query: RLS already restricts it to the two
  // participants, and nothing about the other party's identity comes from it.
  const orderQuery = useOrder(orderId);

  const messagesQuery = useQuery({
    queryKey: chatKeys.thread(orderId),
    enabled: ready,
    queryFn: async (): Promise<Message[]> => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('order_id', orderId as string)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  // Live delivery. Both INSERT and UPDATE matter: the other side stamping
  // read_at arrives as an UPDATE.
  useEffect(() => {
    if (!ready || !orderId) return;

    const channel = supabase
      .channel(`messages:${orderId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages', filter: `order_id=eq.${orderId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: chatKeys.thread(orderId) });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [orderId, queryClient, ready]);

  const messages = useMemo(() => messagesQuery.data ?? [], [messagesQuery.data]);
  const order = orderQuery.data ?? null;

  // Mark the other party's messages read while the thread is on screen.
  const markingRead = useRef(false);
  useEffect(() => {
    if (!ready || !orderId || !userId || markingRead.current) return;
    const hasUnread = messages.some((m) => m.sender_id !== userId && !m.read_at);
    if (!hasUnread) return;

    markingRead.current = true;
    void (async () => {
      const { error } = await supabase
        .from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('order_id', orderId)
        .neq('sender_id', userId)
        .is('read_at', null);
      markingRead.current = false;
      if (!error) {
        void queryClient.invalidateQueries({ queryKey: chatKeys.thread(orderId) });
      }
    })();
  }, [messages, orderId, queryClient, ready, userId]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed || !orderId || !userId) return;
      const { error } = await supabase.from('messages').insert({
        order_id: orderId,
        sender_id: userId,
        body: trimmed.slice(0, MESSAGE_MAX_LENGTH),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.thread(orderId) });
    },
  });

  const cancelled = order?.status === 'cancelled';
  const unassigned = Boolean(order) && !order?.washer_id;
  const canSend = Boolean(order) && !cancelled && !unassigned;

  const disabledReason = cancelled
    ? 'This order was cancelled, so the thread is closed.'
    : unassigned
      ? 'You can message once a washer in your building accepts this order.'
      : null;

  const { mutate: sendRaw } = sendMutation;
  const send = useCallback(
    (body: string) => {
      if (!body.trim()) return;
      sendRaw(body);
    },
    [sendRaw],
  );

  const isMine = useCallback(
    (message: Message) => Boolean(userId) && message.sender_id === userId,
    [userId],
  );

  return {
    messages,
    order,
    isLoading: orderQuery.isLoading || messagesQuery.isLoading,
    loadError:
      orderQuery.error || messagesQuery.error
        ? friendlyError(orderQuery.error ?? messagesQuery.error, 'Could not load this thread.')
        : null,
    viewerIsRequester: Boolean(userId) && order?.requester_id === userId,
    washerId: order?.washer_id ?? null,
    canSend,
    disabledReason,
    send,
    sending: sendMutation.isPending,
    sendError: sendMutation.error ? friendlyError(sendMutation.error, 'Message not sent.') : null,
    isMine,
  };
}
