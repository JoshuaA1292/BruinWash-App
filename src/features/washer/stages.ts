import { ORDER_STAGES } from '@/constants/copy';
import type { OrderStatus } from '@/types/database';

/** Stages advance_order_status() accepts without a photo. */
export type AdvanceTarget = Extract<OrderStatus, 'picked_up' | 'washing' | 'out_for_delivery'>;

/**
 * The single legal forward transition advance_order_status() will accept.
 * Discriminated on requiresPhoto: only 'delivered' needs proof, and the RPC
 * refuses it without a photo path.
 */
export type NextStage =
  | { to: AdvanceTarget; label: string; requiresPhoto: false }
  | { to: Extract<OrderStatus, 'delivered'>; label: string; requiresPhoto: true };

export function nextStage(status: OrderStatus): NextStage | null {
  switch (status) {
    case 'accepted':
      return { to: 'picked_up', label: 'Mark Picked Up', requiresPhoto: false };
    case 'picked_up':
      return { to: 'washing', label: 'Start Washing', requiresPhoto: false };
    case 'washing':
      return { to: 'out_for_delivery', label: 'Out for Delivery', requiresPhoto: false };
    case 'out_for_delivery':
      return { to: 'delivered', label: 'Mark Delivered', requiresPhoto: true };
    default:
      return null;
  }
}

export function stageLabel(status: OrderStatus): string {
  if (status === 'cancelled') return 'Cancelled';
  return ORDER_STAGES.find((s) => s.status === status)?.label ?? status;
}

export function stageBlurb(status: OrderStatus): string {
  if (status === 'cancelled') return 'This order was cancelled';
  return ORDER_STAGES.find((s) => s.status === status)?.blurb ?? '';
}

export const ACTIVE_WASHER_STATUSES: OrderStatus[] = [
  'accepted',
  'picked_up',
  'washing',
  'out_for_delivery',
];

export function isTerminal(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}
