/**
 * dispatch-push — delivers the in-app notification feed to devices.
 *
 * Invoked by the public.kick_push_dispatch() database trigger (via pg_net) with
 * the service-role key as its bearer token and an empty `{}` body. It is also
 * safe to invoke by hand, on a schedule, or twice at once.
 *
 * Shape of the work:
 *   public.notifications  (push_sent_at is null)
 *     -> filter on data.channels containing 'push'
 *     -> claim the rows (see "claiming" below)
 *     -> join public.push_tokens for each recipient
 *     -> POST batches of <=100 to the Expo Push API
 *     -> stamp push_error on anything that did not land
 *     -> delete tokens Expo reports as DeviceNotRegistered
 *
 * CLAIMING. There is no attempt counter on public.notifications, so push_sent_at
 * doubles as the claim: a single `update ... where push_sent_at is null` is
 * atomic per row, so two concurrent invocations can never claim the same row.
 * A row that then fails keeps its push_sent_at stamp and gains a push_error, so
 * a permanently bad row is attempted exactly once and can never loop forever.
 * Read it as "dispatch attempted at"; push_error null means it actually landed.
 *
 * AUTOMATED COPY IS NEVER CHAT. This function reads public.notifications only.
 * It never touches public.messages. Chat rows arrive here as notification rows
 * with data.kind === 'chat' (written by the on_message_notify trigger) and are
 * pushed like anything else — the app's feed UI is what filters them out.
 */
import { preflight, json, fail } from '../_shared/cors.ts';
import {
  chunk,
  env,
  errorResponse,
  readJson,
  requireOperator,
  serviceClient,
  serviceRoleKey,
  supabaseUrl,
} from '../_shared/supabase.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** The Expo Push API accepts at most 100 messages per request. */
const EXPO_BATCH_SIZE = 100;
/** Ceiling on one invocation, so a backlog cannot blow the function timeout. */
/** template_key on the push-only rows written for a manual chat message. */
const CHAT_TEMPLATE_KEY = 'chat_message';

const MAX_ROWS_PER_RUN = 200;
/**
 * Expo rejects an entire batch when one `to` value is malformed, which would
 * take healthy messages down with it — so tokens are shape-checked first.
 */
const EXPO_TOKEN_RE = /^Expo(nent)?PushToken\[[^\]]+\]$/;

interface NotificationRow {
  id: string;
  user_id: string;
  order_id: string | null;
  template_key: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
}

interface TokenRow {
  user_id: string;
  token: string;
  platform: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  badge?: number;
  priority: 'high';
  channelId: 'default';
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoResponse {
  data?: ExpoTicket[];
  errors?: { code?: string; message?: string }[];
}

/**
 * True when this row is meant to go out over push. Templates carry their
 * channels in message_templates.channels, which enqueue_notification() copies
 * onto data.channels — so `order_delivered_washer` ({in_app}) is never pushed.
 * A row with no channels at all is treated as pushable: that is the historical
 * default and it fails safe towards delivery rather than silence.
 */
function wantsPush(row: NotificationRow): boolean {
  const channels = row.data?.channels;
  if (!Array.isArray(channels)) return true;
  return channels.some((c) => String(c) === 'push');
}

Deno.serve(async (req: Request): Promise<Response> => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== 'POST') return fail('Method not allowed.', 405);

    const admin = serviceClient();
    // verify_jwt only proves the token belongs to this project — any signed-in
    // student would otherwise be able to trigger a dispatch run.
    await requireOperator(req, admin);
    await readJson(req); // drains the trigger's empty body

    // ------------------------------------------------- 1. find candidates ---
    const { data: candidates, error: readError } = await admin
      .from('notifications')
      .select('id, user_id, order_id, template_key, title, body, data')
      .is('push_sent_at', null)
      .order('created_at', { ascending: true })
      .limit(MAX_ROWS_PER_RUN);

    if (readError) throw new Error(`reading notifications: ${readError.message}`);

