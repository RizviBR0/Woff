import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { standaloneNoteHtml, readNoteImage } from '../lib/portable-note.ts';
import { getLaunchConfig } from '../lib/launch-config.ts';
import { rememberSpaceOwnership, rememberSpaceInvitation, readSpaceInvitation, readSpaceRecoveryKey } from '../lib/space-recovery.ts';
import { cleanupRoomQueue, removeRoomStoragePrefix } from '../lib/storage-cleanup.ts';
import { canUseBoundedStorageRedirect } from '../lib/storage-cache.ts';

// Load production TypeScript with its actual shared slug validator. The app's
// path alias is a bundler feature that Node's stripped-TypeScript loader lacks.
function compiledModuleUrl(path) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
  return `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`;
}
const slugModuleUrl = compiledModuleUrl('../lib/room-slug.ts');
const linksSource = readFileSync(new URL('../lib/room-links.ts', import.meta.url), 'utf8').replace('"@/lib/room-slug"', JSON.stringify(slugModuleUrl));
const linksCompiled = ts.transpileModule(linksSource, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText;
const { extractInvitationPath, roomSharePath, noteSharePath } = await import(`data:text/javascript;base64,${Buffer.from(linksCompiled).toString('base64')}`);

test('bounded direct delivery rejects cached or unspecified response policies', () => {
  assert.equal(canUseBoundedStorageRedirect('max-age=0'), true);
  assert.equal(canUseBoundedStorageRedirect('no-store'), true);
  for (const value of [undefined, 'max-age=3600', 'max-age=0, s-maxage=3600', 'public'])
    assert.equal(canUseBoundedStorageRedirect(value), false);
});

test('invitation parsing accepts only the bounded opaque token route', () => {
  const token = 'ab'.repeat(32);
  assert.equal(extractInvitationPath(`https://woff.space/s/${token}?source=qr`), `/s/${token}`);
  assert.equal(extractInvitationPath(`woff.space/s/${token}`), `/s/${token}`);
  assert.equal(extractInvitationPath(`javascript:/s/${token}`), null);
  assert.equal(extractInvitationPath(`/s/${token}/extra`), null);
  assert.equal(extractInvitationPath('https://woff.space/1234'), null);
  assert.equal(roomSharePath('1234', token), `/s/${token}`);
});

test('note invitations preserve only a bounded note target and discard unrelated redirect parameters', () => {
  const token = 'ab'.repeat(32);
  const path = noteSharePath('1234', 'AbCd12', token);
  assert.equal(path, `/s/${token}?note=AbCd12`);
  assert.equal(extractInvitationPath(`https://woff.space${path}&next=https://example.com`), path);
  assert.equal(noteSharePath('1234', 'AbCd12'), '/1234/AbCd12');
  assert.equal(extractInvitationPath(`/s/${token}?note=../../other`), null);
  assert.throws(() => noteSharePath('1234', '../other', token), /Invalid/);
});

test('named room and note links keep their invitation capabilities and reject reserved or unsafe paths', () => {
  const token = 'ab'.repeat(32);
  assert.equal(roomSharePath('sabbir-rizvi'), '/sabbir-rizvi');
  assert.equal(roomSharePath('sabbir-rizvi', token), `/s/${token}`);
  assert.equal(noteSharePath('sabbir-rizvi', 'AbCd12'), '/sabbir-rizvi/AbCd12');
  assert.equal(noteSharePath('sabbir-rizvi', 'AbCd12', token), `/s/${token}?note=AbCd12`);
  for (const slug of ['sign-in', '../account', 'sabbir/other', 'Sabbir']) {
    assert.throws(() => roomSharePath(slug), /Invalid/);
    assert.throws(() => noteSharePath(slug, 'AbCd12', token), /Invalid/);
  }
});

test('portable note title is escaped and content keeps Unicode and rich layout', () => {
  const html = standaloneNoteHtml('<script>বাংলা</script>', '<h2>বাংলা</h2><blockquote>Delivery</blockquote>');
  assert.ok(html.includes('&lt;script&gt;বাংলা&lt;/script&gt;'));
  assert.ok(html.includes('<h2>বাংলা</h2>'));
  assert.ok(html.includes("default-src 'none'"));
  assert.ok(!html.includes('<script>'));
});

test('note image export stops oversized streaming responses before creating a blob', async () => {
  let cancelled = false;
  const stream = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(8)); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(readNoteImage(new Response(stream, { headers: { 'content-type': 'image/png' } }), 4), /too large/);
  assert.equal(cancelled, true);
  const image = await readNoteImage(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'image/png' } }), 4);
  assert.equal(image.size, 2);
  assert.equal(image.type, 'image/png');
  await assert.rejects(readNoteImage(new Response('not an image', { headers: { 'content-type': 'text/html' } }), 20), /unavailable/);
});

