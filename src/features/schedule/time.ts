/** Pickup-time arithmetic for the booking form. create_order() rejects any
 *  pickup_at <= now(), so the UI never lets one be composed. */

const QUARTER_MS = 15 * 60 * 1000;

/** The soonest pickup we offer: an hour out, rounded up to a quarter hour. */
export function defaultPickupAt(from: Date = new Date()): Date {
  return roundUpToQuarterHour(new Date(from.getTime() + 60 * 60 * 1000));
}

/** The floor the pickers enforce — a small buffer so a slow tap cannot expire. */
export function earliestPickupAt(from: Date = new Date()): Date {
  return roundUpToQuarterHour(new Date(from.getTime() + 15 * 60 * 1000));
}

export function roundUpToQuarterHour(date: Date): Date {
  const rounded = new Date(Math.ceil(date.getTime() / QUARTER_MS) * QUARTER_MS);
  rounded.setSeconds(0, 0);
  return rounded;
}

/** Take the calendar day from `picked`, keep the time of day from `base`. */
export function withDatePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  next.setSeconds(0, 0);
  return next;
}

/** Take the time of day from `picked`, keep the calendar day from `base`. */
export function withTimePart(base: Date, picked: Date): Date {
  const next = new Date(base);
  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  return next;
}

export function isInPast(date: Date, now: Date = new Date()): boolean {
  return date.getTime() <= now.getTime();
}

/** How far ahead a pickup may be booked. Matches the web product's 14 days. */
export function latestPickupAt(from: Date = new Date()): Date {
  return new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
}
