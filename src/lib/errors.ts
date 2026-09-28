import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Our RPCs raise friendly, user-facing messages on purpose (see the
 * SECURITY DEFINER functions in supabase/migrations). Surface those directly
 * rather than a generic failure, but never leak raw Postgres noise.
 */
const POSTGRES_NOISE = [
  'permission denied',
  'row-level security',
  'violates',
  'duplicate key',
  'null value in column',
  'syntax error',
  'relation ',
];

export function friendlyError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const raw =
    typeof error === 'string'
      ? error
      : ((error as PostgrestError | Error | null)?.message ?? '');

  if (!raw) return fallback;

  const lower = raw.toLowerCase();
  if (POSTGRES_NOISE.some((n) => lower.includes(n))) return fallback;

  // Supabase auth phrasing that reads badly to a student.
  if (lower.includes('invalid login credentials')) {
    return 'That email and password combination does not match an account.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Please verify your .edu email address first — check your inbox for the link.';
  }
  if (lower.includes('user already registered')) {
    return 'An account already exists for that email. Try logging in instead.';
  }

  return raw;
}

/** Matches the .edu rule enforced by handle_new_user() in the database. */
const EDU_EMAIL = /^[^@\s]+@([a-z0-9-]+\.)*[a-z0-9-]+\.edu$/i;

export function isEduEmail(email: string): boolean {
  return EDU_EMAIL.test(email.trim().toLowerCase());
}