test('recovered or merged room versions never reuse a revoked invitation or previous owner key', () => {
  const previous = { window: globalThis.window, localStorage: globalThis.localStorage };
  const values = new Map();
  globalThis.window = {};
  globalThis.localStorage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  const room = { id: 'room-one', slug: '1234', creator_device_id: 'previous-owner', access_version: 1 };
  try {
    rememberSpaceOwnership({ ...room, recovery_key: 'saved-key' });
    rememberSpaceInvitation(room, 'old-token', 1);
    assert.equal(readSpaceInvitation(room), 'old-token');
    assert.equal(readSpaceInvitation({ ...room, access_version: 2 }), '');
    assert.equal(readSpaceInvitation({ ...room, id: 'replacement-room' }), '');
    assert.equal(readSpaceRecoveryKey({ ...room, id: 'replacement-room' }), '');
    assert.equal(readSpaceRecoveryKey({ ...room, creator_device_id: 'new-owner' }), '');
    rememberSpaceInvitation({ ...room, access_version: 2 }, 'new-token', 2);
    assert.equal(readSpaceInvitation({ ...room, access_version: 2 }), 'new-token');
  } finally { Object.assign(globalThis, previous); }
});

test('live checkout fails closed unless provider, email, capacity and billing gates all pass', () => {
  const names = ['WOFF_BILLING_ENABLED','WOFF_EMAIL_DELIVERY_VERIFIED','WOFF_STORAGE_CAPACITY_VERIFIED','WOFF_ACCOUNTS_ENABLED','LEMON_SQUEEZY_API_KEY','LEMON_SQUEEZY_STORE_ID','LEMON_SQUEEZY_VARIANT_ID','LEMON_SQUEEZY_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','LEMON_SQUEEZY_TEST_MODE'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    assert.equal(getLaunchConfig().checkoutEnabled, false);
    for (const name of names) process.env[name] = name.startsWith('LEMON_') || name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture' : 'true';
    process.env.LEMON_SQUEEZY_TEST_MODE = 'false';
    assert.equal(getLaunchConfig().checkoutEnabled, true);
    for (const gate of ['WOFF_EMAIL_DELIVERY_VERIFIED','WOFF_STORAGE_CAPACITY_VERIFIED','LEMON_SQUEEZY_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY']) {
      const value = process.env[gate]; delete process.env[gate];
      assert.equal(getLaunchConfig().checkoutEnabled, false); process.env[gate] = value;
    }
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
});

test('explicit test payments retain account, email, provider and billing gates without certifying paid storage', () => {
  const names = ['WOFF_BILLING_ENABLED','WOFF_EMAIL_DELIVERY_VERIFIED','WOFF_STORAGE_CAPACITY_VERIFIED','WOFF_ACCOUNTS_ENABLED','LEMON_SQUEEZY_API_KEY','LEMON_SQUEEZY_STORE_ID','LEMON_SQUEEZY_VARIANT_ID','LEMON_SQUEEZY_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY','LEMON_SQUEEZY_TEST_MODE'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    for (const name of names) process.env[name] = name.startsWith('LEMON_') || name === 'SUPABASE_SERVICE_ROLE_KEY' ? 'fixture' : 'true';
    process.env.LEMON_SQUEEZY_TEST_MODE = 'true';
    process.env.WOFF_STORAGE_CAPACITY_VERIFIED = 'false';
    assert.equal(getLaunchConfig().checkoutEnabled, true);
    assert.equal(getLaunchConfig().storageCapacityVerified, false);
    for (const gate of ['WOFF_EMAIL_DELIVERY_VERIFIED','LEMON_SQUEEZY_API_KEY','LEMON_SQUEEZY_STORE_ID','LEMON_SQUEEZY_VARIANT_ID','LEMON_SQUEEZY_WEBHOOK_SECRET','SUPABASE_SERVICE_ROLE_KEY']) {
      const value = process.env[gate]; delete process.env[gate];
      assert.equal(getLaunchConfig().checkoutEnabled, false); process.env[gate] = value;
    }
    for (const gate of ['WOFF_ACCOUNTS_ENABLED','WOFF_BILLING_ENABLED']) {
      process.env[gate] = 'false'; assert.equal(getLaunchConfig().checkoutEnabled, false); process.env[gate] = 'true';
    }
    for (const mode of ['false','fixture','TRUE','']) {
      process.env.LEMON_SQUEEZY_TEST_MODE = mode;
      assert.equal(getLaunchConfig().checkoutEnabled, false);
    }
  } finally { for (const name of names) { if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name]; } }
});

