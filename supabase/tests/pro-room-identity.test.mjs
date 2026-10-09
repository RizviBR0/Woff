// Run only against the ignored loopback PostgreSQL fixture, never a cloud DB.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('internal/db-runtime/local-fixture.cjs'));
const { Client } = require('pg');
const base = 'postgresql://postgres@127.0.0.1:55439/';
const database = 'woff_pro_room_identity_test';
const admin = new Client({ connectionString: base + 'postgres' });
await admin.connect();
await admin.query(`drop database if exists ${database} with (force)`);
await admin.query(`create database ${database}`);
await admin.end();
const db = new Client({ connectionString: base + database });
await db.connect();
try {
  await db.query(await readFile('supabase/tests/platform-bootstrap.sql', 'utf8'));
  for (const file of (await readdir('supabase/migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const sql = (await readFile(path.join('supabase/migrations', file), 'utf8'))
      .replace(/create extension if not exists pg_net with schema extensions;/i, '-- pg_net fixture stub');
    try { await db.query(sql); } catch (error) { error.message = `${file}: ${error.message}`; throw error; }
  }
  console.log('PASS all repository migrations compile on PostgreSQL');
  const pro = '00000000-0000-4000-9000-000000000001';
  const otherPro = '00000000-0000-4000-9000-000000000002';
  const free = '00000000-0000-4000-9000-000000000003';
  const guest = '00000000-0000-4000-9000-000000000004';
  const unverified = '00000000-0000-4000-9000-000000000005';
  const newcomer = '00000000-0000-4000-9000-000000000006';
  await db.query(`insert into auth.users(id,email,email_confirmed_at,is_anonymous) values
    ($1,'pro@example.test',now(),false),($2,'other@example.test',now(),false),
    ($3,'free@example.test',now(),false),($4,null,null,true),
    ($5,'unverified@example.test',null,false),($6,null,null,true)`,
  [pro, otherPro, free, guest, unverified, newcomer]);
  await db.query(`insert into public.sender_entitlements(user_id,plan,status,pro_until)
    values($1,'pro','active',now()+interval '1 month'),
      ($2,'pro','active',now()+interval '1 month'),($3,'pro','active',now()+interval '1 month')`,
  [pro, otherPro, unverified]);
  async function as(user, fn, client = db) {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, role: 'authenticated', user_metadata: { plan: 'pro' } })]);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (error) { await client.query('rollback'); throw error; }
  }
  async function rpc(user, sql, params = []) {
    return as(user, async c => (await c.query(sql, params)).rows[0]?.result);
  }
  const identity = (user, id, name, slug = null) => rpc(user,
    'select public.update_room_identity($1,$2,$3) result', [id, name, slug]);
  const rotate = (user, id, slug = null) => rpc(user,
    'select public.rotate_room_code($1,$2) result', [id, slug]);
  const open = (user, slug) => rpc(user, 'select public.open_space($1,$2) result', [slug, 'Fixture user']);
  const rawRoom = async id => (await db.query('select to_jsonb(s) payload from public.spaces s where id=$1', [id])).rows[0].payload;
  const withoutIdentity = ({ name, title, slug, ...rest }) => rest;
  let passed = 0;
  async function check(name, fn) { await fn(); passed++; console.log('PASS ' + name); }
  const main = await rpc(pro, 'select public.create_space($1) result', ['Pro owner']);
  const other = await rpc(otherPro, 'select public.create_space($1) result', ['Other owner']);
  const freeRoom = await rpc(free, 'select public.create_space($1) result', ['Free owner']);
  const guestRoom = await rpc(guest, 'select public.create_space($1) result', ['Guest owner']);
  const unverifiedRoom = await rpc(unverified, 'select public.create_space($1) result', ['Unverified owner']);
  await rpc(guest, 'select to_jsonb(public.join_room_invitation($1,$2)) result', [main.invite_token, 'Recipient']);
  await rpc(pro, 'select public.set_room_access($1,false,now()+interval \'1 hour\',true) result', [main.space.id]);
  const before = await rawRoom(main.space.id);
  const invitationsBefore = (await db.query('select to_jsonb(i) payload from public.room_invitations i where space_id=$1 order by id', [main.space.id])).rows;
  const membersBefore = (await db.query('select to_jsonb(m) payload from public.space_members m where space_id=$1 order by user_id', [main.space.id])).rows;
  let currentSlug = main.space.slug;

  await check('current Pro owner names a Free room without changing its allowance or timer', async () => {
    const result = await identity(pro, main.space.id, '  Sabbir’s shared files  ');
    assert.equal(result.space.name, 'Sabbir’s shared files');
    assert.equal(result.space.title, result.space.name);
    assert.equal(result.space.slug, main.space.slug);
    assert.equal(result.space.can_customize_identity, true);
    assert.equal(result.space.is_pro, false);
    assert.equal(Object.hasOwn(result.space, 'owner_recovery_hash'), false);
    assert.deepEqual(withoutIdentity(await rawRoom(main.space.id)), withoutIdentity(before));
  });
  await check('readable URL is normalized and old numeric URL stops resolving', async () => {
    const result = await identity(pro, main.space.id, 'Sabbir’s shared files', ' Sabbir-Hossain ');
    currentSlug = result.space.slug;
    assert.equal(currentSlug, 'sabbir-hossain');
    assert.equal((await open(pro, ' SABBIR-HOSSAIN ')).space.id, main.space.id);
    await assert.rejects(open(pro, main.space.slug), /not found or expired/);
    assert.deepEqual(withoutIdentity(await rawRoom(main.space.id)), withoutIdentity(before));
  });
  await check('renaming keeps invitations, members and access versions intact', async () => {
    assert.deepEqual((await db.query('select to_jsonb(i) payload from public.room_invitations i where space_id=$1 order by id', [main.space.id])).rows, invitationsBefore);
    assert.deepEqual((await db.query('select to_jsonb(m) payload from public.space_members m where space_id=$1 order by user_id', [main.space.id])).rows, membersBefore);
    const invited = await rpc(guest, 'select to_jsonb(public.join_room_invitation($1,$2)) result', [main.invite_token, 'Recipient']);
    assert.equal(invited.slug, currentSlug);
    assert.equal((await open(guest, currentSlug)).space.can_customize_identity, false);
    await assert.rejects(open(newcomer, currentSlug), /room code is closed/);
  });
  await check('anonymous guests, Free owners, unverified owners and nonowners cannot customize identity', async () => {
    await assert.rejects(identity(guest, main.space.id, 'Not mine', 'hijack'), /Room owner required/);
    await assert.rejects(identity(otherPro, main.space.id, 'Not mine', 'hijack'), /Room owner required/);
    await assert.rejects(identity(free, freeRoom.space.id, 'Free rename', 'free-owner'), /Pro is required/);
    await assert.rejects(identity(guest, guestRoom.space.id, 'Guest rename', 'guest-owner'), /Pro is required/);
    await assert.rejects(identity(unverified, unverifiedRoom.space.id, 'Unverified', 'unverified-owner'), /Pro is required/);
    await assert.rejects(rotate(free, freeRoom.space.id, 'free-owner'), /Pro is required/);
    await assert.rejects(rotate(guest, guestRoom.space.id, 'guest-owner'), /Pro is required/);
    await assert.rejects(rotate(unverified, unverifiedRoom.space.id, 'unverified-owner'), /Pro is required/);
  });
  await check('invalid names and URLs roll back the complete identity change', async () => {
    const original = await rawRoom(main.space.id);
    for (const name of [null, '', '   ', 'x'.repeat(121)]) {
      await assert.rejects(identity(pro, main.space.id, name, 'valid-name'), /room name between/);
    }
    const invalid = ['', 'ab', '123', '12345', '-name', 'name-', 'name--slug',
      'name_slug', 'name slug', 'name.slug', 'name/slug', 'https://example.test',
      'name%2fslug', 'সাব্বির', 'a'.repeat(41)];
    for (const slug of invalid) {
      await assert.rejects(identity(pro, main.space.id, 'Should not save', slug), /valid custom room URL/);
      await assert.rejects(rotate(pro, main.space.id, slug), /valid custom room URL/);
    }
    assert.deepEqual(await rawRoom(main.space.id), original);
    assert.equal(Number((await db.query("select count(*) from woff_private.room_code_history where slug='valid-name'")).rows[0].count), 0);
  });
  await check('application routes are reserved and the policy handles exact length boundaries', async () => {
    const reserved = ['about','account','admin','api','auth','billing','blog','checkout','contact',
      'dashboard','for-freelancers','help','legal','login','logout','n','new','online-notepad',
      'online-notepad-with-shareable-link','pricing','privacy','recover','s','settings',
      'share-code-snippets-online','share-notes-online-without-login','share-text-between-devices',
      'sign-in','sign-up','signin','signup','status','support','terms','user','users','woff','www'];
    for (const slug of reserved) {
      await assert.rejects(identity(pro, main.space.id, 'Should not save', slug), /valid custom room URL/);
    }
    for (const slug of ['abc', 'sabbir', 'sabbir-9999', '9999-sabbir', 'a'.repeat(40), '0000']) {
      assert.equal((await db.query('select woff_private.valid_room_slug($1) valid', [slug])).rows[0].valid, true, slug);
    }
    for (const slug of ['ab', 'a'.repeat(41), 'Sabbir', null, '99999']) {
      assert.equal((await db.query('select woff_private.valid_room_slug($1) valid', [slug])).rows[0].valid, false, slug);
    }
  });
  await check('active and retired URLs are reserved for their original room only', async () => {
    await assert.rejects(identity(otherPro, other.space.id, 'Collision', currentSlug), /already in use/);
    assert.equal((await rawRoom(other.space.id)).name, '');
    await rotate(pro, main.space.id, 'sabbir-files');
    await assert.rejects(identity(otherPro, other.space.id, 'Retired collision', currentSlug), /already in use/);
    await assert.rejects(open(pro, currentSlug), /not found or expired/);
    await rotate(pro, main.space.id, currentSlug);
    assert.equal((await open(pro, currentSlug)).space.id, main.space.id);
    await assert.rejects(rotate(otherPro, other.space.id, main.space.slug), /already in use/);
  });
  await check('simultaneous claims to one custom URL have exactly one winner', async () => {
    const a = new Client({ connectionString: base + database });
    const b = new Client({ connectionString: base + database });
    await Promise.all([a.connect(), b.connect()]);
    try {
      const results = await Promise.allSettled([[pro, main.space.id, a], [otherPro, other.space.id, b]].map(
        ([user, id, client]) => as(user, async c => (await c.query(
          'select public.update_room_identity($1,$2,$3) result', [id, 'Claim winner', 'shared-name'])).rows[0].result, client)));
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
      assert.equal(results.filter(r => r.status === 'rejected' && /already in use/.test(r.reason.message)).length, 1);
      const claimed = (await db.query("select id from public.spaces where slug='shared-name'")).rows;
      assert.equal(claimed.length, 1);
      assert.equal((await db.query("select space_id from woff_private.room_code_history where slug='shared-name'")).rows[0].space_id, claimed[0].id);
    } finally { await Promise.all([a.end(), b.end()]); }
    currentSlug = (await rawRoom(main.space.id)).slug;
  });
  await check('competing identity, numeric rotation and access edits preserve a consistent owner lock order', async () => {
    const clients = [0, 1, 2].map(() => new Client({ connectionString: base + database }));
    await Promise.all(clients.map(c => c.connect()));
    try {
      await Promise.all(clients.map(c => c.query("set statement_timeout='3s'")));
      const commands = [
        ['select public.update_room_identity($1,$2,$3) result', [main.space.id, 'Concurrent owner edit', 'owner-race']],
        ['select public.rotate_room_code($1,null) result', [main.space.id]],
        ['select public.set_room_access($1,false,null,false) result', [main.space.id]],
      ];
      const results = await Promise.all(commands.map(([sql, params], index) =>
        as(pro, async c => (await c.query(sql, params)).rows[0].result, clients[index])));
      assert.equal(results.length, 3);
      const room = await rawRoom(main.space.id);
      assert.equal(room.name, 'Concurrent owner edit');
      assert.equal(room.code_enabled, false);
      assert.equal(room.expires_at, before.expires_at);
      assert.equal(room.access_version, before.access_version);
      assert.equal((await db.query("select space_id from woff_private.room_code_history where slug='owner-race'")).rows[0].space_id, main.space.id);
      currentSlug = room.slug;
    } finally { await Promise.all(clients.map(c => c.end())); }
    // The following access/downgrade checks deliberately use a custom URL,
    // regardless of which valid concurrent mutation happened to finish last.
    if (currentSlug !== 'owner-race') await rotate(pro, main.space.id, 'owner-race');
    currentSlug = 'owner-race';
  });
  await check('custom URL reads and private note routing preserve UUID ownership', async () => {
    await rpc(pro, 'select public.create_note_entry($1,$2,$3,$4) result', [main.space.id, 'identity-note', 'IDENTITY', 'Note']);
    const note = await rpc(pro, 'select public.open_note($1,$2) result', ['identity-note', 'Owner']);
    assert.equal(note.space_id, main.space.id);
    assert.equal(note.space_slug, currentSlug);
    assert.equal(note.can_edit, true);
  });
  await check('an identity request waiting on a room lock rechecks a committed entitlement downgrade', async () => {
    const beforeRace = await rawRoom(main.space.id);
    const a = new Client({ connectionString: base + database });
    const b = new Client({ connectionString: base + database });
    await Promise.all([a.connect(), b.connect()]);
    let pending;
    try {
      await a.query('begin');
      await a.query('select id from public.spaces where id=$1 for update', [main.space.id]);
      const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
      pending = as(pro, c => c.query('select public.update_room_identity($1,$2,$3)',
        [main.space.id, 'Stale premium edit', 'stale-premium']), b)
        .then(result => ({ result }), error => ({ error }));
      let waiting = false;
      for (let attempt = 0; attempt < 50 && !waiting; attempt++) {
        waiting = (await db.query("select exists(select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock') waiting", [pid])).rows[0].waiting;
        if (!waiting) await new Promise(resolve => setTimeout(resolve, 20));
      }
      assert.equal(waiting, true, 'second connection must actually wait for the room lock');
      await a.query("update public.sender_entitlements set pro_until=now()-interval '1 second',grace_until=null where user_id=$1", [pro]);
      await a.query('commit');
      const outcome = await pending;
      assert.match(outcome.error?.message || '', /Pro is required/);
      assert.deepEqual(await rawRoom(main.space.id), beforeRace);
      assert.equal(Number((await db.query("select count(*) from woff_private.room_code_history where slug='stale-premium'")).rows[0].count), 0);
    } finally {
      await a.query('rollback');
      if (pending) await pending;
      await Promise.all([a.end(), b.end()]);
      await db.query("update public.sender_entitlements set pro_until=now()+interval '1 month' where user_id=$1", [pro]);
    }
  });
  await check('downgrade retains an existing URL and access controls but rejects new paid edits', async () => {
    await db.query("update public.sender_entitlements set pro_until=now()-interval '1 second',grace_until=null where user_id=$1", [pro]);
    const opened = (await open(pro, currentSlug)).space;
    assert.equal(opened.can_customize_identity, false);
    assert.equal(opened.code_enabled, false);
    assert.equal(opened.can_write, true);
    assert.equal((await rotate(pro, main.space.id, currentSlug)).slug, currentSlug);
    await assert.rejects(identity(pro, main.space.id, 'Downgraded rename', null), /Pro is required/);
    await assert.rejects(rotate(pro, main.space.id, 'new-custom-name'), /Pro is required/);
    await rpc(pro, 'select public.set_room_access($1,true,null,false) result', [main.space.id]);
    assert.equal((await open(newcomer, currentSlug)).space.id, main.space.id);
    const numeric = await rotate(pro, main.space.id);
    assert.match(numeric.slug, /^[0-9]{4}$/);
    assert.equal(numeric.can_customize_identity, false);
    await assert.rejects(rotate(pro, main.space.id, currentSlug), /Pro is required/);
    assert.equal((await open(pro, numeric.slug)).space.id, main.space.id);
    currentSlug = numeric.slug;
  });
  await check('ordinary Free rooms keep numeric rotation and guest joining', async () => {
    const numeric = await rotate(free, freeRoom.space.id);
    assert.match(numeric.slug, /^[0-9]{4}$/);
    assert.equal((await open(guest, numeric.slug)).space.id, freeRoom.space.id);
    assert.equal((await open(free, numeric.slug)).space.can_customize_identity, false);
  });
  await check('expired rooms reject Pro identity edits without reopening access', async () => {
    await db.query("update public.spaces set expires_at=now()-interval '1 second' where id=$1", [other.space.id]);
    await assert.rejects(identity(otherPro, other.space.id, 'Expired', 'expired-name'), /Room owner required/);
    await assert.rejects(rotate(otherPro, other.space.id, 'expired-name'), /Room owner required/);
    assert.ok(Date.parse((await rawRoom(other.space.id)).expires_at) < Date.now());
  });
  await check('unauthenticated callers and direct table writes cannot bypass the RPC', async () => {
    assert.equal((await db.query("select has_function_privilege('anon','public.update_room_identity(uuid,text,text)','execute') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','woff_private.room_payload(public.spaces)','execute') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_function_privilege('authenticated','woff_private.valid_room_slug(text)','execute') allowed")).rows[0].allowed, false);
    assert.equal((await db.query("select has_table_privilege('authenticated','woff_private.room_code_history','select') allowed")).rows[0].allowed, false);
    await assert.rejects(as(free, c => c.query("update public.spaces set name='Bypass',slug='bypass' where id=$1", [freeRoom.space.id])), /permission denied|server-managed/);
    await db.query('begin');
    try {
      await db.query('set local role anon');
      await assert.rejects(db.query('select public.update_room_identity($1,$2,$3)', [main.space.id, 'No session', 'no-session']), /permission denied/);
    } finally { await db.query('rollback'); }
  });
  await check('recovery supports a custom URL while preserving revocation and rotated proof', async () => {
    const recoverable = await rpc(otherPro, 'select public.create_space($1) result', ['Recovery owner']);
    const custom = await identity(otherPro, recoverable.space.id, 'Recovery room', 'recoverable-room');
    const recovered = await rpc(guest, 'select public.recover_space_ownership($1,$2,$3) result',
      [' RECOVERABLE-ROOM ', recoverable.recovery_key, 'Recovered owner']);
    assert.equal(recovered.space.id, custom.space.id);
    assert.equal(recovered.space.slug, 'recoverable-room');
    assert.equal(recovered.space.creator_device_id, guest);
    assert.equal(recovered.space.code_enabled, false);
    assert.equal(recovered.space.access_version, custom.space.access_version + 1);
    assert.equal(recovered.space.can_customize_identity, false);
    assert.equal(Object.hasOwn(recovered.space, 'owner_recovery_hash'), false);
    assert.notEqual(recovered.recovery_key, recoverable.recovery_key);
    await assert.rejects(open(otherPro, 'recoverable-room'), /room code is closed/);
    await assert.rejects(rpc(otherPro, 'select public.recover_space_ownership($1,$2,$3) result',
      ['recoverable-room', recoverable.recovery_key, 'Old owner']), /Invalid recovery key/);
  });
  await check('deleted rooms release historical URL claims through the existing cascade', async () => {
    const released = (await db.query('select slug from woff_private.room_code_history where space_id=$1 order by slug', [other.space.id])).rows;
    assert.ok(released.length >= 1);
    await db.query('delete from public.spaces where id=$1', [other.space.id]);
    assert.equal(Number((await db.query('select count(*) from woff_private.room_code_history where space_id=$1', [other.space.id])).rows[0].count), 0);
  });
  console.log(`${passed} Pro room identity behavior checks passed`);
} finally { await db.end(); }
