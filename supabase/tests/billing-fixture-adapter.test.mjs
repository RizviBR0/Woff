// Run from E:\Woff: node --test supabase/tests/billing-fixture-adapter.test.mjs
// Resets only woff_billing_fixture, briefly binds loopback 55440, then closes.
// No env files, hosted Supabase services, or payment-provider calls are used.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import {
  asFixtureUser, BILLING_FIXTURE_DATABASE, BILLING_FIXTURE_PG, createFixturePool,
  FIXTURE_API, FIXTURE_ANON_KEY, FIXTURE_DATABASE, FIXTURE_PG,
  fixtureJwt, fixtureServiceRoleKey, fixtureSession, startFixtureTransport,
} from './browser-fixture-transport.mjs';

const options = Object.freeze({ billingTestMode: true });
const authOptions = { persistSession: false, autoRefreshToken: false };

test('profiles and service keys require explicit bounded opt-in', async () => {
  assert.equal(FIXTURE_DATABASE, 'woff_browser_fixture');
  assert.equal(FIXTURE_PG, 'postgresql://postgres@127.0.0.1:55439/woff_browser_fixture');
  assert.equal(BILLING_FIXTURE_PG, 'postgresql://postgres@127.0.0.1:55439/woff_billing_fixture');
  assert.throws(() => fixtureServiceRoleKey(), /explicit billing Test mode/);
  assert.throws(() => fixtureServiceRoleKey({ billingTestMode: false }), /explicit billing Test mode/);
  assert.throws(() => fixtureJwt({ role: 'service_role' }), /explicit billing Test mode/);
  assert.throws(() => createFixturePool({ database: 'postgres' }), /Unsupported fixture profile/);
  assert.throws(() => createFixturePool({ billingTestMode: 'true' }), /Unsupported fixture profile/);
  const defaultPool = createFixturePool();
  try {
    assert.equal(defaultPool.options.connectionString, FIXTURE_PG);
    await assert.rejects(asFixtureUser(defaultPool, { role: 'service_role', fixture: 'billing-test' },
      () => { throw new Error('Role rejection must precede database access'); }, options), /Unsupported fixture database role/);
  } finally { await defaultPool.end(); }
});