    const rows = (candidates ?? []) as NotificationRow[];
    if (rows.length === 0) {
      return json({ ok: true, claimed: 0, sent: 0, failed: 0, skipped: 0 });
    }

    const sawAdminOrder = rows.some((r) => r.template_key === 'order_placed_admin');

    // -------------------------------- 2. retire the in_app-only rows first ---
    // They are stamped rather than left behind, otherwise every future run would
    // rescan them and a burst of in_app-only rows could starve real pushes.
    const skipRows = rows.filter((r) => !wantsPush(r));
    if (skipRows.length > 0) {
      const { error } = await admin
        .from('notifications')
        .update({
          push_sent_at: new Date().toISOString(),
          push_error: 'skipped: push is not in data.channels',
        })
        .in('id', skipRows.map((r) => r.id))
        .is('push_sent_at', null);
      if (error) console.error('[push] could not retire in_app-only rows:', error.message);
    }

    const pushRows = rows.filter(wantsPush);
    if (pushRows.length === 0) {
      return json({ ok: true, claimed: 0, sent: 0, failed: 0, skipped: skipRows.length });
    }

    // --------------------------------------------------------- 3. claim -----
    const { data: claimedIdRows, error: claimError } = await admin
      .from('notifications')
      .update({ push_sent_at: new Date().toISOString() })
      .in('id', pushRows.map((r) => r.id))
      .is('push_sent_at', null)
      .select('id');

    if (claimError) throw new Error(`claiming notifications: ${claimError.message}`);

    const claimedIds = new Set((claimedIdRows ?? []).map((r) => (r as { id: string }).id));
    const claimed = pushRows.filter((r) => claimedIds.has(r.id));
    if (claimed.length === 0) {
      // Another invocation got there first. Nothing to do and nothing to undo.
      return json({ ok: true, claimed: 0, sent: 0, failed: 0, skipped: skipRows.length });
    }

    const recipients = [...new Set(claimed.map((r) => r.user_id))];

    // ---------------------------------------------- 4. devices + badges -----
    const { data: tokenRows, error: tokenError } = await admin
      .from('push_tokens')
      .select('user_id, token, platform')
      .in('user_id', recipients);

    if (tokenError) throw new Error(`reading push tokens: ${tokenError.message}`);

    const tokensByUser = new Map<string, string[]>();
    for (const t of (tokenRows ?? []) as TokenRow[]) {
      const list = tokensByUser.get(t.user_id) ?? [];
      list.push(t.token);
      tokensByUser.set(t.user_id, list);
    }

    // Badge = the recipient's unread FEED count, so the app icon matches what
    // /inbox actually shows. chat_message rows are excluded: they exist only to
    // carry a push, the feed never lists them, and so nothing there can clear
    // them -- counting them left a badge the user could never zero out.
    const badgeByUser = new Map<string, number>();
    const { data: unreadRows } = await admin
      .from('notifications')
      .select('user_id')
      .is('read_at', null)
      .neq('template_key', CHAT_TEMPLATE_KEY)
      .in('user_id', recipients)
      .limit(5000);
    for (const r of (unreadRows ?? []) as { user_id: string }[]) {
      badgeByUser.set(r.user_id, (badgeByUser.get(r.user_id) ?? 0) + 1);
    }

    // ------------------------------------------------- 5. build messages ----
    const messages: ExpoMessage[] = [];
    /** Parallel to `messages`: which notification and token each one came from. */
    const owners: { notificationId: string; token: string }[] = [];
    const errorsById = new Map<string, string>();
    const deliveredIds = new Set<string>();

