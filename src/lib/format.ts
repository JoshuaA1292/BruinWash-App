import { format, formatDistanceToNowStrict, isToday, isTomorrow } from 'date-fns';

export function formatPickupTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return `Today at ${format(d, 'h:mm a')}`;
  if (isTomorrow(d)) return `Tomorrow at ${format(d, 'h:mm a')}`;
  return format(d, 'EEE, MMM d at h:mm a');
}

export function formatRelative(iso: string): string {
  return `${formatDistanceToNowStrict(new Date(iso))} ago`;
}

export function formatRating(rating: number): string {
  return rating > 0 ? rating.toFixed(1) : 'New';
}
