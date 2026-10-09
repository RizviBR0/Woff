// Run from the workspace root: node supabase/tests/launch-safety.test.mjs
// Uses a disposable database on the explicitly local PostgreSQL fixture only.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.resolve('internal/db-runtime/local-fixture.cjs'));
const { Client } = require('pg');
const base = 'postgresql://postgres@127.0.0.1:55439/';
const database = 'woff_launch_safety_test';
const admin = new Client({ connectionString: base + 'postgres' });
await admin.connect();
await admin.query(`drop database if exists ${database} with (force)`);
await admin.query(`create database ${database}`);
await admin.end();
const db = new Client({ connectionString: base + database });
await db.connect();
let legacyBefore=[];
try {
  await db.query(await readFile('supabase/tests/platform-bootstrap.sql','utf8'));
  for (const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')).sort()) {
    if(file.endsWith('_flexible_room_access.sql')) {
      await db.query(`insert into public.spaces(slug,creator_device_id,expires_at,secure_invites,pairing_expires_at)
        values('9211','00000000-0000-4000-8000-000000000001',now()+interval '1 day',true,null),
          ('9212','00000000-0000-4000-8000-000000000001',now()+interval '1 day',false,null),
          ('9213','00000000-0000-4000-8000-000000000001',now()+interval '1 day',true,now()+interval '1 minute')`);
      legacyBefore=(await db.query("select id,slug,expires_at,pairing_expires_at from public.spaces where slug in ('9211','9212','9213') order by slug")).rows;
      await db.query(`insert into public.room_invitations(space_id,token_hash,can_write,access_version,expires_at)
        select id,extensions.digest('legacy-matching','sha256'),true,access_version,expires_at from public.spaces where slug='9211'`);
      await db.query(`insert into public.room_invitations(space_id,token_hash,can_write,access_version,expires_at)
        select id,extensions.digest('legacy-expired','sha256'),true,access_version,now()-interval '1 minute' from public.spaces where slug='9211'`);
    }
    if (file === '20261003140629_launch_safety_sender_entitlements.sql') {
      // Reproduce the broad historical hosted grants; a fixture with only CRUD
      // grants would conceal a missing non-row-privilege revoke in the release.
      await db.query(`grant truncate,references,trigger on table public.spaces,
        public.entries,public.notes,public.assets,public.space_members,
        public.upload_intents,public.content_reports to anon,authenticated,service_role`);
    }
    // The embedded runtime lacks pg_net; the fixture's HTTP stub never performs
    // network I/O. Every other migration statement is executed unchanged.
    const sql = (await readFile(path.join('supabase/migrations',file),'utf8'))
      .replace(/create extension if not exists pg_net with schema extensions;/i,'-- pg_net fixture stub');
    try { await db.query(sql); } catch(error) { error.message = `${file}: ${error.message}`; throw error; }
  }
  console.log('PASS all repository migrations compile on PostgreSQL');
  const owner='00000000-0000-4000-8000-000000000001';
  const guest='00000000-0000-4000-8000-000000000002';
  const fresh='00000000-0000-4000-8000-000000000003';
  const sender='00000000-0000-4000-8000-000000000004';
  await db.query(`insert into auth.users(id,email,email_confirmed_at,is_anonymous)
    values($1,null,null,true),($2,null,null,true),($3,null,null,true),
    ($4,'sender@example.test',now(),false)`,[owner,guest,fresh,sender]);
  async function as(user, fn, client=db) {
    await client.query('begin');
    try {
      await client.query('set local role authenticated');
      await client.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);
      await client.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub:user,role:'authenticated'})]);
      const result=await fn(client);
      await client.query('commit');
      return result;
    } catch(error) { await client.query('rollback'); throw error; }
  }
  async function rpc(user, sql, params=[]) {
    return as(user,async c=>(await c.query(sql,params)).rows[0]?.result);
  }
  let passed=0;
  async function check(name, fn) { await fn(); passed++; console.log('PASS '+name); }
  await check('migration preserves existing rooms, deadlines and closed or temporarily paired codes',async()=>{
    const after=(await db.query("select id,slug,expires_at,pairing_expires_at,code_enabled,expiry_mode from public.spaces where slug in ('9211','9212','9213') order by slug")).rows;
    assert.deepEqual(after.map(({code_enabled,expiry_mode,...original})=>original),legacyBefore);
    assert.deepEqual(after.map(row=>row.code_enabled),[false,true,true]);
    assert.deepEqual(after.map(row=>row.expiry_mode),['inactivity','inactivity','inactivity']);
    const markers=(await db.query("select uses_room_expiry from public.room_invitations where space_id=$1 order by expires_at desc",[after[0].id])).rows;
    assert.deepEqual(markers.map(row=>row.uses_room_expiry),[true,false]);
    assert.equal((await db.query("select exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='spaces') ready")).rows[0].ready,true);
    const changed=await rpc(owner,'select public.set_room_access($1,true,null,false) result',[after[0].id]);
    assert.equal(changed.expiry_mode,'inactivity');
    assert.equal(Date.parse(changed.expires_at),new Date(after[0].expires_at).getTime());
    // Return this isolated historical row to its original closed state.
    await rpc(owner,'select public.set_room_access($1,false,null,false) result',[after[0].id]);
  });
  const created=await rpc(owner,'select public.create_space($1) result',['Owner']);
  const room=created.space;
  const noteSlug='local-private-note';
  const note=await rpc(owner,'select public.create_note_entry($1,$2,$3,$4) result',
    [room.id,noteSlug,'LOCALNOTE','Image note']);
  await check('browser roles cannot truncate or acquire content DDL/FK privileges',async()=>{
    const privileges=await db.query(`select role,tablename,privilege
      from unnest(array['anon','authenticated']) as roles(role)
      cross join unnest(array['spaces','entries','notes','assets','space_members',
        'upload_intents','content_reports']) as tables(tablename)
      cross join unnest(array['TRUNCATE','REFERENCES','TRIGGER']) as permissions(privilege)
      where has_table_privilege(role,'public.'||tablename,privilege)`);
    assert.deepEqual(privileges.rows,[]);
    await assert.rejects(as(owner,c=>c.query('truncate public.notes')),error=>error.code==='42501');
    assert.equal(Number((await db.query('select count(*) from public.notes where slug=$1',[noteSlug])).rows[0].count),1);
    assert.equal((await db.query("select has_table_privilege('service_role','public.notes','TRUNCATE') allowed")).rows[0].allowed,true);
  });
  await check('new rooms are open by code with no deadline',async()=>{
    assert.equal(room.code_enabled,true);
    assert.equal(room.expires_at,null);
    assert.equal(room.expiry_mode,'none');
    const joined=await rpc(guest,'select to_jsonb(public.join_space($1,$2)) result',[room.slug,'Guest']);
    assert.equal(joined.id,room.id);
    assert.equal((await db.query('select expires_at from public.room_invitations where id=$1',[created.invitation_id])).rows[0].expires_at,null);
  });
  await rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[created.invite_token,'Guest']);
  await check('invitation admits guest and snapshot declares effective write access',async()=>{
    const opened=await rpc(guest,'select public.open_space($1,$2) result',[room.slug,'Guest']);
    assert.equal(opened.space.can_write,true);
    assert.equal('owner_recovery_hash' in opened.space,false);
  });
  await check('direct retention and paid-flag changes denied',async()=>{
    await assert.rejects(as(owner,c=>c.query('update public.spaces set expires_at=now()+interval \'1 year\',is_pro=true where id=$1',[room.id])),/permission denied|server-managed/);
  });
  const imagePath=room.id+'/inline-image';
  await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,imagePath,100,'image/png']);
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
    ['files',imagePath,owner,{size:100,mimetype:'image/png'}]);
  await rpc(owner,'select public.register_note_asset($1,$2,$3,$4,$5,$6) result',
    [noteSlug,imagePath,'image/png',100,1,1]);
  await check('asset publication consumes reservation and counts actual stored bytes',async()=>{
    assert.equal(Number((await db.query('select count(*) from public.upload_intents where path=$1',[imagePath])).rows[0].count),0);
    assert.equal(Number((await db.query('select size from public.assets where bucket_key=$1',[imagePath])).rows[0].size),100);
  });
  await check('rooms without a timer keep their links, notes and assets after seven inactive days',async()=>{
    await db.query("update public.spaces set last_activity_at=now()-interval '7 days' where id=$1",[room.id]);
    await as(guest,async c=>{
      assert.equal((await c.query('select * from public.spaces where id=$1',[room.id])).rowCount,1);
      assert.equal((await c.query('select * from public.assets where bucket_key=$1',[imagePath])).rowCount,1);
      assert.equal((await c.query('select * from public.notes where slug=$1',[noteSlug])).rowCount,1);
    });
    assert.equal((await rpc(fresh,'select to_jsonb(public.join_room_invitation($1,$2)) result',[created.invite_token,'Seven days later'])).id,room.id);
    // Remove only this fixture membership to retain later expired-room assertions.
    await db.query('delete from public.space_members where space_id=$1 and user_id=$2',[room.id,fresh]);
    assert.equal(Number((await db.query('select public.cleanup_expired_spaces() result')).rows[0].result),0);
    await as(owner,c=>c.query('update public.notes set updated_at=now() where slug=$1',[noteSlug]));
    assert.equal((await db.query('select expires_at from public.spaces where id=$1',[room.id])).rows[0].expires_at,null);
  });
  await check('Free owners can set a fixed timer that content activity cannot extend',async()=>{
    const fixed=await rpc(owner,'select public.set_room_access($1,true,now()+interval \'2 hours\') result',[room.id]);
    assert.equal(fixed.expiry_mode,'fixed');
    const deadline=Date.parse(fixed.expires_at);
    await as(owner,c=>c.query("insert into public.entries(space_id,kind,text,created_by_device_id) values($1,'text','Timer fixture',$2)",[room.id,owner]));
    await as(owner,c=>c.query('update public.notes set updated_at=now() where slug=$1',[noteSlug]));
    assert.equal(new Date((await db.query('select expires_at from public.spaces where id=$1',[room.id])).rows[0].expires_at).getTime(),deadline);
    const invite=(await db.query('select expires_at from public.room_invitations where id=$1',[created.invitation_id])).rows[0];
    assert.equal(new Date(invite.expires_at).getTime(),deadline);
    await assert.rejects(rpc(guest,'select public.set_room_access($1,true,null) result',[room.id]),/owner required/);
    await assert.rejects(rpc(owner,'select public.set_room_access($1,true,now()-interval \'1 second\') result',[room.id]),/future time/);
    await assert.rejects(rpc(owner,"select public.set_room_access($1,true,'infinity') result",[room.id]),/future time/);
  });
  await check('code closure preserves the timer and existing members, reopening works immediately',async()=>{
    const before=(await db.query('select expires_at from public.spaces where id=$1',[room.id])).rows[0].expires_at;
    const closed=await rpc(owner,'select public.set_room_access($1,false,null,false) result',[room.id]);
    assert.equal(closed.code_enabled,false);
    assert.equal(closed.expiry_mode,'fixed');
    assert.equal(Date.parse(closed.expires_at),new Date(before).getTime());
    await assert.rejects(rpc(fresh,'select to_jsonb(public.join_space($1,$2)) result',[room.slug,'Closed']),/closed/);
    await as(guest,async c=>assert.equal((await c.query('select * from public.spaces where id=$1',[room.id])).rowCount,1));
    const reopened=await rpc(owner,'select public.set_room_access($1,true,null,false) result',[room.id]);
    assert.equal(reopened.code_enabled,true);
  });
  await check('removing a timer updates room-bound invitations without extending separately timed links',async()=>{
    const separate=await rpc(owner,'select public.create_room_invitation($1,true,now()+interval \'1 hour\') result',[room.id]);
    const removed=await rpc(owner,'select public.set_room_access($1,true,null) result',[room.id]);
    assert.equal(removed.expires_at,null);
    assert.equal(removed.expiry_mode,'none');
    assert.equal((await db.query('select expires_at from public.room_invitations where id=$1',[created.invitation_id])).rows[0].expires_at,null);
    assert.equal((await db.query('select grant_expires_at from public.space_members where space_id=$1 and user_id=$2',[room.id,guest])).rows[0].grant_expires_at,null);
    assert.equal(new Date((await db.query('select expires_at from public.room_invitations where id=$1',[separate.id])).rows[0].expires_at).getTime(),Date.parse(separate.expires_at));
  });
  await check('owners rotate or choose exact room codes while room IDs, invitations and members stay intact',async()=>{
    const previous=room.slug;
    await assert.rejects(rpc(guest,'select public.rotate_room_code($1,null) result',[room.id]),/owner required/);
    await assert.rejects(rpc(owner,'select public.rotate_room_code($1,$2) result',[room.id,'12345']),/four-digit/);
    const rotated=await rpc(owner,'select public.rotate_room_code($1,null) result',[room.id]);
    assert.match(rotated.slug,/^\d{4}$/);
    assert.notEqual(rotated.slug,previous);
    assert.equal(rotated.id,room.id);
    await assert.rejects(rpc(fresh,'select to_jsonb(public.join_space($1,$2)) result',[previous,'Stale']),/not found/);
    const fromInvite=await rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[created.invite_token,'Existing']);
    assert.equal(fromInvite.slug,rotated.slug);
    assert.equal((await db.query('select space_id from public.entries where id=$1',[note.entry_id])).rows[0].space_id,room.id);
    // Reusing this room's own retired code is safe; another room cannot claim it.
    const restored=await rpc(owner,'select public.rotate_room_code($1,$2) result',[room.id,previous]);
    assert.equal(restored.slug,previous);
    const privatePrivileges=(await db.query("select has_table_privilege('authenticated','woff_private.room_code_history','select') readable,has_function_privilege('anon','public.set_room_access(uuid,boolean,timestamptz,boolean)','execute') access_rpc,has_function_privilege('anon','public.rotate_room_code(uuid,text)','execute') code_rpc")).rows[0];
    assert.deepEqual(privatePrivileges,{readable:false,access_rpc:false,code_rpc:false});
  });
  await check('atomic privacy advances version and hides note assets through RLS',async()=>{
    const result=await rpc(owner,'select public.set_note_privacy($1,true,1) result',[noteSlug]);
    assert.equal(result.version,2);
    assert.equal(result.is_locked,true);
    await as(guest,async c=>{
      assert.equal((await c.query('select * from public.assets where bucket_key=$1',[imagePath])).rowCount,0);
      assert.equal((await c.query('select * from storage.objects where name=$1',[imagePath])).rowCount,0);
      assert.equal((await c.query('select * from public.notes where slug=$1',[noteSlug])).rowCount,0);
    });
    await as(owner,async c=>{
      assert.equal((await c.query('select * from public.assets where bucket_key=$1',[imagePath])).rowCount,1);
      assert.equal((await c.query('select * from storage.objects where name=$1',[imagePath])).rowCount,0);
    });
  });
  await check('privacy stale version fails without mutating state',async()=>{
    await assert.rejects(rpc(owner,'select public.set_note_privacy($1,false,1) result',[noteSlug]),/changed elsewhere/);
    assert.equal((await db.query('select version,is_locked from public.notes where slug=$1',[noteSlug])).rows[0].version,2);
  });
  await check('published object cannot be overwritten directly',async()=>{
    await as(owner,async c=>assert.equal((await c.query('update storage.objects set metadata=$1 where name=$2',[{size:200},imagePath])).rowCount,0));
    assert.equal(await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,imagePath,100,'image/png']),false);
  });
  const mismatchPath=room.id+'/mismatch';
  await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,mismatchPath,100,'image/png']);
  // Explicitly simulate corrupt historical backend metadata: the final-storage
  // trigger is disabled only by this isolated fixture's PostgreSQL superuser.
  await db.query('alter table storage.objects disable trigger enforce_completed_object_size');
  await db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
    ['files',mismatchPath,owner,{size:200}]);
  await db.query('alter table storage.objects enable trigger enforce_completed_object_size');
  await check('actual object-size mismatch prevents publication transactionally',async()=>{
    await assert.rejects(rpc(owner,'select public.register_note_asset($1,$2,$3,$4,$5,$6) result',
      [noteSlug,mismatchPath,'image/png',100,1,1]),/size or ownership mismatch/);
    assert.equal(Number((await db.query('select count(*) from public.upload_intents where path=$1',[mismatchPath])).rows[0].count),1);
  });
  await check('reservation retry is idempotent and malformed batches roll back',async()=>{
    assert.equal(await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,mismatchPath,100,'image/png']),true);
    const first=room.id+'/batch-valid';
    assert.equal(await rpc(owner,'select public.reserve_upload_batch($1,$2) result',[room.id,JSON.stringify([{path:first,size:50},{path:room.id+'/bad',size:0}])]),false);
    assert.equal(Number((await db.query('select count(*) from public.upload_intents where path=$1',[first])).rows[0].count),0);
  });
  await check('revoked invitation immediately removes existing guest reads and writes',async()=>{
    assert.equal(await rpc(owner,'select public.revoke_room_invitation($1) result',[created.invitation_id]),true);
    await as(guest,async c=>assert.equal((await c.query('select * from public.entries where space_id=$1',[room.id])).rowCount,0));
    assert.equal(await rpc(guest,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,room.id+'/revoked',1,'text/plain']),false);
  });
  const invitation=await rpc(owner,'select public.create_room_invitation($1,false,null) result',[room.id]);
  await rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[invitation.token,'Guest']);
  await check('read-only invitation prevents direct writes and definer note/upload RPCs',async()=>{
    await assert.rejects(as(guest,c=>c.query(`insert into public.entries(space_id,kind,text,created_by_device_id)
      values($1,'text','Denied',$2)`,[room.id,guest])),/row-level security|read-only/);
    assert.equal(await rpc(guest,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,room.id+'/readonly',1,'text/plain']),false);
    await assert.rejects(rpc(guest,'select public.create_note_entry($1,$2,$3,$4) result',[room.id,'blocked-note','BLOCKED','Denied']),/read-only/);
  });
  // Previous participant authorship is deliberately retained through recovery.
  const writingInvitation=await rpc(owner,'select public.create_room_invitation($1,true,null) result',[room.id]);
  await rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[writingInvitation.token,'Guest']);
  const guestNote=await rpc(guest,'select public.create_note_entry($1,$2,$3,$4) result',[room.id,'guest-note','GUESTNOTE','Guest note']);
  let recovered;
  await check('recovery rotates secret and transfers only previous owner authorship',async()=>{
    recovered=await rpc(fresh,'select public.recover_space_ownership($1,$2,$3) result',[room.slug,created.recovery_key,'Recovered']);
    assert.equal(recovered.recovered,true);
    assert.notEqual(recovered.recovery_key,created.recovery_key);
    assert.equal((await db.query('select created_by_user_id from public.notes where slug=$1',[noteSlug])).rows[0].created_by_user_id,fresh);
    assert.equal((await db.query('select created_by_user_id from public.notes where entry_id=$1',[guestNote.entry_id])).rows[0].created_by_user_id,guest);
    const saved=await rpc(fresh,'select public.save_note_snapshot($1,$2,$3,$4,$5) result',
      [noteSlug,'Recovered note','<p>Restored</p>',{type:'doc',content:[]},2]);
    assert.equal(saved.version,3);
    await assert.rejects(rpc(owner,'select public.recover_space_ownership($1,$2,$3) result',[room.slug,created.recovery_key,'Old owner']),/Invalid recovery/);
  });
  await db.query("update public.spaces set expires_at=now()-interval '1 second' where id=$1",[room.id]);
  await check('expired room denies rows, Storage reads and all creation without cleanup',async()=>{
    await as(fresh,async c=>{
      for(const table of ['spaces','entries','assets','notes']) {
        assert.equal((await c.query(`select * from public.${table}`)).rowCount,0,table);
      }
      assert.equal((await c.query('select * from storage.objects')).rowCount,0);
    });
    assert.equal(await rpc(fresh,'select public.reserve_upload($1,$2,$3,$4) result',[room.id,room.id+'/expired',1,'text/plain']),false);
    await assert.rejects(rpc(fresh,'select public.create_note_entry($1,$2,$3,$4) result',[room.id,'expired-note','EXPIRED','No']),/expired|read-only/);
    await assert.rejects(rpc(fresh,'select public.save_note_snapshot($1,$2,$3,$4,$5) result',
      [noteSlug,'No','<p>No</p>',{type:'doc',content:[]},3]),/expired|read-only/);
    assert.ok(new Date((await db.query('select expires_at from public.spaces where id=$1',[room.id])).rows[0].expires_at)<new Date());
  });
  await check('verified sender account required and entitlement cannot be self-granted',async()=>{
    await assert.rejects(rpc(owner,'select public.ensure_sender_account() result'),/verified/);
    await rpc(sender,'select public.ensure_sender_account() result');
    await assert.rejects(as(sender,c=>c.query("update public.sender_entitlements set plan='pro',pro_until=now()+interval '1 year'")),/permission denied/);
  });
  await db.query("update public.sender_entitlements set plan='pro',status='active',pro_until=now()+interval '1 month' where user_id=$1",[sender]);
  const proRoom=await rpc(sender,'select public.create_room_from_template($1) result',['Sender']);
  await check('Pro room uses bounded seven-day expiry and effective read-only recipients',async()=>{
    assert.equal(proRoom.space.retention_days,7);
    assert.equal(proRoom.space.delivery_mode,'read_only');
    const deadline=new Date(proRoom.space.expires_at);
    await rpc(sender,'select public.create_note_entry($1,$2,$3,$4) result',[proRoom.space.id,'pro-note','PRONOTE','Pro']);
    assert.equal(new Date((await db.query('select expires_at from public.spaces where id=$1',[proRoom.space.id])).rows[0].expires_at).getTime(),deadline.getTime());
    await rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[proRoom.invite_token,'Guest']);
    assert.equal((await rpc(guest,'select public.open_space($1,$2) result',[proRoom.space.slug,'Guest'])).space.can_write,false);
    assert.equal((await rpc(guest,'select public.open_note($1,$2) result',['pro-note','Guest'])).can_edit,false);
  });
  await check('handoff presentation settings preserve a selected timer and code closure',async()=>{
    const closed=await rpc(sender,'select public.set_room_access($1,false,null,false) result',[proRoom.space.id]);
    const edited=await rpc(sender,'select public.update_room_settings($1,$2,$3,$4,$5) result',[proRoom.space.id,'Edited handoff','Welcome','read_only',30]);
    assert.equal(edited.space.code_enabled,false);
    assert.equal(edited.space.expiry_mode,closed.expiry_mode);
    assert.equal(edited.space.expires_at,closed.expires_at);
    await rpc(sender,'select public.set_room_access($1,true,null,false) result',[proRoom.space.id]);
  });
  await check('Pro retention rejects null/unbounded choices and stale entitlement',async()=>{
    await assert.rejects(rpc(sender,'select public.update_room_settings($1,$2,$3,$4,$5) result',[proRoom.space.id,'Name','','read_only',365]),/Invalid room settings/);
    await db.query("update public.sender_entitlements set pro_until=now()-interval '1 day',grace_until=null where user_id=$1",[sender]);
    await assert.rejects(rpc(sender,'select public.update_room_settings($1,$2,$3,$4,$5) result',[proRoom.space.id,'Name','','read_only',30]),/Pro is required/);
    assert.equal((await rpc(sender,'select public.get_sender_account() result')).is_pro,false);
    assert.equal((await rpc(sender,'select public.open_space($1,$2) result',[proRoom.space.slug,'Sender'])).space.id,proRoom.space.id);
  });
  await check('account merge proof is single-use and restores source-owned rooms only',async()=>{
    const token=await rpc(fresh,'select public.create_account_merge_ticket() result');
    const result=await rpc(sender,'select public.redeem_account_merge_ticket($1) result',[token]);
    assert.equal(result.rooms_transferred,1);
    assert.equal((await db.query('select creator_device_id from public.spaces where id=$1',[room.id])).rows[0].creator_device_id,sender);
    assert.equal((await db.query('select created_by_user_id from public.notes where entry_id=$1',[guestNote.entry_id])).rows[0].created_by_user_id,guest);
    await assert.rejects(rpc(sender,'select public.redeem_account_merge_ticket($1) result',[token]),/Invalid merge proof/);
  });
  const quotaRoom=await rpc(owner,'select public.create_space($1) result',['Quota']);
  await check('active and retired codes cannot be taken by another room, including simultaneous owner requests',async()=>{
    const retired=(await db.query('select slug from woff_private.room_code_history where space_id=$1 and slug<>$2 limit 1',[room.id,room.slug])).rows[0].slug;
    await assert.rejects(rpc(owner,'select public.rotate_room_code($1,$2) result',[quotaRoom.space.id,room.slug]),/already in use/);
    await assert.rejects(rpc(owner,'select public.rotate_room_code($1,$2) result',[quotaRoom.space.id,retired]),/already in use/);
    assert.equal((await db.query('select slug from public.spaces where id=$1',[quotaRoom.space.id])).rows[0].slug,quotaRoom.space.slug);
    const other=legacyBefore[1];
    const candidate=(await db.query(`select lpad(code::text,4,'0') slug from generate_series(0,9999) code
      where not exists(select 1 from public.spaces where slug=lpad(code::text,4,'0'))
      and not exists(select 1 from woff_private.room_code_history where slug=lpad(code::text,4,'0')) limit 1`)).rows[0].slug;
    const a=new Client({connectionString:base+database});
    const b=new Client({connectionString:base+database});
    await Promise.all([a.connect(),b.connect()]);
    try {
      const results=await Promise.allSettled([quotaRoom.space.id,other.id].map((id,i)=>as(owner,async c=>(await c.query('select public.rotate_room_code($1,$2) result',[id,candidate])).rows[0].result,[a,b][i])));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      assert.equal(results.filter(result=>result.status==='rejected' && /already in use/.test(result.reason.message)).length,1);
      assert.equal(Number((await db.query('select count(*) from public.spaces where slug=$1',[candidate])).rows[0].count),1);
    } finally { await Promise.all([a.end(),b.end()]); }
  });
  // Seed retained historical bytes to exercise admission with small real uploads.
  const quotaEntry=(await db.query("insert into public.entries(space_id,kind,created_by_device_id) values($1,'file',$2) returning id",[quotaRoom.space.id,owner])).rows[0].id;
  await db.query('insert into public.assets(entry_id,bucket_key,mime,size,is_legacy) values($1,$2,$3,$4,true)',
    [quotaEntry,quotaRoom.space.id+'/historical','application/octet-stream',199*1024*1024]);
  await check('parallel reservations serialize the room and owner allowance',async()=>{
    const a=new Client({connectionString:base+database});
    const b=new Client({connectionString:base+database});
    await Promise.all([a.connect(),b.connect()]);
    try {
      const results=await Promise.all([a,b].map((c,i)=>as(owner,async client=>(await client.query(
        'select public.reserve_upload($1,$2,$3,$4) result',
        [quotaRoom.space.id,quotaRoom.space.id+'/parallel-'+i,1024*1024,'text/plain'])).rows[0].result,c)));
      assert.deepEqual(results.sort(),[false,true]);
      assert.equal(Number((await db.query('select sum(size) total from public.upload_intents where space_id=$1',[quotaRoom.space.id])).rows[0].total),1024*1024);
    } finally { await Promise.all([a.end(),b.end()]); }
  });
  await check('cancellation releases logical capacity and queues physical removal',async()=>{
    const existing=(await db.query('select path from public.upload_intents where space_id=$1',[quotaRoom.space.id])).rows[0].path;
    assert.equal(await rpc(owner,'select public.cancel_upload_reservations($1,$2) result',[quotaRoom.space.id,[existing]]),1);
    assert.equal(await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',[quotaRoom.space.id,quotaRoom.space.id+'/after-cancel',1024*1024,'text/plain']),true);
    assert.equal(Number((await db.query('select count(*) from public.deleted_storage_keys where bucket_key=$1',[existing])).rows[0].count),1);
  });
  await check('owner quota counts retained assets across rooms, including participant bytes',async()=>{
    const room2=await rpc(owner,'select public.create_space($1) result',['Quota two']);
    const entry2=(await db.query("insert into public.entries(space_id,kind,created_by_device_id) values($1,'file',$2) returning id",[room2.space.id,guest])).rows[0].id;
    await db.query('insert into public.assets(entry_id,bucket_key,mime,size,is_legacy) values($1,$2,$3,$4,true)',
      [entry2,room2.space.id+'/participant-old','application/octet-stream',199*1024*1024]);
    const room3=await rpc(owner,'select public.create_space($1) result',['Quota three']);
    assert.equal(await rpc(owner,'select public.reserve_upload($1,$2,$3,$4) result',
      [room3.space.id,room3.space.id+'/over-total',2*1024*1024,'text/plain']),false);
  });
  await check('legacy temporary pairing remains bounded after explicit code closure',async()=>{
    const pairing=await rpc(guest,'select public.create_space($1) result',['Pairing']);
    await rpc(guest,'select public.set_room_pairing($1,0) result',[pairing.space.id]);
    await assert.rejects(rpc(owner,'select to_jsonb(public.join_space($1,$2)) result',[pairing.space.slug,'Owner']),/closed/);
    await rpc(guest,'select public.set_room_pairing($1,1) result',[pairing.space.id]);
    await rpc(owner,'select to_jsonb(public.join_space($1,$2)) result',[pairing.space.slug,'Owner']);
    await rpc(guest,'select public.set_room_pairing($1,0) result',[pairing.space.id]);
    await assert.rejects(rpc(fresh,'select to_jsonb(public.join_space($1,$2)) result',[pairing.space.slug,'Fresh']),/closed/);
    const legacy=(await db.query("insert into public.spaces(slug,creator_device_id,expires_at,secure_invites) values('9999',$1,now()+interval '1 day',false) returning id",[guest])).rows[0];
    await rpc(fresh,'select to_jsonb(public.join_space($1,$2)) result',['9999','Legacy']);
    await rpc(guest,'select public.rotate_room_access($1) result',[legacy.id]);
    await as(fresh,async c=>assert.equal((await c.query('select * from public.spaces where id=$1',[legacy.id])).rowCount,0));
  });
  await check('ten active paid rooms cap is enforced inside competing settings RPCs',async()=>{
    await db.query("update public.sender_entitlements set pro_until=now()+interval '1 month' where user_id=$1",[sender]);
    // One existing Pro room plus nine historical paid fixtures reaches ten.
    for(let i=0;i<9;i++) await db.query(`insert into public.spaces(slug,creator_device_id,is_pro,retention_days,expires_at)
      values($1,$2,true,7,now()+interval '7 days')`,['88'+String(i).padStart(2,'0'),sender]);
    const another=await rpc(sender,'select public.create_space($1) result',['At cap']);
    await assert.rejects(rpc(sender,'select public.update_room_settings($1,$2,$3,$4,$5) result',
      [another.space.id,'Extra','','read_only',7]),/room limit/);
  });
  await check('anonymous and public roles cannot execute privileged internal/account functions',async()=>{
    const result=await db.query(`select has_function_privilege('anon','public.ensure_sender_account()','execute') account,
      has_function_privilege('authenticated','woff_private.transfer_room_authorship(uuid,text,uuid)','execute') transfer,
      has_table_privilege('authenticated','public.sender_entitlements','update') entitlement_write`);
    assert.deepEqual(result.rows[0],{account:false,transfer:false,entitlement_write:false});
  });
  await check('plain text entries remain readable and first-party events contain no private payload',async()=>{
    await as(owner,c=>c.query("insert into public.entries(space_id,kind,text,created_by_device_id) values($1,'text','Plain text',$2)",[quotaRoom.space.id,owner]));
    await as(owner,async c=>assert.equal((await c.query('select text from public.entries where space_id=$1 and text=$2',[quotaRoom.space.id,'Plain text'])).rowCount,1));
    assert.equal(await rpc(owner,'select public.record_room_event($1,$2) result',[quotaRoom.space.id,'share_initiated']),true);
    assert.equal(await rpc(owner,'select public.record_room_event($1,$2) result',[quotaRoom.space.id,'filename']),false);
    assert.equal(await rpc(fresh,'select public.record_room_event($1,$2) result',[quotaRoom.space.id,'download_initiated']),false);
    const columns=(await db.query("select column_name from information_schema.columns where table_schema='woff_private' and table_name='product_daily_metrics' order by ordinal_position")).rows.map(r=>r.column_name);
    assert.deepEqual(columns,['day','event','count']);
    await assert.rejects(as(owner,c=>c.query('select * from woff_private.product_daily_metrics')),/permission denied/);
  });
  await check('authenticated plain text INSERT RETURNING and later UPDATE RETURNING stay readable',async()=>{
    const inserted = await as(owner,async c=>(await c.query(`insert into public.entries
      (space_id,kind,text,created_by_device_id) values($1,'text',$2,$3)
      returning id,space_id,text,created_by_device_id`,
      [quotaRoom.space.id,'Disposable release verification',owner])).rows[0]);
    assert.equal(inserted.space_id,quotaRoom.space.id);
    assert.equal(inserted.created_by_device_id,owner);
    const updated = await as(owner,async c=>(await c.query(`update public.entries
      set text=$2 where id=$1 returning id,text`,[inserted.id,'Updated disposable verification'])).rows[0]);
    assert.equal(updated.id,inserted.id);
    assert.equal(updated.text,'Updated disposable verification');
    await as(owner,async c=>assert.equal((await c.query('select text from public.entries where id=$1',[inserted.id])).rows[0].text,updated.text));
    await as(guest,async c=>assert.equal((await c.query('select * from public.entries where id=$1',[inserted.id])).rowCount,0));
  });
  await check('Storage preflight/publication works while browser signing reads remain denied',async()=>{
    const sourceRoom=await rpc(fresh,'select public.create_space($1) result',['Upload']);
    const reservedPath=sourceRoom.space.id+'/actual-check';
    assert.equal(await rpc(fresh,'select public.reserve_upload($1,$2,$3,$4) result',[sourceRoom.space.id,reservedPath,20,'image/png']),true);
    await assert.rejects(as(fresh,c=>c.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      ['files',reservedPath,fresh,{size:30}])),/row-level security|differs from/);
    // Storage canUpload testPermission rolls back this synthetic INSERT.
    await as(fresh,async c=>{
      await c.query('savepoint preflight');
      await c.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
        ['files',reservedPath,fresh,{contentLength:20,mimetype:'image/png'}]);
      await c.query('rollback to savepoint preflight');
    });
    await assert.rejects(as(fresh,c=>c.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      ['files',reservedPath,fresh,{mimetype:'image/png'}])),/row-level security/);
    // Privileged Storage completeUpload still passes the byte-size trigger.
    await assert.rejects(db.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      ['files',reservedPath,fresh,{size:30}]),/differs from/);
    await as(fresh,c=>c.query('insert into storage.objects(bucket_id,name,owner_id,metadata) values($1,$2,$3,$4)',
      ['files',reservedPath,fresh,{size:20}]));
    await as(fresh,async c=>assert.equal((await c.query('select * from storage.objects where name=$1',[reservedPath])).rowCount,0));
    const published=await rpc(fresh,'select to_jsonb(public.create_file_entry($1,$2,$3)) result',
      [sourceRoom.space.id,JSON.stringify([{path:reservedPath,size:20,name:'image.png',type:'image/png'}]),'files']);
    assert.equal(published.kind,'file');
    await as(fresh,async c=>assert.equal((await c.query('select * from storage.objects where name=$1',[reservedPath])).rowCount,0));
    assert.equal(Number((await db.query('select count(*) from public.upload_intents where path=$1',[reservedPath])).rows[0].count),0);
  });
  await check('caller-selected limits and arbitrary action names cannot reset server attempt controls',async()=>{
    assert.equal(await rpc(guest,'select public.consume_rate_limit($1,$2,$3) result',['unbounded-custom-action',999999,1]),false);
    for(let i=0;i<20;i++) assert.equal(await rpc(guest,'select public.consume_rate_limit($1,$2,$3) result',['upload_batch',999999,1]),true);
    assert.equal(await rpc(guest,'select public.consume_rate_limit($1,$2,$3) result',['upload_batch',999999,1]),false);
  });
  await check('only the active owner rotates recovery proof and receives invitation version',async()=>{
    await assert.rejects(rpc(guest,'select public.rotate_room_recovery_key($1) result',[quotaRoom.space.id]),/owner required/);
    const rotated=await rpc(owner,'select public.rotate_room_recovery_key($1) result',[quotaRoom.space.id]);
    assert.match(rotated.recovery_key,/^[0-9A-F]{32}$/);
    assert.notEqual(rotated.recovery_key,quotaRoom.recovery_key);
    await assert.rejects(rpc(fresh,'select public.recover_space_ownership($1,$2,$3) result',[quotaRoom.space.slug,quotaRoom.recovery_key,'Old key']),/Invalid recovery/);
    const invitation=await rpc(owner,'select public.rotate_room_access($1) result',[quotaRoom.space.id]);
    assert.equal(invitation.access_version,2);
  });
  const payer='00000000-0000-4000-8000-000000000005';
  await db.query("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'payer@example.test',now(),false)",[payer]);
  await rpc(payer,'select public.ensure_sender_account() result');
  async function service(fn) {
    await db.query('begin');
    try { await db.query('set local role service_role'); const result=await fn(db); await db.query('commit'); return result; }
    catch(error) { await db.query('rollback'); throw error; }
  }
  const occurred=new Date(Date.now()-20*60*1000);
  const paidUntil=new Date(Date.now()+30*24*60*60*1000);
  const eventSQL='select public.process_billing_event($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result';
  let billingReservation;
  const event=(key,status,time=occurred,mode=false,user=payer,reservation=billingReservation?.reservation_id,reserveCapacity=true)=>
    [key.repeat(64),'subscription_updated',time,user,'12345','67890',status,paidUntil,mode,{},reservation,reserveCapacity];
  async function bill(params) { return service(async c=>(await c.query(eventSQL,params)).rows[0].result); }
  await check('paid admission stays closed until funded service configuration',async()=>{
    await assert.rejects(rpc(payer,'select public.reserve_sender_checkout() result'),/not ready/);
    await service(c=>c.query('update woff_private.pilot_capacity set checkout_enabled=true,capacity_bytes=$1 where id=1',[7*1024**3]));
    billingReservation=await rpc(payer,'select public.reserve_sender_checkout() result');
    assert.ok(billingReservation.reservation_id);
    await assert.rejects(rpc(payer,'select public.reserve_sender_checkout() result'),/already being prepared/);
    await service(c=>c.query('select public.record_sender_checkout($1,$2,$3)',
      [payer,billingReservation.reservation_id,'https://woff.lemonsqueezy.com/checkout/test']));
    const retry=await rpc(payer,'select public.reserve_sender_checkout() result');
    assert.equal(retry.reservation_id,billingReservation.reservation_id);
    assert.equal(retry.checkout_url,'https://woff.lemonsqueezy.com/checkout/test');
  });
  await check('only verified service events grant paid access; test-mode mismatch rolls back',async()=>{
    await assert.rejects(as(payer,c=>c.query(eventSQL,event('a','active'))),/permission denied/);
    await assert.rejects(bill(event('a','active',occurred,false,owner)),/Verified sender/);
    await assert.rejects(bill(event('a','active',occurred,true)),/mode mismatch/);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events')).rows[0].count),0);
    assert.equal((await bill(event('a','active'))).processed,true);
    const account=await rpc(payer,'select public.get_sender_account() result');
    assert.equal(account.is_pro,true);
    assert.equal(account.subscription_id,'67890');
    assert.equal(account.customer_id,'12345');
  });
  await check('billing deduplication and canonical timestamp ordering prevent regressions',async()=>{
    assert.equal((await bill(event('a','expired'))).ignored,'duplicate');
    assert.equal((await bill(event('b','expired',new Date(occurred.getTime()-1000)))).ignored,'stale');
    assert.equal((await bill(event('c','expired',occurred))).ignored,'stale');
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).is_pro,true);
  });
  await check('cancellation preserves paid-through while payment retries cannot refresh grace',async()=>{
    await bill(event('d','cancelled',new Date(occurred.getTime()+1000)));
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).is_pro,true);
    await db.query("update public.sender_entitlements set pro_until=now()-interval '1 hour' where user_id=$1",[payer]);
    await bill(event('e','past_due',new Date(occurred.getTime()+2000)));
    const grace=(await rpc(payer,'select public.get_sender_account() result')).grace_until;
    await bill(event('f','past_due',new Date(occurred.getTime()+3000)));
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).grace_until,grace);
    assert.ok(new Date(grace)<new Date(Date.now()+3*24*60*60*1000));
  });
  await check('pilot reservations cap active and pending senders at five',async()=>{
    for(let i=6;i<=9;i++) {
      const id='00000000-0000-4000-8000-'+String(i).padStart(12,'0');
      await db.query('insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,$2,now(),false)',[id,`pilot${i}@example.test`]);
      await rpc(id,'select public.ensure_sender_account() result');
      if(i<=8) assert.ok((await rpc(id,'select public.reserve_sender_checkout() result')).reservation_id);
      else await assert.rejects(rpc(id,'select public.reserve_sender_checkout() result'),/pilot is full/);
    }
  });
  await check('reserved paid allowances block excess free uploads and retain physical cleanup backlog',async()=>{
    await db.query('update woff_private.pilot_capacity set capacity_bytes=woff_private.committed_storage_bytes()+1 where id=1');
    const freeRoom=(await db.query('select id from public.spaces where creator_device_id=$1 and (expires_at is null or expires_at>now()) limit 1',[fresh])).rows[0];
    assert.equal(await rpc(fresh,'select public.reserve_upload($1,$2,$3,$4) result',[freeRoom.id,freeRoom.id+'/headroom-denied',10,'text/plain']),false);
    assert.equal(await rpc(sender,'select public.reserve_upload($1,$2,$3,$4) result',[proRoom.space.id,proRoom.space.id+'/paid-headroom',10,'text/plain']),true);
    const before=BigInt((await db.query('select woff_private.committed_storage_bytes() result')).rows[0].result);
    // This orphan is still counted even though its original room has expired.
    await db.query('delete from storage.objects where name=$1',[mismatchPath]);
    const after=BigInt((await db.query('select woff_private.committed_storage_bytes() result')).rows[0].result);
    // Paid unused allowance replaces freed bytes; its full promised capacity
    // remains reserved. Nonpaid/orphan cleanup bytes are counted separately.
    assert.equal(before-after,0n);
    await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata) values('files','unowned-cleanup-backlog',null,$1)",[{size:200}]);
    const withBacklog=BigInt((await db.query('select woff_private.committed_storage_bytes() result')).rows[0].result);
    assert.equal(withBacklog-after,200n);
    await db.query("delete from storage.objects where name='unowned-cleanup-backlog'");
    assert.equal(BigInt((await db.query('select woff_private.committed_storage_bytes() result')).rows[0].result),after);
  });
  await check('unpaid status removes new premium privileges without deleting paid rooms',async()=>{
    await bill(event('0','unpaid',new Date(occurred.getTime()+4000)));
    const account=await rpc(payer,'select public.get_sender_account() result');
    assert.equal(account.is_pro,false);
    assert.equal(account.grace_until,null);
    const privileges=await db.query("select has_function_privilege('authenticated','public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean)','execute') allowed");
    assert.equal(privileges.rows[0].allowed,false);
  });
  await check('an unpaid or refunded account cannot regain grace from a later failed retry',async()=>{
    const response=await bill(event('1','past_due',new Date(occurred.getTime()+5000)));
    assert.equal(response.is_pro,false);
    const account=await rpc(payer,'select public.get_sender_account() result');
    assert.equal(account.grace_until,null);
    assert.equal(account.is_pro,false);
    assert.equal(account.billing_capacity_reserved,true);
    const cohort=await db.query('select count(*) from public.sender_entitlements where billing_capacity_reserved');
    assert.equal(Number(cohort.rows[0].count),1);
    await bill(event('4','refunded',new Date(occurred.getTime()+5500)));
    await bill(event('5','past_due',new Date(occurred.getTime()+5600)));
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).grace_until,null);
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).is_pro,false);
  });
  await check('ended provider capacity cannot reactivate after its former seat or allowance is allocated',async()=>{
    await bill(event('2','expired',new Date(occurred.getTime()+6000),false,payer,billingReservation.reservation_id,false));
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).billing_capacity_reserved,false);
    // Shrink funded capacity to current commitments; the former allowance is gone.
    await db.query('update woff_private.pilot_capacity set capacity_bytes=woff_private.committed_storage_bytes() where id=1');
    await assert.rejects(bill(event('3','active',new Date(occurred.getTime()+7000))),/capacity review/);
    assert.equal((await rpc(payer,'select public.get_sender_account() result')).is_pro,false);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events where event_key=$1',['3'.repeat(64)])).rows[0].count),0);
  });
  await check('late first-payment delivery rechecks funded capacity before restoring paid access',async()=>{
    const late='00000000-0000-4000-8000-000000000010';
    await db.query("insert into auth.users(id,email,email_confirmed_at,is_anonymous) values($1,'late@example.test',now(),false)",[late]);
    await rpc(late,'select public.ensure_sender_account() result');
    await db.query('update woff_private.pilot_capacity set capacity_bytes=$1 where id=1',[7*1024**3]);
    const reserved=await rpc(late,'select public.reserve_sender_checkout() result');
    await db.query("update woff_private.sender_checkout_reservations set expires_at=now()-interval '1 minute' where id=$1",[reserved.reservation_id]);
    await db.query('update woff_private.pilot_capacity set capacity_bytes=woff_private.committed_storage_bytes() where id=1');
    const params=event('6','active',occurred,false,late,reserved.reservation_id);
    params[4]='90001'; params[5]='90002';
    await assert.rejects(bill(params),/Late payment requires capacity review/);
    assert.equal(Number((await db.query('select count(*) from woff_private.billing_events where event_key=$1',['6'.repeat(64)])).rows[0].count),0);
    await db.query('update woff_private.pilot_capacity set capacity_bytes=$1 where id=1',[7*1024**3]);
    assert.equal((await bill(params)).is_pro,true);
  });
  await check('expired invitations and scheduled cleanup cannot restore stale access',async()=>{
    const invite=await rpc(owner,'select public.create_room_invitation($1,true,null) result',[quotaRoom.space.id]);
    await db.query("update public.room_invitations set expires_at=now()-interval '1 second' where id=$1",[invite.id]);
    await assert.rejects(rpc(guest,'select to_jsonb(public.join_room_invitation($1,$2)) result',[invite.token,'Expired']),/Invalid invitation/);
    await assert.rejects(as(owner,c=>c.query('select public.cleanup_expired_spaces()')),/permission denied/);
    const cleaned=await service(async c=>(await c.query('select public.cleanup_expired_spaces() result')).rows[0].result);
    assert.ok(cleaned>=1);
    assert.equal(Number((await db.query('select count(*) from public.spaces where id=$1',[room.id])).rows[0].count),0);
    assert.ok(Number((await db.query('select count(*) from public.deleted_spaces_queue where space_id=$1',[room.id])).rows[0].count)>=1);
  });
  console.log(`${passed} database behavior checks passed`);
} finally { await db.end(); }
