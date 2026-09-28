import { TIERS } from '@/constants/pricing';
import type { Order } from '@/types/database';

export function tierName(tier: Order['tier']): string {
  return TIERS.find((t) => t.id === tier)?.name ?? tier;
}

export function loadsLabel(loadCount: number): string {
  return `${loadCount} ${loadCount === 1 ? 'load' : 'loads'}`;
}

export function floorLabel(floor: string): string {
  const trimmed = floor.trim();
  return /^\d+$/.test(trimmed) ? `Floor ${trimmed}` : trimmed;
}

export function addonsLabel(order: Pick<Order, 'add_detergent_pods' | 'add_gloves'>): string | null {
  const extras: string[] = [];
  if (order.add_detergent_pods) extras.push('Detergent pods');
  if (order.add_gloves) extras.push('Gloves');
  return extras.length ? extras.join(' · ') : null;
}

export function washSettingsLabel(
  order: Pick<Order, 'wash_cycle' | 'wash_temp' | 'dry_level'>,
): string {
  return `${order.wash_cycle} · ${order.wash_temp} · ${order.dry_level}`;
}