test('billing adapter supports SDK flow while PostgreSQL grants and RLS remain authoritative', async t => {
  const fixture = await startFixtureTransport(options);
  t.after(() => fixture.close());
  const admin = createClient(FIXTURE_API, fixtureServiceRoleKey(options), { auth: authOptions });
  const userId = randomUUID();
  const otherId = randomUUID();
  const rows = (await fixture.pool.query(`insert into auth.users(id,email,email_confirmed_at,is_anonymous)
    values($1,'fixture-billing@example.invalid',now(),false),($2,'fixture-other@example.invalid',now(),false) returning *`,
  [userId, otherId])).rows;
  const row = rows.find(value => value.id === userId);
  const session = fixtureSession(row);
  const user = createClient(FIXTURE_API, FIXTURE_ANON_KEY, {
    auth: authOptions, global: { headers: { Authorization: `Bearer ${session.access_token}` } },
  });
  const other = createClient(FIXTURE_API, FIXTURE_ANON_KEY, {
    auth: authOptions, global: { headers: { Authorization: `Bearer ${fixtureSession(rows.find(value => value.id === otherId)).access_token}` } },
  });
  const anon = createClient(FIXTURE_API, FIXTURE_ANON_KEY, { auth: authOptions });
  const record = { p_user_id: userId, p_reservation_id: randomUUID(), p_checkout_url: 'https://fixture.lemonsqueezy.com/checkout/test-adapter' };

  await t.test('fixed database, loopback listener and verified Auth getUser', async () => {
    assert.equal(fixture.database, BILLING_FIXTURE_DATABASE);
    assert.equal(fixture.server.address().address, '127.0.0.1');
    const health = await (await fetch(`${FIXTURE_API}/__fixture/health`)).json();
    assert.equal(health.database, BILLING_FIXTURE_DATABASE);
    const { data, error } = await user.auth.getUser(session.access_token);
    assert.ifError(error);
    assert.equal(data.user.id, userId);
    assert.equal(data.user.is_anonymous, false);
    assert.ok(data.user.email_confirmed_at);
    const parts = session.access_token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url')), sub: otherId })).toString('base64url');
    assert.ok((await user.auth.getUser(parts.join('.'))).error);
    assert.ok((await user.auth.getUser(fixtureJwt({ role: 'authenticated', sub: userId, exp: 0 }))).error);
  });

  await t.test('authenticated account and reservation RPCs use real SQL', async () => {
    assert.ifError((await user.rpc('ensure_sender_account')).error);
    assert.ifError((await other.rpc('ensure_sender_account')).error);
    assert.ifError((await user.rpc('get_sender_account')).error);
    const closed = await user.rpc('reserve_sender_checkout');
    assert.equal(closed.error.message, 'Checkout capacity is not ready');
    await fixture.pool.query(`update woff_private.pilot_capacity set checkout_enabled=true,
      capacity_bytes=10737418240,max_paid_accounts=5,billing_test_mode=true where id=1`);
    const reserved = await user.rpc('reserve_sender_checkout');
    assert.ifError(reserved.error);
    assert.ok(reserved.data.reservation_id);
    record.p_reservation_id = reserved.data.reservation_id;
    assert.equal((await user.rpc('release_sender_checkout', { p_reservation_id: record.p_reservation_id })).data, false);
    assert.equal((await anon.rpc('reserve_sender_checkout')).error.code, '42501');
  });

  await t.test('service RPCs are unavailable to authenticated users and browser requests', async () => {
    assert.equal((await user.rpc('record_sender_checkout', record)).error.code, '42501');
    const rpcCount = fixture.stats.rpc;
    for (const headers of [{ Origin: 'http://localhost:3002' }, { 'User-Agent': 'Mozilla/5.0' }, { 'Sec-Fetch-Site': 'same-origin' }]) {
      const response = await fetch(`${FIXTURE_API}/rest/v1/rpc/record_sender_checkout`, {
        method: 'POST', headers: { Authorization: `Bearer ${fixtureServiceRoleKey(options)}`, 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(record),
      });
      assert.equal(response.status, 400);
    }
    assert.equal(fixture.stats.rpc, rpcCount);
    assert.ok((await admin.rpc('ensure_sender_account')).error);
    const result = await admin.rpc('record_sender_checkout', record);
    assert.ifError(result.error);
    assert.equal(result.data, true);
    const retry = await user.rpc('reserve_sender_checkout');
    assert.ifError(retry.error);
    assert.equal(retry.data.checkout_url, record.p_checkout_url);
  });

  const event = {
    p_event_key: 'a'.repeat(64), p_event_name: 'subscription_created', p_occurred_at: new Date().toISOString(),
    p_user_id: userId, p_customer_id: '567', p_subscription_id: '987', p_status: 'active',
    p_pro_until: new Date(Date.now() + 86400000).toISOString(), p_test_mode: true,
    p_payload: { resource_type: 'subscriptions', resource_id: '987' },
    p_reservation_id: record.p_reservation_id, p_capacity_reserved: true,
  };

  await t.test('filtered service lookup and Test-mode event persistence support webhook SDK calls', async () => {
    const missing = await admin.from('sender_entitlements').select('user_id, customer_id').eq('subscription_id', '987').maybeSingle();
    assert.ifError(missing.error);
    assert.equal(missing.data, null);
    assert.equal((await user.rpc('process_billing_event', event)).error.code, '42501');
    assert.ok((await admin.rpc('process_billing_event', { ...event, p_test_mode: false })).error);
    const result = await admin.rpc('process_billing_event', event);
    assert.ifError(result.error);
    assert.equal(result.data.processed, true);
    assert.equal(result.data.is_pro, true);
    const mapped = await admin.from('sender_entitlements').select('user_id, customer_id').eq('subscription_id', '987').maybeSingle();
    assert.ifError(mapped.error);
    assert.deepEqual(mapped.data, { user_id: userId, customer_id: '567' });
    assert.equal((await admin.from('sender_entitlements').select('user_id').eq('customer_id', '567').maybeSingle()).data.user_id, userId);
    const duplicate = await admin.rpc('process_billing_event', event);
    assert.ifError(duplicate.error);
    assert.equal(duplicate.data.ignored, 'duplicate');
  });

  await t.test('entitlement reads remain bounded and enforce ownership RLS', async () => {
    const owned = await user.from('sender_entitlements').select('plan, subscription_id, customer_id').eq('user_id', userId).maybeSingle();
    assert.ifError(owned.error);
    assert.equal(owned.data.plan, 'pro');
    const invisible = await other.from('sender_entitlements').select('plan').eq('user_id', userId).maybeSingle();
    assert.ifError(invisible.error);
    assert.equal(invisible.data, null);
    assert.ok((await admin.from('sender_entitlements').select('*')).error);
    assert.ok((await admin.from('sender_entitlements').select('*').eq('user_id', userId)).error);
    assert.ok((await admin.from('sender_entitlements').update({ plan: 'free' }).eq('subscription_id', '987')).error);
  });

  await t.test('actual service_role respects revoked PostgreSQL EXECUTE grants', async () => {
    await assert.rejects(asFixtureUser(fixture.pool, { role: 'service_role', fixture: 'billing-test' },
      () => assert.fail('Unsigned service claims must be rejected'), options), /Unsupported fixture database role/);
    const role = await asFixtureUser(fixture.pool, fixtureServiceRoleKey(options),
      async client => (await client.query('select current_user role')).rows[0].role, options);
    assert.equal(role, 'service_role');
    await fixture.pool.query('revoke execute on function public.record_sender_checkout(uuid,uuid,text) from service_role');
    try { assert.equal((await admin.rpc('record_sender_checkout', record)).error.code, '42501'); }
    finally { await fixture.pool.query('grant execute on function public.record_sender_checkout(uuid,uuid,text) to service_role'); }
  });

  await t.test('errors and health stats omit submitted payload text', async () => {
    const marker = 'SENSITIVE_FIXTURE_PAYLOAD_MUST_STAY_PRIVATE';
    const response = await fetch(`${FIXTURE_API}/rest/v1/rpc/process_billing_event`, {
      method: 'POST', headers: { Authorization: `Bearer ${fixtureServiceRoleKey(options)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...event, p_user_id: marker }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).details, null);
    const malformed = await fetch(`${FIXTURE_API}/rest/v1/rpc/record_sender_checkout`, {
      method: 'POST', headers: { Authorization: `Bearer ${fixtureServiceRoleKey(options)}`, 'Content-Type': 'application/json' },
      body: `{${marker}`,
    });
    assert.equal(malformed.status, 400);
    assert.ok(!(await malformed.text()).includes(marker));
    assert.ok(!(await (await fetch(`${FIXTURE_API}/__fixture/health`)).text()).includes(marker));
  });
});
