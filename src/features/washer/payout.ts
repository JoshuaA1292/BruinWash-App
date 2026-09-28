import type { Order } from '@/types/database';

/**
 * DISPLAY MIRROR ONLY — never sent anywhere.
 *
 * advance_order_status() writes the real payout row when an order is delivered:
 *   round(service_fee_cents * 0.70) + machine_cost_cents + tip_cents
 * The database is authoritative for money; this exists so an available job card
 * can show the washer what the job is worth before they accept it.
 */
export const WASHER_SERVICE_SHARE = 0.7;

type PayoutParts = Pick<Order, 'service_fee_cents' | 'machine_cost_cents' | 'tip_cents'>;

export function estimateWasherPayoutCents(order: PayoutParts): number {
  return (
    Math.round(order.service_fee_cents * WASHER_SERVICE_SHARE) +
    order.machine_cost_cents +
    order.tip_cents
  );
}

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_transit: 'On its way',
  paid: 'Paid out',
  failed: 'Failed',
  reversed: 'Reversed',
};
