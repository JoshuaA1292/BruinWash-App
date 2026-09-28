/**
 * Booking mutation. The order is created by the create_order RPC, which prices
 * it server-side and returns the inserted row with payment_status 'unpaid'.
 *
 * The `authenticated` role has no INSERT on public.orders, so this RPC is the
 * only way an order can come into existence. Nothing resembling a total is sent
 * from here — only the booking options.
 */
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { friendlyError } from '@/lib/errors';
import type { Order, ServiceTier } from '@/types/database';

export interface CreateOrderInput {
  buildingId: string;
  floor: string;
  roomNumber?: string | null;
  /** ISO 8601. Must be in the future — create_order rejects anything else. */
  pickupAt: string;
  tier: ServiceTier;
  /** Spec 2.3: the acknowledgement gates checkout, and the RPC enforces it. */
  liabilityAck: boolean;
  loads?: number;
  pods?: boolean;
  gloves?: boolean;
  /** The tip the requester chose, in cents. The server re-prices around it. */
  tipCents?: number;
  promoCode?: string | null;
  washCycle?: string;
  washTemp?: string;
  dryLevel?: string;
  notes?: string | null;
}

export function useCreateOrder(): UseMutationResult<Order, Error, CreateOrderInput> {
  const queryClient = useQueryClient();

  return useMutation<Order, Error, CreateOrderInput>({
    mutationKey: ['create_order'],
    mutationFn: async (input) => {
      const { data, error } = await supabase.rpc('create_order', {
        p_building_id: input.buildingId,
        p_floor: input.floor,
        p_room_number: input.roomNumber ?? null,
        p_pickup_at: input.pickupAt,
        p_tier: input.tier,
        p_liability_ack: input.liabilityAck,
        p_loads: Math.max(input.loads ?? 1, 1),
        p_pods: input.pods ?? false,
        p_gloves: input.gloves ?? false,
        p_tip_cents: Math.max(input.tipCents ?? 0, 0),
        p_promo_code: input.promoCode?.trim() ? input.promoCode.trim().toUpperCase() : null,
        p_wash_cycle: input.washCycle ?? 'Normal',
        p_wash_temp: input.washTemp ?? 'Warm',
        p_dry_level: input.dryLevel ?? 'Medium',
        p_notes: input.notes ?? null,
      });

      if (error) throw new Error(friendlyError(error));

      // create_order returns a single public.orders row.
      const order = (Array.isArray(data) ? data[0] : data) as Order | null;
      if (!order?.id) {
        throw new Error(friendlyError(null, 'We could not create that order. Please try again.'));
      }
      return order;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
