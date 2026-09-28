/**
 * Hand-maintained mirror of the Supabase schema in supabase/migrations.
 *
 * Once the real project is linked, this file can be regenerated with:
 *   npx supabase gen types typescript --project-id <ref> > src/types/database.ts
 * Until then it is the contract every feature codes against.
 */

export type UserRole = 'requester' | 'washer' | 'admin';
export type ServiceTier = 'standard' | 'full';

/** The 6-stage pipeline from spec 2.5, plus the terminal cancelled state. */
export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'picked_up'
  | 'washing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export type PaymentStatus =
  | 'unpaid'
  | 'processing'
  | 'paid'
  | 'refunded'
  | 'partially_refunded'
  | 'failed';

export type DisputeStatus = 'open' | 'reviewing' | 'resolved' | 'rejected';

export interface NotificationPrefs {
  order_updates: boolean;
  new_orders: boolean;
  chat_messages: boolean;
  marketing: boolean;
}

export interface Building {
  id: string;
  campus: string;
  name: string;
  slug: string;
  sort_order: number;
  active: boolean;
}

export interface Profile {
  id: string;
  role: UserRole;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  edu_email: string | null;
  building_id: string | null;
  floor: string | null;
  room_number: string | null;
  phone: string | null;
  is_female: boolean | null;
  female_washers_only: boolean;
  /** Server-managed. The client cannot write these; a trigger blocks it. */
  stripe_account_id: string | null;
  stripe_onboarding_done: boolean;
  stripe_customer_id: string | null;
  onboarding_tour_done: boolean;
  notification_prefs: NotificationPrefs;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  requester_id: string;
  washer_id: string | null;
  building_id: string;
  floor: string;
  room_number: string | null;
  pickup_at: string;
  tier: ServiceTier;
  load_count: number;
  wash_cycle: string;
  wash_temp: string;
  dry_level: string;
  notes: string | null;
  add_detergent_pods: boolean;
  add_gloves: boolean;
  status: OrderStatus;
  service_fee_cents: number;
  machine_cost_cents: number;
  addons_cents: number;
  tip_cents: number;
  discount_cents: number;
  processing_fee_cents: number;
  subtotal_cents: number;
  total_cents: number;
  promo_code: string | null;
  liability_ack: boolean;
  liability_ack_at: string | null;
  liability_cap_cents: number;
  payment_status: PaymentStatus;
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  delivery_photo_path: string | null;
  accepted_at: string | null;
  /** Set when the washer taps "I'm on my way" — not a pipeline stage. */
  en_route_at: string | null;
  picked_up_at: string | null;
  washing_at: string | null;
  out_for_delivery_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  refund_cents: number;
  created_at: string;
  updated_at: string;
}

/** Order joined with its building name, as most screens need it. */
export interface OrderWithBuilding extends Order {
  buildings: Pick<Building, 'id' | 'name' | 'slug'> | null;
}

/**
 * The Uber-style washer visibility card (spec 3.1). Backed by the
 * public.washer_cards view, which exposes FIRST NAME ONLY and is row-limited
 * to washers the caller is entitled to see. One-way: there is no requester card.
 */
export interface WasherCard {
  washer_id: string;
  first_name: string | null;
  avatar_url: string | null;
  avg_rating: number;
  review_count: number;
  completed_orders: number;
}

export interface OrderEvent {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  actor_id: string | null;
  note: string | null;
  created_at: string;
}

/** Manual requester <-> washer chat only. Automated copy never lands here. */
export interface Message {
  id: string;
  order_id: string;
  sender_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

/**
 * The in-app system feed. Rows with data.kind === 'chat' exist only to carry a
 * push for a manual chat message and are filtered out of the feed UI.
 */
export interface AppNotification {
  id: string;
  user_id: string;
  order_id: string | null;
  template_key: string;
  title: string;
  body: string;
  data: { kind?: string; order_id?: string; channels?: string[] } & Record<string, unknown>;
  read_at: string | null;
  push_sent_at: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  order_id: string;
  requester_id: string;
  washer_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Payout {
  id: string;
  washer_id: string;
  order_id: string | null;
  amount_cents: number;
  status: 'pending' | 'in_transit' | 'paid' | 'failed' | 'reversed';
  stripe_transfer_id: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface Dispute {
  id: string;
  order_id: string;
  opened_by: string;
  category: string;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  refund_cents: number;
  created_at: string;
  resolved_at: string | null;
}

/** Return shape of the price_order() RPC. The server is authoritative. */
export interface PriceQuote {
  tier: ServiceTier;
  loads: number;
  service_fee_cents: number;
  machine_cost_cents: number;
  addons_cents: number;
  discount_cents: number;
  promo_code: string | null;
  promo_valid: boolean | null;
  promo_message: string | null;
  tip_cents: number;
  subtotal_cents: number;
  processing_fee_cents: number;
  total_cents: number;
  /** What the Schedule screen CTA shows: service + machine + add-ons, pre-tip. */
  cta_cents: number;
  liability_cap_cents: number;
}

export interface PromoVerdict {
  valid: boolean;
  code?: string;
  discount_cents: number;
  message: string;
}

export interface EarningsSummary {
  pending_cents: number;
  paid_cents: number;
  lifetime_cents: number;
  order_count: number;
}

/**
 * A row of the public.available_orders view — the washer job board.
 *
 * Deliberately narrower than Order: no requester_id, no room_number, no notes.
 * A washer has no business reading those for a job they have not accepted, and
 * RLS no longer serves them the raw order row. The view also filters to paid
 * orders only, so nothing on the board can be refused as unfunded.
 */
export interface AvailableOrder {
  id: string;
  building_id: string;
  building_name: string;
  floor: string;
  pickup_at: string;
  tier: ServiceTier;
  load_count: number;
  add_detergent_pods: boolean;
  add_gloves: boolean;
  wash_cycle: string;
  wash_temp: string;
  dry_level: string;
  service_fee_cents: number;
  machine_cost_cents: number;
  tip_cents: number;
  created_at: string;
}
