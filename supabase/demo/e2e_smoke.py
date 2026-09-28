#!/usr/bin/env python3
"""
End-to-end smoke test against the RUNNING LOCAL Supabase stack.

Unlike supabase/tests/run_migrations.sh — which exercises the SQL in a stubbed
Postgres — this drives the real thing: GoTrue sign-in, PostgREST, RLS as the
actual `authenticated` role, the RPCs, and the notification triggers. It is the
closest check to "does the product work" that is possible without Stripe keys.

    npx supabase start
    ./supabase/demo/reset_demo.sh
    python3 supabase/demo/e2e_smoke.py

It MUTATES the local demo database (books an order and runs it down the
pipeline), so re-run reset_demo.sh afterwards for a clean demo.
"""
import json, re, urllib.request, urllib.error, sys

log = open('/tmp/sb-start.log').read().strip().split('\n')[-1]
cfg = json.loads(re.search(r'\{.*\}', log).group())
API, ANON = cfg['API_URL'], cfg['ANON_KEY']

def call(method, path, token=None, body=None, prefer=None):
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('apikey', ANON)
    req.add_header('Authorization', f'Bearer {token or ANON}')
    req.add_header('Content-Type', 'application/json')
    if prefer: req.add_header('Prefer', prefer)
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try: return e.code, json.loads(raw)
        except Exception: return e.code, raw

def login(email):
    s, d = call('POST', '/auth/v1/token?grant_type=password',
                body={'email': email, 'password': 'demo1234'})
    assert s == 200 and d.get('access_token'), f'login {email} -> {s} {d}'
    return d['access_token']

ok = fail = 0
def check(label, cond, detail=''):
    global ok, fail
    if cond: ok += 1; print(f'  PASS  {label}')
    else:    fail += 1; print(f'  FAIL  {label}  {detail}')

print('=== 1. sign in ===')
req_t  = login('demo.requester@ucla.edu')
w1_t   = login('demo.washer@ucla.edu')
w2_t   = login('demo.washer2@ucla.edu')
adm_t  = login('demo.admin@ucla.edu')
check('all four demo accounts sign in', True)

print('=== 2. buildings + server pricing ===')
s, b = call('GET', '/rest/v1/buildings?select=id,name,slug&slug=eq.dykstra', req_t)
check('buildings readable', s == 200 and len(b) == 1, f'{s} {b}')
building_id = b[0]['id']

s, q = call('POST', '/rest/v1/rpc/price_order', req_t,
            {'p_tier': 'full', 'p_loads': 1})
check('price_order returns a quote', s == 200, f'{s} {q}')
check('Full tier CTA is $17.49', q.get('cta_cents') == 1749, str(q.get('cta_cents')))
check('liability cap is $25', q.get('liability_cap_cents') == 2500, str(q.get('liability_cap_cents')))

print('=== 3. privilege boundary (the critical fix) ===')
s, d = call('POST', '/rest/v1/rpc/cfg', req_t, {'p_key': 'service_role_key'})
check('cfg() is NOT callable by a signed-in student', s in (401, 403, 404),
      f'status {s} -> {str(d)[:120]}')
s, d = call('POST', '/rest/v1/rpc/enqueue_notification', req_t,
            {'p_user_id': '00000000-0000-0000-0000-000000000000',
             'p_order_id': None, 'p_key': 'x', 'p_vars': {}})
check('enqueue_notification() is NOT callable', s in (401, 403, 404), f'status {s}')

print('=== 4. booking ===')
s, o = call('POST', '/rest/v1/rpc/create_order', req_t, {
    'p_building_id': building_id, 'p_floor': '3', 'p_room_number': '312',
    'p_pickup_at': '2026-10-05T18:00:00Z', 'p_tier': 'full',
    'p_liability_ack': True, 'p_loads': 1, 'p_tip_cents': 300,
})
check('create_order succeeds', s == 200, f'{s} {o}')
order_id = o['id'] if s == 200 else None
if order_id:
    check('order priced server-side', o['service_fee_cents'] == 1499 and o['machine_cost_cents'] == 250,
          f"{o['service_fee_cents']}/{o['machine_cost_cents']}")
    check('tip recorded', o['tip_cents'] == 300, str(o['tip_cents']))

s, d = call('POST', '/rest/v1/rpc/create_order', req_t, {
    'p_building_id': building_id, 'p_floor': '3', 'p_room_number': None,
    'p_pickup_at': '2026-10-05T18:00:00Z', 'p_tier': 'full',
    'p_liability_ack': False,
})
check('booking without the liability checkbox is refused', s >= 400,
      f'status {s}')

print('=== 5. demo autopay stands in for the Stripe webhook ===')
s, o2 = call('GET', f'/rest/v1/orders?select=payment_status,status&id=eq.{order_id}', req_t)
check('order is paid', s == 200 and o2[0]['payment_status'] == 'paid', str(o2))

