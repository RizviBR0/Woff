import { createClient } from '@supabase/supabase-js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

process.loadEnvFile('.env.local');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, options);
const owner = createClient(url, key, options);
const outsider = createClient(url, key, options);
const users = [];
let room;
try {
  for (const client of [owner, outsider]) {
    const { data, error } = await client.auth.signInAnonymously();
    assert.ifError(error);
    users.push(data.user.id);
  }
  const created = await owner.rpc('create_space', { p_display_name: 'Performance fixture' });
  assert.ifError(created.error);
  room = created.data.space ?? created.data;
  const slug = randomUUID().replaceAll('-', '').slice(0, 12);
  const note = await owner.rpc('create_note_entry', { p_space_id: room.id, p_note_slug: slug, p_public_code: randomUUID().replaceAll('-', '').slice(0, 12), p_title: 'Fixture note' });
  assert.ifError(note.error);
  const input = { p_slug: slug, p_title: 'Fixture note', p_content_html: '<p>Fixture content</p>', p_content_json: { type: 'doc', content: [{ type: 'paragraph' }] }, p_expected_version: 1 };
  const saved = await owner.rpc('save_note_snapshot', input);
  assert.ifError(saved.error);
  assert.equal(saved.data.version, 2);
  assert.deepEqual(Object.keys(saved.data).sort(), ['updated_at', 'version']);
  assert.match((await owner.rpc('save_note_snapshot', input)).error.message, /changed elsewhere/);
  assert.match((await outsider.rpc('save_note_snapshot', { ...input, p_expected_version: 2 })).error.message, /Only the note creator/);
  const huge = await owner.rpc('save_note_snapshot', { ...input, p_expected_version: 2, p_content_html: 'a'.repeat(1000001) });
  assert.match(huge.error.message, /too large/);
  const changed = await owner.rpc('save_note_snapshot', { ...input, p_expected_version: 2, p_title: 'Changed fixture title' });
  assert.ifError(changed.error);
  const { data: entry } = await service.from('entries').select('meta').eq('space_id', room.id).single();
  assert.equal(entry.meta.title, 'Changed fixture title');
  await service.from('spaces').update({ expires_at: new Date(Date.now() - 1000).toISOString() }).eq('id', room.id);
  assert.match((await owner.rpc('save_note_snapshot', { ...input, p_expected_version: 3 })).error.message, /expired/);
  console.log('PASS: compact acknowledgement, ownership, conflict, size, title metadata, expiry');
} finally {
  if (room) await service.from('spaces').delete().eq('id', room.id);
  for (const id of users) await service.auth.admin.deleteUser(id);
}