const cleanupRoom = '00000000-0000-4000-8000-000000000011';
const otherCleanupRoom = '00000000-0000-4000-8000-000000000012';
function fixtureStorage(paths, fails = () => false) {
  const files = new Set(paths);
  const lists = [];
  const removals = [];
  return {
    files, lists, removals,
    async list(prefix, { limit, offset }) {
      lists.push({ prefix, offset });
      const children = new Map();
      for (const key of files) {
        if (!key.startsWith(`${prefix}/`)) continue;
        const rest = key.slice(prefix.length + 1);
        const name = rest.split('/')[0];
        children.set(name, { name, id: rest.includes('/') ? null : key });
      }
      return { data: [...children.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(offset, offset+limit), error: null };
    },
    async remove(keys) {
      removals.push(keys);
      if (keys.some(fails)) return { error: { message: 'Storage temporarily unavailable' } };
      for (const key of keys) files.delete(key);
      return { error: null };
    },
  };
}

test('room cleanup drains paginated files and nested folders without touching another UUID', async () => {
  const paths = Array.from({ length: 1002 }, (_,i)=>`${cleanupRoom}/file-${String(i).padStart(4,'0')}`);
  paths.push(`${cleanupRoom}/images/diagram.png`, `${cleanupRoom}/notes/archive/note.html`, `${otherCleanupRoom}/keep.txt`);
  const storage = fixtureStorage(paths);
  assert.equal(await removeRoomStoragePrefix(storage, cleanupRoom), 1004);
  assert.deepEqual([...storage.files], [`${otherCleanupRoom}/keep.txt`]);
  assert.ok(storage.lists.every(({prefix,offset})=>offset===0 && (prefix===cleanupRoom || prefix.startsWith(`${cleanupRoom}/`))));
  assert.ok(storage.removals.flat().every(key=>key.startsWith(`${cleanupRoom}/`)));
  assert.ok(storage.removals.every(keys=>keys.length<=1000));
});

test('partial nested Storage failure keeps that room queued while clearing completed rooms', async () => {
  let fail = true;
  const nested = `${cleanupRoom}/nested/delivery.txt`;
  const storage = fixtureStorage([`${cleanupRoom}/first.txt`,nested,`${otherCleanupRoom}/finished.txt`],key=>fail && key===nested);
  const cleared = [];
  const clear = async ids => { cleared.push(...ids); return { error: null }; };
  const result = await cleanupRoomQueue(storage,[{id:1,space_id:cleanupRoom},{id:2,space_id:otherCleanupRoom}],clear);
  assert.equal(result.failedCount,1);
  assert.equal(result.results[0].status,'deletion_failed');
  assert.deepEqual(cleared,[2]);
  assert.equal(storage.files.has(nested),true);
  assert.equal(storage.files.has(`${cleanupRoom}/first.txt`),false);
  fail = false;
  assert.equal((await cleanupRoomQueue(storage,[{id:1,space_id:cleanupRoom}],clear)).failedCount,0);
  assert.deepEqual(cleared,[2,1]);
  assert.equal(storage.files.size,0);
});

test('queue-clear failure remains a reported retry even after physical objects are removed', async () => {
  const storage = fixtureStorage([`${cleanupRoom}/delivery.txt`]);
  const result = await cleanupRoomQueue(storage,[{id:3,space_id:cleanupRoom}],async()=>({error:{message:'Database temporarily unavailable'}}));
  assert.equal(result.failedCount,1);
  assert.equal(result.results[0].status,'queue_clear_failed');
  assert.equal(storage.files.size,0);
  const cleared = [];
  assert.equal((await cleanupRoomQueue(storage,[{id:3,space_id:cleanupRoom}],async ids=>{cleared.push(...ids);return {error:null};})).failedCount,0);
  assert.deepEqual(cleared,[3]);
});

test('cleanup rejects broad/escaped prefixes and success-shaped Storage no-ops', async () => {
  const storage = fixtureStorage([`${otherCleanupRoom}/keep.txt`]);
  await assert.rejects(removeRoomStoragePrefix(storage,''),/UUID/);
  await assert.rejects(removeRoomStoragePrefix(storage,`${cleanupRoom}/..`),/UUID/);
  assert.equal(storage.lists.length,0);
  const escaped = {...storage,list:async()=>({data:[{name:'../other',id:'file'}],error:null})};
  await assert.rejects(removeRoomStoragePrefix(escaped,cleanupRoom),/child path/);
  assert.equal(storage.removals.length,0);
  const noop = {...storage,list:async()=>({data:[{name:'still-present.txt',id:'file'}],error:null}),remove:async()=>({error:null})};
  await assert.rejects(removeRoomStoragePrefix(noop,cleanupRoom),/did not advance/);
});
