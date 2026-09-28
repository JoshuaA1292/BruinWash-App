import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import { useAuth } from '@/providers/AuthProvider';
import { useOrdersRealtime } from '@/features/washer/useOrdersRealtime';
import { captureProofPhoto, uploadDeliveryProof, type ProofSource } from '@/features/washer/deliveryProof';
import { isTerminal, type AdvanceTarget } from '@/features/washer/stages';
import { washerJobsKey, availableOrdersKey } from './useAvailableOrders';
import { earningsKey, payoutsKey } from './useEarnings';
import type { OrderWithBuilding } from '@/types/database';

type BusyPhase = 'en_route' | 'advancing' | 'capturing' | 'uploading';

const BUSY_LABEL: Record<BusyPhase, string> = {
  en_route: 'Letting them know…',
  advancing: 'Updating…',
  capturing: 'Waiting for the photo…',
  uploading: 'Uploading the photo…',
};

/**
 * The washer's pipeline. Every mutation here is an RPC: the authenticated role
 * has no INSERT/UPDATE on public.orders at all, and advance_order_status()
 * rejects skipped or reversed stages, so the UI only ever offers the one legal
 * next transition.
 */
export function useWasherJobs() {
  const { session, profile } = useAuth();
  const queryClient = useQueryClient();
  const washerId = session?.user.id;

  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [busyPhase, setBusyPhase] = useState<BusyPhase | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** Kept so a failed RPC after a successful upload does not re-shoot the photo. */
  const uploadedProof = useRef<Record<string, string>>({});

  const enabled = isSupabaseConfigured && profile?.role === 'washer' && Boolean(washerId);

  const query = useQuery({
    queryKey: [...washerJobsKey, washerId ?? 'anon'],
    enabled,
    queryFn: async (): Promise<OrderWithBuilding[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select('*, buildings(id, name, slug)')
        .eq('washer_id', washerId ?? '')
        .order('pickup_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as OrderWithBuilding[];
    },
  });

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: washerJobsKey });
  }, [queryClient]);

  useOrdersRealtime(`washer-${washerId ?? 'anon'}`, refresh);

  const invalidateAll = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: washerJobsKey });
    void queryClient.invalidateQueries({ queryKey: availableOrdersKey });
    void queryClient.invalidateQueries({ queryKey: earningsKey });
    void queryClient.invalidateQueries({ queryKey: payoutsKey });
  }, [queryClient]);

  const finish = useCallback(() => {
    setBusyOrderId(null);
    setBusyPhase(null);
    invalidateAll();
  }, [invalidateAll]);

  const enRouteMutation = useMutation({
    mutationFn: async (orderId: string) => {
      const { error } = await supabase.rpc('set_washer_en_route', { p_order_id: orderId });
      if (error) throw error;
    },
    onMutate: (orderId: string) => {
      setActionError(null);
      setBusyOrderId(orderId);
      setBusyPhase('en_route');
    },
    onError: (error) => setActionError(friendlyError(error)),
    onSettled: finish,
  });

  const advanceMutation = useMutation({
    mutationFn: async (input: { orderId: string; to: AdvanceTarget }) => {
      const { error } = await supabase.rpc('advance_order_status', {
        p_order_id: input.orderId,
        p_to: input.to,
      });
      if (error) throw error;
    },
    onMutate: (input) => {
      setActionError(null);
      setBusyOrderId(input.orderId);
      setBusyPhase('advancing');
    },
    onError: (error) => setActionError(friendlyError(error)),
    onSettled: finish,
  });

  /**
   * Photo proof (spec 3.4): shoot -> upload to delivery-proof/<orderId>/... ->
   * advance_order_status(..., 'delivered', path). The RPC refuses to close the
   * order without a path, so an upload failure is surfaced and the job stays out
   * for delivery rather than getting stuck half-done.
   */
  const deliverMutation = useMutation({
    mutationFn: async (input: { orderId: string; source: ProofSource }) => {
      let path = uploadedProof.current[input.orderId];

      if (!path) {
        setBusyPhase('capturing');
        const asset = await captureProofPhoto(input.source);
        if (!asset) return { cancelled: true as const };

        setBusyPhase('uploading');
        path = await uploadDeliveryProof(input.orderId, asset);
        uploadedProof.current[input.orderId] = path;
      }

      setBusyPhase('advancing');
      const { error } = await supabase.rpc('advance_order_status', {
        p_order_id: input.orderId,
        p_to: 'delivered',
        p_photo_path: path,
      });
      if (error) throw error;

      delete uploadedProof.current[input.orderId];
      return { cancelled: false as const };
    },
    onMutate: (input) => {
      setActionError(null);
      setBusyOrderId(input.orderId);
      setBusyPhase('capturing');
    },
    onError: (error) => setActionError(friendlyError(error)),
    onSettled: finish,
  });

  // A fresh [] on every render would invalidate both memos below each time.
  const orders = useMemo(() => query.data ?? [], [query.data]);

  const active = useMemo(
    () =>
      orders
        .filter((o) => !isTerminal(o.status))
        .sort((a, b) => new Date(a.pickup_at).getTime() - new Date(b.pickup_at).getTime()),
    [orders],
  );

  const history = useMemo(() => orders.filter((o) => isTerminal(o.status)), [orders]);

  return {
    active,
    history,
    isLoading: query.isLoading,
    isRefetching: query.isRefetching,
    loadError: query.error ? friendlyError(query.error) : null,
    refetch: query.refetch,
    enabled,

    goEnRoute: (orderId: string) => enRouteMutation.mutate(orderId),
    advance: (orderId: string, to: AdvanceTarget) => advanceMutation.mutate({ orderId, to }),
    markDelivered: (orderId: string, source: ProofSource) =>
      deliverMutation.mutate({ orderId, source }),
    /** True when the photo is already in the bucket and only the RPC needs retrying. */
    hasUploadedProof: (orderId: string) => Boolean(uploadedProof.current[orderId]),

    busyOrderId,
    busyLabel: busyPhase ? BUSY_LABEL[busyPhase] : null,
    actionError,
    clearActionError: () => setActionError(null),
  };
}
