import { ORDER_STAGES } from '@/constants/copy';
import type { Order, OrderStatus } from '@/types/database';

/** How a single pipeline stage renders in the tracker. */
export type StageState = 'done' | 'current' | 'upcoming';

export type PipelineStatus = (typeof ORDER_STAGES)[number]['status'];

export const STAGE_STATUSES: readonly PipelineStatus[] = ORDER_STAGES.map((s) => s.status);

/**
 * Position of a status in the 6-stage pipeline, or -1 for the terminal
 * 'cancelled' state which sits outside it.
 */
export function stageIndex(status: OrderStatus): number {
  return STAGE_STATUSES.indexOf(status as PipelineStatus);
}

/** Mirrors the guard inside the cancel_order RPC. The server still decides. */
export function isCancellable(status: OrderStatus): boolean {
  return status !== 'delivered' && status !== 'cancelled';
}

/**
 * Which CANCELLATION_POLICY bullet applies right now. Display only — the
 * refund is computed by cancel_order() on the server.
 */
export function refundPolicyIndex(status: OrderStatus, pickupAtIso: string): number {
  const hoursUntilPickup = (new Date(pickupAtIso).getTime() - Date.now()) / 3_600_000;
  if (status === 'pending' && hoursUntilPickup > 2) return 0;
  if (status === 'pending' || status === 'accepted') return 1;
  if (status === 'picked_up') return 2;
  return 3;
}

/** The timestamp column that records a given stage, when it has happened. */
export function stageTimestamp(order: Order, status: PipelineStatus): string | null {
  switch (status) {
    case 'pending':
      return order.created_at;
    case 'accepted':
      return order.accepted_at;
    case 'picked_up':
      return order.picked_up_at;
    case 'washing':
      return order.washing_at;
    case 'out_for_delivery':
      return order.out_for_delivery_at;
    case 'delivered':
      return order.delivered_at;
    default:
      return null;
  }
}

/**
 * True while Stripe has not confirmed the charge. The pipeline would otherwise
 * show a stalled "Pending" stage with no explanation.
 */
export function isAwaitingPayment(order: Pick<Order, 'status' | 'payment_status'>): boolean {
  if (order.status !== 'pending') return false;
  return order.payment_status === 'unpaid' || order.payment_status === 'processing';
}

export function hasPaymentFailed(order: Pick<Order, 'status' | 'payment_status'>): boolean {
  return order.status !== 'cancelled' && order.payment_status === 'failed';
}