    for (const row of claimed) {
      const all = tokensByUser.get(row.user_id) ?? [];
      if (all.length === 0) {
        errorsById.set(row.id, 'no registered device');
        continue;
      }
      const tokens = all.filter((t) => EXPO_TOKEN_RE.test(t));
      if (tokens.length === 0) {
        errorsById.set(row.id, 'no valid Expo push token for this user');
        continue;
      }
      const kind = typeof row.data?.kind === 'string' ? (row.data.kind as string) : 'system';
      for (const token of tokens) {
        messages.push({
          to: token,
          title: row.title,
          body: row.body,
          // The app deep-links off these three keys (see NotificationsProvider).
          data: {
            order_id: row.order_id,
            template_key: row.template_key,
            kind,
            notification_id: row.id,
          },
          sound: 'default',
          badge: badgeByUser.get(row.user_id),
          priority: 'high',
          channelId: 'default',
        });
        owners.push({ notificationId: row.id, token });
      }
    }

    // ------------------------------------------------------ 6. send ---------
    const deadTokens = new Set<string>();
    const accessToken = env('EXPO_ACCESS_TOKEN');
    const batches = chunk(messages, EXPO_BATCH_SIZE);
    let offset = 0;

    for (const batch of batches) {
      const batchOwners = owners.slice(offset, offset + batch.length);
      offset += batch.length;

      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-Encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify(batch),
        });

        const payload = (await res.json().catch(() => null)) as ExpoResponse | null;

        if (!res.ok) {
          const message =
            payload?.errors?.[0]?.message ?? `Expo push failed (HTTP ${res.status})`;
          for (const owner of batchOwners) errorsById.set(owner.notificationId, message);
          continue;
        }

        const tickets = payload?.data ?? [];
        batchOwners.forEach((owner, i) => {
          const ticket = tickets[i];
          if (!ticket) {
            errorsById.set(owner.notificationId, 'Expo returned no receipt');
            return;
          }
          if (ticket.status === 'ok') {
            deliveredIds.add(owner.notificationId);
            return;
          }
          // A token Expo will never deliver to again: drop the device row so the
          // next run does not waste a slot on it.
          if (ticket.details?.error === 'DeviceNotRegistered') {
            deadTokens.add(owner.token);
          }
          errorsById.set(owner.notificationId, ticket.message ?? 'Expo rejected the message');
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        for (const owner of batchOwners) errorsById.set(owner.notificationId, message);
      }
    }

    // A notification with several devices counts as delivered if any one landed.
    for (const id of deliveredIds) errorsById.delete(id);

    // ------------------------------------------- 7. record what went wrong ---
    // Grouped by message so a burst of identical failures is one update.
    if (errorsById.size > 0) {
      const byMessage = new Map<string, string[]>();
      for (const [id, message] of errorsById) {
        const list = byMessage.get(message) ?? [];
        list.push(id);
        byMessage.set(message, list);
      }
      for (const [message, ids] of byMessage) {
        const { error } = await admin
          .from('notifications')
          .update({ push_error: message.slice(0, 500) })
          .in('id', ids);
        if (error) console.error('[push] could not record push_error:', error.message);
      }
    }

    if (deadTokens.size > 0) {
      const { error } = await admin
        .from('push_tokens')
        .delete()
        .in('token', [...deadTokens]);
      if (error) console.error('[push] could not delete dead tokens:', error.message);
    }

    // ------------------------------- 8. hand the admin EMAIL half onward -----
    // order_placed_admin is seeded {push,email}; the push half just went out, so
    // nudge admin-notify for the email half. Fire-and-forget: a failure here
    // must never make a successful push run look like a failure.
    if (sawAdminOrder && env('ADMIN_NOTIFY_CHAIN', 'on') !== 'off' && env('RESEND_API_KEY')) {
      try {
        await fetch(`${supabaseUrl()}/functions/v1/admin-notify`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${serviceRoleKey()}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        console.warn('[push] admin-notify chain failed:', (e as Error).message);
      }
    }

    return json({
      ok: true,
      claimed: claimed.length,
      messages: messages.length,
      sent: deliveredIds.size,
      failed: errorsById.size,
      skipped: skipRows.length,
      tokens_deleted: deadTokens.size,
    });
  } catch (e) {
    return errorResponse(e, (message, status) => fail(message, status));
  }
});