print('=== 6. automated messaging fan-out ===')
s, n = call('GET', '/rest/v1/notifications?select=template_key,title,body&order=created_at.desc', req_t)
keys = [x['template_key'] for x in n] if s == 200 else []
check('requester got the order-confirmed notification', 'order_placed_requester' in keys, str(keys))
body = next((x['body'] for x in n if x['template_key'] == 'order_placed_requester'), '')
check('spec copy verbatim',
      body == "Your order is confirmed! We're finding a Washer in your building. We'll notify you as soon as someone accepts.",
      body[:70])

s, nw = call('GET', '/rest/v1/notifications?select=template_key&template_key=eq.order_placed_washer', w1_t)
check('washer 1 was alerted', s == 200 and len(nw) >= 1, str(nw))
s, na = call('GET', '/rest/v1/notifications?select=template_key,body&template_key=eq.order_placed_admin', adm_t)
check('admin was alerted', s == 200 and len(na) >= 1, str(na))
if na: check('admin copy interpolates building/tier/time',
             na[0]['body'].startswith('New order placed — Dykstra Hall, Wash, Dry & Fold,'), na[0]['body'])

print('=== 7. the job board is narrow and same-building ===')
s, av = call('GET', '/rest/v1/available_orders?select=*', w1_t)
check('washer sees the job on the board', s == 200 and any(x['id'] == order_id for x in av), f'{s} {len(av) if s==200 else av}')
if s == 200 and av:
    check('board exposes NO requester_id', 'requester_id' not in av[0], str(list(av[0].keys())))
    check('board exposes NO room_number', 'room_number' not in av[0], str(list(av[0].keys())))
s, raw = call('GET', f'/rest/v1/orders?select=id&id=eq.{order_id}', w1_t)
check('washer canNOT read the raw order row before accepting', s == 200 and len(raw) == 0, f'{s} {raw}')

print('=== 8. accept race ===')
s, acc = call('POST', '/rest/v1/rpc/accept_order', w1_t, {'p_order_id': order_id})
check('first washer wins', s == 200 and acc.get('status') == 'accepted', f'{s} {str(acc)[:120]}')
s, lose = call('POST', '/rest/v1/rpc/accept_order', w2_t, {'p_order_id': order_id})
check('second washer is refused with a clear message',
      s >= 400 and 'already been accepted' in json.dumps(lose), f'{s} {str(lose)[:140]}')

print('=== 9. washer card (one-way visibility) ===')
s, card = call('GET', '/rest/v1/washer_cards?select=*', req_t)
check('requester sees the assigned washer card', s == 200 and len(card) == 1, f'{s} {card}')
if s == 200 and card:
    check('card shows first name only', card[0].get('first_name') == 'Jordan' and 'last_name' not in card[0], str(card[0]))
    check('card carries a real rating', float(card[0]['avg_rating']) == 5.0, str(card[0]['avg_rating']))
    check('card carries completed order count', int(card[0]['completed_orders']) >= 2, str(card[0]['completed_orders']))
s, prof = call('GET', '/rest/v1/profiles?select=id,first_name', w1_t)
check('washer can only read their OWN profile', s == 200 and len(prof) == 1, f'{s} {prof}')

print('=== 10. pipeline ===')
s, _ = call('POST', '/rest/v1/rpc/set_washer_en_route', w1_t, {'p_order_id': order_id})
check('washer goes en route', s == 200, str(s))
s, n2 = call('GET', '/rest/v1/notifications?select=body&template_key=eq.washer_en_route_requester', req_t)
check('en-route copy is verbatim',
      s == 200 and n2 and n2[0]['body'] == 'Jordan is on the way to pick up your laundry. Make sure your bag is ready!',
      str(n2)[:120])

for stage in ['picked_up', 'washing', 'out_for_delivery']:
    s, _ = call('POST', '/rest/v1/rpc/advance_order_status', w1_t,
                {'p_order_id': order_id, 'p_to': stage})
    check(f'advance to {stage}', s == 200, str(s))

s, d = call('POST', '/rest/v1/rpc/advance_order_status', w1_t,
            {'p_order_id': order_id, 'p_to': 'delivered'})
check('delivery is refused without a photo', s >= 400 and 'photo is required' in json.dumps(d), f'{s} {str(d)[:120]}')
s, d = call('POST', '/rest/v1/rpc/advance_order_status', w1_t,
            {'p_order_id': order_id, 'p_to': 'delivered', 'p_photo_path': 'bogus/x.jpg'})
check('a forged photo path is refused', s >= 400 and 'does not belong' in json.dumps(d), f'{s} {str(d)[:120]}')

print()
print(f'{ok} passed, {fail} failed')
sys.exit(1 if fail else 0)
