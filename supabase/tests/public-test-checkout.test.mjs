// Recreates only an explicitly named disposable database on the loopback fixture.
// Exercises database authorization/accounting, not a provider or Storage HTTP API.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('internal/db-runtime/local-fixture.cjs'));
const { Client } = require('pg');
const base = 'postgresql://postgres@127.0.0.1:55439/';
const database = 'woff_public_test_checkout_test';
const connectionString = base + database;
const admin = new Client({ connectionString: base + 'postgres' });
await admin.connect();
await admin.query(`drop database if exists ${database} with (force)`);
await admin.query(`create database ${database}`);
await admin.end();
const db = new Client({ connectionString });
await db.connect();
const MiB = 1024 ** 2;
const GiB = 1024 ** 3;
let passed = 0;
try {
  await db.query(await readFile('supabase/tests/platform-bootstrap.sql', 'utf8'));
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = (await readFile(path.join('supabase/migrations', file), 'utf8'))
      .replace(/create extension if not exists pg_net with schema extensions;/i, '-- local no-network HTTP stub');
    try { await db.query(sql); } catch (error) { error.message = `${file}: ${error.message}`; throw error; }
  }
  const users = Array.from({ length: 7 }, (_, i) => `00000000-0000-4000-9000-${String(i + 101).padStart(12, '0')}`);
  for (const [i, user] of users.entries()) {
    await db.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',
      [user, `billing-boundary-${i}@example.invalid`]);
  }
  async function as(user, fn, client = db) {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: 'authenticated' })]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) { await client.query('rollback'); throw error; }
  }
  async function rpc(user, sql, params = []) {
    return as(user, async c => (await c.query(sql, params)).rows[0]?.result);
  }
  async function service(fn) {
    await db.query('begin');
    try {
      await db.query('set local role service_role');
      const result = await fn(db);
      await db.query('commit');
      return result;
    } catch (error) { await db.query('rollback'); throw error; }
  }
  async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`); }
  async function committed() { return Number((await db.query('select woff_private.committed_storage_bytes() result')).rows[0].result); }
  const eventSQL = 'select public.process_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result';
  const occurred = new Date(Date.now() - 20 * 60 * 1000);
  const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  function event(label, i, reservation, { mode = true, status = 'active', offset = 0, reserve = true } = {}) {
    return [createHash('sha256').update(label).digest('hex'), 'subscription_updated',
      new Date(occurred.getTime() + offset), users[i], String(1000 + i), String(2000 + i),
      status, paidUntil, mode, {}, reservation, reserve];
  }
  async function bill(params) { return service(async c => (await c.query(eventSQL, params)).rows[0].result); }
  for (const user of users) await rpc(user, 'select public.ensure_sender_account() result');

  await check('missing configuration fails closed without creating a checkout or billing grant', async () => {
    await db.query('delete from woff_private.pilot_capacity where id=1');
    await assert.rejects(rpc(users[0], 'select public.reserve_sender_checkout() result'), /not ready/);
    assert.equal(Number((await db.query('select count(*) from woff_private.sender_checkout_reservations')).rows[0].count), 0);
    assert.equal((await db.query('select woff_private.upload_capacity_available($1,1) result', [users[0]])).rows[0].result, false);
    await assert.rejects(bill(event('missing-configuration', 0, null)), /Billing mode mismatch/);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events')).rows[0].count), 0);
    assert.equal((await rpc(users[0], 'select public.get_sender_account() result')).is_pro, false);
    await db.query('insert into woff_private.pilot_capacity(id) values(1)');
  });
  await check('Live checkout stays closed on the unchanged 800 MiB shared budget', async () => {
    await db.query('update woff_private.pilot_capacity set checkout_enabled=true,capacity_bytes=$1 where id=1', [800 * MiB]);
    await assert.rejects(rpc(users[0], 'select public.reserve_sender_checkout() result'), /pilot is full/);
    assert.equal(Number((await db.query('select count(*) from woff_private.sender_checkout_reservations')).rows[0].count), 0);
  });
  const leases = [];
  await check('Test checkout admits five verified senders without reserving fictitious storage', async () => {
    await db.query('update woff_private.pilot_capacity set billing_test_mode=true where id=1');
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('files','retained-orphan',$1)", [{ size: 799 * MiB }]);
    for (const user of users.slice(0, 5)) leases.push(await rpc(user, 'select public.reserve_sender_checkout() result'));
    assert.equal(await committed(), 799 * MiB);
    await assert.rejects(rpc(users[5], 'select public.reserve_sender_checkout() result'), /pilot is full/);
    const modes = (await db.query('select billing_test_mode from woff_private.sender_checkout_reservations')).rows;
    assert.equal(modes.length, 5);
    assert.ok(modes.every(row => row.billing_test_mode === true));
  });
  await check('Test leases cannot be processed by browsers or Live events', async () => {
    const params = event('initial-test', 0, leases[0].reservation_id);
    await assert.rejects(as(users[0], c => c.query(eventSQL, params)), /permission denied/);
    await assert.rejects(bill(event('wrong-global-mode', 0, leases[0].reservation_id, { mode: false })), /mode mismatch/);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events')).rows[0].count), 0);
    assert.equal((await bill(params)).is_pro, true);
    assert.equal((await bill(event('second-test', 1, leases[1].reservation_id))).is_pro, true);
    assert.equal(await committed(), 799 * MiB);
  });
  const rooms = [];
  await check('Test payments unlock genuine Pro identity and template features', async () => {
    for (const [i, user] of users.slice(0, 2).entries()) {
      const account = await rpc(user, 'select public.get_sender_account() result');
      assert.equal(account.is_pro, true);
      assert.equal(account.plan, 'pro');
      const made = await rpc(user, 'select public.create_space($1) result', [`Test sender ${i}`]);
      rooms.push(made.space);
      const updated = await rpc(user, 'select public.update_room_identity($1,$2,$3) result',
        [made.space.id, `Sender ${i}`, `test-sender-${i}`]);
      assert.equal(updated.space.slug, `test-sender-${i}`);
      assert.equal(updated.space.name, `Sender ${i}`);
      const template = await rpc(user, 'select public.save_sender_template($1) result', [{ name: `Handoff ${i}` }]);
      assert.equal(template.name, `Handoff ${i}`);
    }
  });
  let winner;
  await check('concurrent Test Pro uploads cannot exceed the real shared hard cap', async () => {
    const a = new Client({ connectionString }), b = new Client({ connectionString });
    await Promise.all([a.connect(), b.connect()]);
    try {
      const results = await Promise.all([a, b].map((client, i) => as(users[i], async c =>
        (await c.query('select public.reserve_upload($1,$2,$3,$4) result',
          [rooms[i].id, `${rooms[i].id}/concurrent`, MiB, 'application/octet-stream'])).rows[0].result, client)));
      assert.equal(results.filter(Boolean).length, 1);
      winner = results.indexOf(true);
      assert.equal(await committed(), 800 * MiB);
      assert.equal(await rpc(users[1 - winner], 'select public.reserve_upload($1,$2,$3,$4) result',
        [rooms[1 - winner].id, `${rooms[1 - winner].id}/over-budget`, 1, 'text/plain']), false);
    } finally { await Promise.all([a.end(), b.end()]); }
  });
  await check('uploaded and cancelled bytes remain charged until physical cleanup removes them', async () => {
    const uploaded = `${rooms[winner].id}/concurrent`;
    await as(users[winner], c => c.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      ['files', uploaded, users[winner], { size: MiB, mimetype: 'application/octet-stream' }]));
    assert.equal(await committed(), 800 * MiB); // Uploaded object plus lease counted once.
    assert.equal(await rpc(users[winner], 'select public.cancel_upload_reservations($1,$2) result', [rooms[winner].id, [uploaded]]), 1);
    assert.equal(await committed(), 800 * MiB);
    assert.equal(await rpc(users[winner], 'select public.reserve_upload($1,$2,$3,$4) result',
      [rooms[winner].id, `${rooms[winner].id}/before-cleanup`, 1, 'text/plain']), false);
    await db.query('delete from storage.objects where name=$1', [uploaded]);
    assert.equal(await committed(), 799 * MiB);
    assert.equal(await rpc(users[winner], 'select public.reserve_upload($1,$2,$3,$4) result',
      [rooms[winner].id, `${rooms[winner].id}/after-cleanup`, 1, 'text/plain']), true);
  });
  await check('a mode change cannot convert existing Test access, subscriptions, or leases into Live proof', async () => {
    await service(c => c.query('select public.record_sender_checkout($1,$2,$3)',
      [users[2], leases[2].reservation_id, 'https://woff.lemonsqueezy.com/checkout/test-mode-binding']));
    await db.query('update woff_private.pilot_capacity set billing_test_mode=false where id=1');
    const account = await rpc(users[0], 'select public.get_sender_account() result');
    assert.equal(account.is_pro, false);
    assert.equal(account.plan, 'free');
    await assert.rejects(rpc(users[0], 'select public.save_sender_template($1) result', [{ name: 'No Live proof' }]), /Pro is required/);
    await assert.rejects(rpc(users[0], 'select public.update_room_identity($1,$2,null) result', [rooms[0].id, 'No Live proof']), /Pro is required/);
    await assert.rejects(bill(event('test-sub-with-live-stamp', 0, null, { mode: false, offset: 1000 })), /Subscription mode mismatch/);
    await assert.rejects(bill(event('test-lease-with-live-stamp', 2, leases[2].reservation_id, { mode: false })), /Checkout mode mismatch/);
    await assert.rejects(rpc(users[2], 'select public.reserve_sender_checkout() result'), /Checkout mode mismatch/);
    const recorded = await service(async c => (await c.query('select public.record_sender_checkout($1,$2,$3) result',
      [users[3], leases[3].reservation_id, 'https://woff.lemonsqueezy.com/checkout/wrong-mode'])).rows[0].result);
    assert.equal(recorded, false);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events')).rows[0].count), 2);
    assert.equal(await committed(), 799 * MiB + 1);
    await db.query('update woff_private.pilot_capacity set billing_test_mode=true where id=1');
    assert.equal((await rpc(users[0], 'select public.get_sender_account() result')).is_pro, true);
  });
  await check('duplicate, stale, cancellation, and refund handling remain valid for Test payments', async () => {
    assert.equal((await bill(event('initial-test', 0, leases[0].reservation_id))).ignored, 'duplicate');
    assert.equal((await bill(event('stale-test', 0, null, { status: 'expired', offset: -1000 }))).ignored, 'stale');
    assert.equal((await bill(event('cancelled-test', 0, null, { status: 'cancelled', offset: 2000 }))).is_pro, true);
    assert.equal((await bill(event('refunded-test', 0, null, { status: 'refunded', offset: 3000 }))).is_pro, false);
    assert.equal((await bill(event('failure-after-refund', 0, null, { status: 'past_due', offset: 4000 }))).is_pro, false);
    const account = await rpc(users[0], 'select public.get_sender_account() result');
    assert.equal(account.grace_until, null);
    assert.equal(await committed(), 799 * MiB + 1);
  });
  await check('late Test payments recheck seats and shared bytes rather than reserve an unfunded GiB', async () => {
    await db.query("update woff_private.sender_checkout_reservations set expires_at=now()-interval '1 minute' where id=$1", [leases[2].reservation_id]);
    assert.equal((await bill(event('late-test', 2, leases[2].reservation_id))).is_pro, true);
    assert.equal(await committed(), 799 * MiB + 1);
    await db.query("update woff_private.sender_checkout_reservations set expires_at=now()-interval '1 minute' where id=$1", [leases[3].reservation_id]);
    await db.query('update woff_private.pilot_capacity set capacity_bytes=1 where id=1');
    await assert.rejects(bill(event('late-test-over-budget', 3, leases[3].reservation_id)), /capacity review/);
    assert.equal((await rpc(users[3], 'select public.get_sender_account() result')).is_pro, false);
    await db.query('update woff_private.pilot_capacity set capacity_bytes=$1 where id=1', [800 * MiB]);
  });
  await check('Test mode has no unlimited-upload fallback if its shared budget is missing', async () => {
    await db.query('update woff_private.pilot_capacity set capacity_bytes=0 where id=1');
    assert.equal(await rpc(users[1], 'select public.reserve_upload($1,$2,$3,$4) result',
      [rooms[1].id, `${rooms[1].id}/zero-budget`, 1, 'text/plain']), false);
    await assert.rejects(rpc(users[6], 'select public.reserve_sender_checkout() result'), /not ready/);
  });
  await check('Live checkout still reserves its full funded GiB, not the Test shared-budget path', async () => {
    await db.query('update woff_private.pilot_capacity set billing_test_mode=false,capacity_bytes=$1 where id=1', [2 * GiB]);
    // End the unused Test lease to free a pilot seat, not storage allowance.
    await db.query("update woff_private.sender_checkout_reservations set expires_at=now()-interval '1 minute' where id=$1", [leases[4].reservation_id]);
    const before = await committed();
    const lease = await rpc(users[6], 'select public.reserve_sender_checkout() result');
    assert.equal(await committed(), before + GiB);
    assert.equal((await db.query('select billing_test_mode from woff_private.sender_checkout_reservations where id=$1', [lease.reservation_id])).rows[0].billing_test_mode, false);
    assert.equal((await bill(event('live-funded', 6, lease.reservation_id, { mode: false }))).is_pro, true);
    assert.equal(await committed(), before + GiB);
    assert.equal((await rpc(users[6], 'select public.get_sender_account() result')).is_pro, true);
    await assert.rejects(bill(event('live-sub-with-test-stamp', 6, null, { mode: true, offset: 1000 })), /Billing mode mismatch/);
  });
  await check('browser roles cannot change payment provenance or invoke privileged helpers', async () => {
    await assert.rejects(as(users[1], c => c.query('update public.sender_entitlements set billing_test_mode=false where user_id=$1', [users[1]])), /permission denied/);
    const roles = await db.query(`select role from unnest(array['anon','authenticated']) role
      where has_function_privilege(role,'woff_private.committed_storage_bytes()','execute')
        or has_function_privilege(role,'public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean)','execute')
        or has_table_privilege(role,'woff_private.sender_checkout_reservations','update')`);
    assert.deepEqual(roles.rows, []);
  });
  console.log(`${passed} public Test billing database checks passed`);
} finally { await db.end(); }
