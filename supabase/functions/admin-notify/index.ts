/**
 * admin-notify — the EMAIL half of "notify the admin on every new order".
 *
 * Spec 3.2 says the admin is alerted on every order by push AND/OR email. The
 * push half already happens: order_placed_admin is seeded with
 * channels {push,email}, so dispatch-push delivers it to the admin's devices.
 * This function is the email half and nothing else.
 *
 * It reads the order_placed_admin rows out of public.notifications — it never
 * renders its own copy. The wording lives in public.message_templates so it can
 * change without a deploy, and the trigger has already rendered it.
 *
 * GRACEFUL DEGRADATION. With no RESEND_API_KEY or no ADMIN_EMAIL this is a
 * logged no-op that still returns 200. The in-app feed and the admin push are
 * unaffected; only the email is skipped.
 *
 * CLAIMING. public.notifications has no email-state column and this function
 * does not own the schema, so the marker lives in the row's own jsonb:
 * data.email_sent_at is stamped before the send (the claim) and data.email_error
 * records a failure. A row is therefore attempted once and can never loop.
 *
 * INVOCATION. dispatch-push chains to this function whenever it has just handled
 * an order_placed_admin row, so with RESEND_API_KEY set the email goes out within
 * seconds of the order being paid and no scheduler is required. It is also safe
 * to invoke by hand or from pg_cron — see README.
 */
import { preflight, json, fail } from '../_shared/cors.ts';
import {
  type SupabaseClient,
  env,
  errorResponse,
  readJson,
  requireOperator,
  serviceClient,
} from '../_shared/supabase.ts';

const RESEND_URL = 'https://api.resend.com/emails';
const TEMPLATE_KEY = 'order_placed_admin';
/** Old rows are not worth emailing about; this also bounds the scan. */
const LOOKBACK_HOURS = 72;
const MAX_PER_RUN = 25;

interface NotificationRow {
  id: string;
  order_id: string | null;
  title: string;
  body: string;
  created_at: string;
  data: Record<string, unknown> | null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') return fail('Method not allowed.', 405);

    const admin = serviceClient();
    await requireOperator(req, admin);
    await readJson(req);

    const apiKey = env('RESEND_API_KEY');
    const recipients = (env('ADMIN_EMAIL') ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (!apiKey || recipients.length === 0) {
      console.warn(
        '[admin-notify] skipped: set RESEND_API_KEY and ADMIN_EMAIL to enable admin order emails.',
      );
      return json({ ok: true, skipped: 'not configured', sent: 0 });
    }

    const from = env('ADMIN_EMAIL_FROM', 'CampusWash <onboarding@resend.dev>') as string;
    const since = new Date(Date.now() - LOOKBACK_HOURS * 3600_000).toISOString();

    const { data: rows, error: readError } = await admin
      .from('notifications')
      .select('id, order_id, title, body, created_at, data')
      .eq('template_key', TEMPLATE_KEY)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(MAX_PER_RUN * 4);

    if (readError) throw new Error(`reading notifications: ${readError.message}`);

    // Filtered here rather than in the query: a jsonb-path filter is the one bit
    // of PostgREST syntax worth not betting the admin alerts on.
    const pending = ((rows ?? []) as NotificationRow[])
      .filter((r) => !r.data?.email_sent_at)
      .slice(0, MAX_PER_RUN);

    if (pending.length === 0) {
      return json({ ok: true, sent: 0, failed: 0 });
    }

    let sent = 0;
    let failed = 0;

    for (const row of pending) {
      // Claim first. Losing the claim means another invocation has it.
      const claimed = await claim(admin, row);
      if (!claimed) continue;

      const orderLine = row.order_id ? `Order ID: ${row.order_id}` : 'Order ID: (unknown)';
      const text = `${row.body}\n\n${orderLine}\nPlaced: ${row.created_at}`;
      const html =
        `<p>${escapeHtml(row.body)}</p>` +
        `<p style="color:#5b6b78;font-size:13px">${escapeHtml(orderLine)}<br>` +
        `Placed: ${escapeHtml(row.created_at)}</p>`;

      try {
        const res = await fetch(RESEND_URL, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from,
            to: recipients,
            subject: row.title,
            text,
            html,
          }),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => '');
          throw new Error(`Resend HTTP ${res.status}: ${detail.slice(0, 200)}`);
        }
        sent += 1;
      } catch (e) {
        failed += 1;
        const message = e instanceof Error ? e.message : String(e);
        console.error('[admin-notify] send failed:', message);
        await recordError(admin, row, message);
      }
    }

    return json({ ok: true, sent, failed, considered: pending.length });
  } catch (e) {
    return errorResponse(e, (message, status) => fail(message, status));
  }
});

/**
 * Stamps data.email_sent_at and returns true when this invocation won the row.
 * The jsonb filter is the real guard; if the deployed PostgREST cannot parse it
 * the claim still happens (an admin seeing one duplicate email beats an admin
 * seeing none), and the fallback is logged.
 */
async function claim(admin: SupabaseClient, row: NotificationRow): Promise<boolean> {
  const next = { ...(row.data ?? {}), email_sent_at: new Date().toISOString() };

  const { data, error } = await admin
    .from('notifications')
    .update({ data: next })
    .eq('id', row.id)
    .is('data->>email_sent_at', null)
    .select('id');

  if (!error) return (data ?? []).length > 0;

  console.warn('[admin-notify] jsonb claim filter unavailable, falling back:', error.message);
  const { error: fallbackError } = await admin
    .from('notifications')
    .update({ data: next })
    .eq('id', row.id);
  if (fallbackError) {
    console.error('[admin-notify] could not claim row:', fallbackError.message);
    return false;
  }
  return true;
}

/** Records why the email did not go out, without releasing the claim. */
async function recordError(
  admin: SupabaseClient,
  row: NotificationRow,
  message: string,
): Promise<void> {
  const next = {
    ...(row.data ?? {}),
    email_sent_at: new Date().toISOString(),
    email_error: message.slice(0, 500),
  };
  const { error } = await admin
    .from('notifications')
    .update({ data: next })
    .eq('id', row.id);
  if (error) console.error('[admin-notify] could not record email_error:', error.message);
}
