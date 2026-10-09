-- Reviewed additive safeguards for the owner's authorized direct Free release.
-- Compare live history, apply only this migration, then deploy matching code.
begin;

create schema if not exists woff_private;
revoke all on schema woff_private from public, anon, authenticated;
grant usage on schema woff_private to authenticated, service_role;

create table public.sender_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'free',
  pro_until timestamptz,
  grace_until timestamptz,
  customer_id text unique,
  subscription_id text unique,
  billing_updated_at timestamptz,
  billing_capacity_reserved boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.sender_entitlements enable row level security;
revoke all on public.sender_entitlements from public, anon, authenticated;
grant select on public.sender_entitlements to authenticated;
grant all on public.sender_entitlements to service_role;
create policy "senders read their entitlement" on public.sender_entitlements
for select to authenticated using (user_id = (select auth.uid()));

create table woff_private.sender_templates (
  user_id uuid primary key references auth.users(id) on delete cascade,
  template jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create table woff_private.account_merge_tickets (
  token_hash bytea primary key,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  consumed_at timestamptz
);
create table woff_private.object_keys (
  path text primary key,
  created_at timestamptz not null default now()
);
create table woff_private.product_daily_metrics (
  day date not null,
  event text not null check (event in ('room_created','file_published','note_created',
    'share_initiated','download_initiated','upload_failed')),
  count bigint not null default 0 check (count >= 0),
  primary key(day,event)
);
alter table woff_private.sender_templates enable row level security;
alter table woff_private.account_merge_tickets enable row level security;
alter table woff_private.object_keys enable row level security;
alter table woff_private.product_daily_metrics enable row level security;
grant select on woff_private.product_daily_metrics to service_role;
revoke all on all tables in schema woff_private from public, anon, authenticated;
insert into woff_private.object_keys(path)
select bucket_key from public.assets union select path from public.upload_intents
union select name from storage.objects where bucket_id = 'files'
on conflict do nothing;

alter table public.spaces
  add column name text not null default '' check (char_length(name) <= 120),
  add column welcome_text text not null default '' check (char_length(welcome_text) <= 5000),
  add column delivery_mode text not null default 'collaborative'
    check (delivery_mode in ('collaborative', 'read_only')),
  add column retention_days integer not null default 2 check (retention_days in (2,7,30)),
  add column secure_invites boolean not null default false,
  add column access_version integer not null default 1,
  add column pairing_expires_at timestamptz;
-- The ADD default marks existing rooms as legacy; future rows are secure.
alter table public.spaces alter column secure_invites set default true;
create index idx_spaces_owner_created on public.spaces(creator_device_id,created_at desc);
-- Historic manually flagged rooms gain a bounded deadline rather than infinity.
update public.spaces set retention_days = 30,
  expires_at = coalesce(expires_at, now() + interval '30 days') where is_pro;
create table public.room_invitations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  token_hash bytea not null unique,
  can_write boolean not null default true,
  access_version integer not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_room_invitations_space on public.room_invitations(space_id);
alter table public.room_invitations enable row level security;
revoke all on public.room_invitations from public, anon, authenticated;
grant select on public.room_invitations to authenticated;
grant all on public.room_invitations to service_role;
create policy "owners read invitation metadata" on public.room_invitations
for select to authenticated using (exists (
  select 1 from public.spaces s where s.id = space_id
  and s.creator_device_id = (select auth.uid())::text
));
alter table public.space_members
  add column invitation_id uuid references public.room_invitations(id) on delete cascade,
  add column access_version integer not null default 1,
  add column can_write boolean not null default true,
  add column grant_expires_at timestamptz;
create index on public.space_members(invitation_id) where invitation_id is not null;

create function woff_private.is_verified_sender(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users where id = p_user_id
    and email_confirmed_at is not null and not coalesce(is_anonymous, false));
$$;
-- Keep the historical signature while making its limits server-controlled.
-- Otherwise callers could reset the shared action window using a smaller period.
create or replace function public.consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare server_limit integer; server_window integer; allowed boolean;
begin
  if auth.uid() is null then return false; end if;
  server_limit := case p_action
    when 'create_space' then 5 when 'recover_space' then 5 when 'claim_legacy' then 5
    when 'merge_ticket' then 5 when 'rotate_recovery' then 5 when 'join_space' then 30 when 'join_note' then 60
    when 'join_invitation' then 30 when 'create_invitation' then 30 when 'upload_intent' then 60 when 'upload_batch' then 20
    when 'create_file_entry' then 30 when 'create_extension_file_entry' then 30
    when 'create_note' then 10 when 'create_entry' then 60 when 'update_entry' then 60
    when 'update_note' then 120 when 'report_entry' then 10
    when 'event_share_initiated' then 30 when 'event_download_initiated' then 30
    when 'event_upload_failed' then 30 else null end;
  if server_limit is null then return false; end if;
  server_window := case when p_action in ('recover_space','claim_legacy','merge_ticket','rotate_recovery','report_entry')
    then 3600 else 60 end;
  insert into public.action_rate_limits(user_id,action,window_start,request_count)
    values(auth.uid(),p_action,now(),1)
  on conflict(user_id,action) do update set
    window_start = case when public.action_rate_limits.window_start < now() - make_interval(secs=>server_window)
      then now() else public.action_rate_limits.window_start end,
    request_count = case when public.action_rate_limits.window_start < now() - make_interval(secs=>server_window)
      then 1 else public.action_rate_limits.request_count + 1 end
  returning request_count <= server_limit into allowed;
  return allowed;
end;
$$;
create function woff_private.owner_is_pro(p_owner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.sender_entitlements e
    where e.user_id::text = p_owner and e.plan = 'pro'
    and greatest(e.pro_until, e.grace_until) > now()
    and woff_private.is_verified_sender(e.user_id));
$$;
create function woff_private.room_active(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.spaces s where s.id = p_space_id
    and coalesce(s.expires_at,s.last_activity_at + interval '48 hours') > now());
$$;
create function woff_private.can_read_room(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.spaces s where s.id = p_space_id
    and coalesce(s.expires_at,s.last_activity_at + interval '48 hours') > now()
    and (s.creator_device_id = auth.uid()::text or exists (
      select 1 from public.space_members m
      left join public.room_invitations i on i.id = m.invitation_id
      where m.space_id = s.id and m.user_id = auth.uid()
      and m.access_version = s.access_version
      and (m.grant_expires_at is null or m.grant_expires_at > now())
      and (m.invitation_id is null or (i.revoked_at is null
        and i.expires_at > now() and i.access_version = s.access_version))
    )));
$$;
create function woff_private.can_write_room(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select woff_private.can_read_room(p_space_id) and exists (
    select 1 from public.spaces s where s.id = p_space_id
    and (s.creator_device_id = auth.uid()::text or (
      s.delivery_mode = 'collaborative' and s.allow_public_post and exists (
        select 1 from public.space_members m where m.space_id = s.id
        and m.user_id = auth.uid() and m.can_write
      ))));
$$;
create function woff_private.can_read_entry(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entries e where e.id = p_entry_id
    and (e.expires_at is null or e.expires_at > now())
    and not (coalesce(e.meta @> '{"is_locked":true}'::jsonb,false) and coalesce(e.meta ? 'content',false)
      and e.created_by_device_id is distinct from auth.uid()::text)
    and woff_private.can_read_room(e.space_id));
$$;
create function woff_private.can_read_asset(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select woff_private.can_read_entry(p_entry_id) and not exists (
    select 1 from public.notes n where n.entry_id = p_entry_id
    and n.is_locked and n.created_by_user_id <> auth.uid()) and not exists (
    select 1 from public.entries e where e.id = p_entry_id
    and e.meta @> '{"is_locked":true}'::jsonb and e.created_by_device_id is distinct from auth.uid()::text);
$$;
create function woff_private.can_write_entry(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.entries e where e.id = p_entry_id
    and e.created_by_device_id = auth.uid()::text
    and (e.expires_at is null or e.expires_at > now())
    and woff_private.can_write_room(e.space_id));
$$;
revoke all on all functions in schema woff_private from public, anon, authenticated;
grant execute on function woff_private.can_read_room(uuid),
  woff_private.can_write_room(uuid), woff_private.can_read_entry(uuid),
  woff_private.can_read_asset(uuid), woff_private.can_write_entry(uuid)
to authenticated;

-- Revoke table-wide room UPDATE: all owner settings are validated by RPCs.
revoke update on public.spaces from authenticated;
revoke insert on public.assets from authenticated;
-- Historical hosted defaults granted these non-row privileges to browser roles.
-- RLS does not authorize TRUNCATE, and clients need neither DDL nor FK grants.
revoke truncate, references, trigger on table public.spaces, public.entries,
  public.notes, public.assets, public.space_members, public.upload_intents,
  public.content_reports from public, anon, authenticated;
alter policy "members can read their spaces" on public.spaces
using (woff_private.can_read_room(id));
alter policy "members can read entries" on public.entries
using (woff_private.can_read_entry(id));
alter policy "members can create their own entries" on public.entries
with check (created_by_device_id = (select auth.uid())::text
  and woff_private.can_write_room(space_id));
alter policy "senders can update their own entries" on public.entries
using (woff_private.can_write_entry(id))
with check (created_by_device_id = (select auth.uid())::text
  and woff_private.can_write_room(space_id));
alter policy "senders can delete their own entries" on public.entries
using (woff_private.can_write_entry(id));
alter policy "members can read entry assets" on public.assets
using (woff_private.can_read_asset(entry_id));
alter policy "members can read unlocked notes" on public.notes
using ((not is_locked or created_by_user_id = (select auth.uid()))
  and woff_private.can_read_entry(entry_id));
alter policy "senders can create notes" on public.notes
with check (created_by_user_id = (select auth.uid())
  and woff_private.can_write_entry(entry_id));
alter policy "note creators can update notes" on public.notes
using (created_by_user_id = (select auth.uid()) and woff_private.can_write_entry(entry_id))
with check (created_by_user_id = (select auth.uid()) and woff_private.can_write_entry(entry_id));
alter policy "note creators can delete notes" on public.notes
using (created_by_user_id = (select auth.uid()) and woff_private.can_write_entry(entry_id));
alter policy "Woff members can read files" on storage.objects
using (false);
alter policy "Woff members can upload files" on storage.objects
with check (bucket_id = 'files' and exists(select 1 from public.upload_intents u
  where u.path = name and u.user_id = (select auth.uid()) and u.expires_at > now()
  -- Storage's synthetic preflight INSERT uses contentLength; completed objects
  -- use size. TUS Upload-Length and binary upload Content-Length must be known.
  and coalesce((metadata->>'size')::bigint,(metadata->>'contentLength')::bigint,-1) = u.size
  and woff_private.can_write_room(u.space_id)));
-- Every object has a unique reservation/key; published objects cannot be upserted.
alter policy "Woff senders can update their files" on storage.objects
using (false) with check (false);
alter policy "Woff senders can delete their files" on storage.objects
using (bucket_id = 'files' and (
  exists(select 1 from public.assets a where a.bucket_key = name
    and woff_private.can_write_entry(a.entry_id)) or
  exists(select 1 from public.upload_intents u where u.path = name
    and u.user_id = (select auth.uid()) and woff_private.can_write_room(u.space_id))
));

create or replace function public.protect_space_admin_fields()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    raise exception 'Room settings are server-managed';
  end if;
  return new;
end;
$$;
create function woff_private.guard_content_write()
returns trigger language plpgsql security definer set search_path = '' as $$
declare room_id uuid; entry_deadline timestamptz;
begin
  -- Identity-only transfers are authorized by the caller RPC. Direct API UPDATE
  -- still passes the separate invoker identity trigger and is rejected there.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'entries' then
      if new.created_by_device_id is distinct from old.created_by_device_id
        and (to_jsonb(new) - 'created_by_device_id') = (to_jsonb(old) - 'created_by_device_id') then return new; end if;
    elsif tg_table_name = 'notes' then
      if new.created_by_user_id is distinct from old.created_by_user_id
        and (to_jsonb(new) - 'created_by_user_id') = (to_jsonb(old) - 'created_by_user_id') then return new; end if;
    end if;
  end if;
  if tg_table_name = 'entries' then room_id := new.space_id;
  else select space_id, expires_at into room_id, entry_deadline
    from public.entries where id = new.entry_id;
  end if;
  if auth.uid() is not null and (not woff_private.can_write_room(room_id)
    or entry_deadline <= now()) then raise exception 'Room is expired or read-only'; end if;
  return new;
end;
$$;
create trigger enforce_entry_room_access before insert or update on public.entries
for each row execute function woff_private.guard_content_write();
create trigger enforce_note_room_access before insert or update on public.notes
for each row execute function woff_private.guard_content_write();
create function woff_private.guard_content_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user in ('authenticated','anon') then
    if tg_table_name = 'entries' then
      if new.id <> old.id or new.space_id <> old.space_id
        or new.created_by_device_id is distinct from old.created_by_device_id
        or new.created_at <> old.created_at or new.expires_at is distinct from old.expires_at
        then raise exception 'Entry identity and expiry are server-managed'; end if;
    else
      if new.id <> old.id or new.entry_id <> old.entry_id
        or new.created_by_user_id <> old.created_by_user_id or new.slug <> old.slug
        or new.public_code <> old.public_code or new.created_at <> old.created_at
        then raise exception 'Note identity is server-managed'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger protect_entry_identity before update on public.entries
for each row execute function woff_private.guard_content_identity();
create trigger protect_note_identity before update on public.notes
for each row execute function woff_private.guard_content_identity();

create or replace function public.touch_space_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.spaces set last_activity_at = now(),
    expires_at = case when retention_days = 2 then now() + interval '48 hours' else expires_at end
  where id = new.space_id and coalesce(expires_at,last_activity_at + interval '48 hours') > now();
  return new;
end;
$$;
create or replace function public.touch_note_space_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.spaces s set last_activity_at = now(),
    expires_at = case when s.retention_days = 2 then now() + interval '48 hours' else s.expires_at end
  from public.entries e where e.id = new.entry_id and s.id = e.space_id
    and coalesce(s.expires_at,s.last_activity_at + interval '48 hours') > now();
  return new;
end;
$$;
create or replace function public.cleanup_expired_spaces()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  with deleted as (delete from public.spaces
    where coalesce(expires_at,last_activity_at + interval '48 hours') <= now() returning id)
  select count(*) into removed from deleted;
  return removed;
end;
$$;

create function woff_private.guard_upload_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id text; pro boolean; room_used bigint; owner_used bigint;
begin
  select creator_device_id into owner_id from public.spaces where id = new.space_id;
  if auth.uid() is null or new.user_id <> auth.uid()
    or not woff_private.can_write_room(new.space_id)
    or new.path not like (new.space_id::text || '/%') then
    raise exception 'Upload not authorized';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id, 604031));
  if not woff_private.upload_capacity_available(owner_id,new.size) then
    raise exception 'Service storage capacity reached';
  end if;
  pro := woff_private.owner_is_pro(owner_id);
  select coalesce(sum(a.size),0) into room_used from public.assets a
    join public.entries e on e.id = a.entry_id where e.space_id = new.space_id;
  room_used := room_used + coalesce((select sum(size) from public.upload_intents
    where space_id = new.space_id and expires_at > now()),0);
  select coalesce(sum(a.size),0) into owner_used from public.assets a
    join public.entries e on e.id = a.entry_id join public.spaces s on s.id = e.space_id
    where s.creator_device_id = owner_id;
  owner_used := owner_used + coalesce((select sum(u.size) from public.upload_intents u
    join public.spaces s on s.id = u.space_id where s.creator_device_id = owner_id
    and u.expires_at > now()),0);
  if room_used + new.size > (case when pro then 1073741824 else 209715200 end)
    or owner_used + new.size > (case when pro then 1073741824 else 419430400 end) then
    raise exception 'Storage quota exceeded';
  end if;
  -- Key tombstones prevent retry/upsert from replacing previously published bytes.
  insert into woff_private.object_keys(path) values(new.path);
  new.expires_at := now() + interval '30 minutes';
  return new;
end;
$$;
create trigger enforce_upload_quota before insert on public.upload_intents
for each row execute function woff_private.guard_upload_reservation();

create or replace function public.reserve_upload_batch(p_space_id uuid,p_files jsonb)
returns boolean language plpgsql security definer set search_path = '' as $$
declare item jsonb; existing public.upload_intents;
begin
  if not woff_private.can_write_room(p_space_id) or jsonb_typeof(p_files) is distinct from 'array'
    or jsonb_array_length(p_files) not between 1 and 20 then return false; end if;
  if not public.consume_rate_limit('upload_batch',20,60) then return false; end if;
  for item in select value from jsonb_array_elements(p_files) loop
    if coalesce(item->>'path','') not like (p_space_id::text || '/%')
      or coalesce((item->>'size')::bigint,0) not between 1 and 52428800 then raise exception 'Invalid upload batch'; end if;
    select * into existing from public.upload_intents where path = item->>'path';
    if existing.path is not null then
      if existing.user_id <> auth.uid() or existing.space_id <> p_space_id
        or existing.size <> (item->>'size')::bigint or existing.expires_at <= now()
        then raise exception 'Invalid existing reservation'; end if;
    else
      insert into public.upload_intents(path,space_id,user_id,size,mime)
      values(item->>'path',p_space_id,auth.uid(),(item->>'size')::bigint,
        coalesce(nullif(item->>'mime',''),'application/octet-stream'));
    end if;
  end loop;
  return true;
exception when check_violation or unique_violation or invalid_text_representation or raise_exception then
  return false;
end;
$$;
create or replace function public.reserve_upload(p_space_id uuid,p_path text,p_size bigint,p_mime text)
returns boolean language sql security definer set search_path = '' as $$
  select public.reserve_upload_batch(p_space_id,jsonb_build_array(jsonb_build_object(
    'path',p_path,'size',p_size,'mime',p_mime)));
$$;
create function public.cancel_upload_reservations(p_space_id uuid,p_paths text[])
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if cardinality(p_paths) > 20 then raise exception 'Invalid batch'; end if;
  with removed as (delete from public.upload_intents where space_id = p_space_id
    and user_id = auth.uid() and path = any(p_paths) returning path)
  insert into public.deleted_storage_keys(bucket_key) select path from removed;
  get diagnostics removed = row_count;
  return removed;
end;
$$;
create function woff_private.validate_published_asset()
returns trigger language plpgsql security definer set search_path = '' as $$
declare room_id uuid; owner_id text; reservation public.upload_intents;
  stored_size bigint; stored_owner text;
begin
  if new.is_legacy then
    if auth.uid() is not null then raise exception 'Legacy assets are migration-only'; end if;
    return new;
  end if;
  select e.space_id,s.creator_device_id into room_id,owner_id
    from public.entries e join public.spaces s on s.id = e.space_id where e.id = new.entry_id;
  if not woff_private.can_write_entry(new.entry_id) then raise exception 'Asset not authorized'; end if;
  perform pg_advisory_xact_lock(hashtextextended(owner_id,604031));
  select * into reservation from public.upload_intents where path = new.bucket_key for update;
  if reservation.path is null or reservation.user_id <> auth.uid()
    or reservation.space_id <> room_id or reservation.expires_at <= now()
    or reservation.size <> new.size then raise exception 'Upload reservation missing or expired'; end if;
  select (o.metadata->>'size')::bigint,o.owner_id into stored_size,stored_owner
    from storage.objects o where o.bucket_id = 'files' and o.name = new.bucket_key;
  if stored_size is null or stored_size <> reservation.size or stored_size <> new.size
    or stored_owner is distinct from auth.uid()::text then
    raise exception 'Stored object size or ownership mismatch';
  end if;
  delete from public.upload_intents where path = new.bucket_key;
  return new;
end;
$$;
create trigger enforce_asset_storage_size before insert on public.assets
for each row execute function woff_private.validate_published_asset();

-- Storage completes uploads with a privileged connection. This trigger applies
-- actual-byte validation there too, independently of the caller's JWT or RLS.
-- Synthetic permission preflights have contentLength but no backend size.
create function woff_private.validate_completed_storage_object()
returns trigger language plpgsql security definer set search_path = '' as $$
declare reservation public.upload_intents; actual_size bigint;
begin
  if new.bucket_id <> 'files' then return new; end if;
  if tg_op = 'UPDATE' then
    if new.name <> old.name or new.bucket_id <> old.bucket_id then
      raise exception 'Object keys are immutable';
    end if;
  end if;
  if new.metadata->>'size' is null then return new; end if;
  actual_size := (new.metadata->>'size')::bigint;
  select * into reservation from public.upload_intents where path = new.name;
  if reservation.path is not null then
    if reservation.expires_at <= now() or actual_size <> reservation.size
      or new.owner_id is distinct from reservation.user_id::text
      or not woff_private.room_active(reservation.space_id) then
      raise exception 'Completed object differs from its active reservation';
    end if;
  elsif exists(select 1 from public.assets where bucket_key = new.name) then
    if exists(select 1 from public.assets where bucket_key = new.name and size <> actual_size) then
      raise exception 'Published object size is immutable';
    end if;
  elsif exists(select 1 from woff_private.object_keys where path = new.name) then
    raise exception 'Object key was already used or cancelled';
  end if;
  return new;
end;
$$;
create trigger enforce_completed_object_size before insert or update on storage.objects
for each row execute function woff_private.validate_completed_storage_object();

-- Browser Storage SELECT would also let clients mint arbitrary-duration signed
-- URLs. Signing is therefore server-only, after user-RLS asset/room validation.
-- TUS preflight uses INSERT; its HEAD implementation inspects the upload store.
-- Deletion/cancellation uses database queues and privileged Storage cleanup.

create function public.ensure_sender_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if not woff_private.is_verified_sender(auth.uid()) then
    raise exception 'A verified sender account is required';
  end if;
  insert into public.sender_entitlements(user_id) values(auth.uid()) on conflict do nothing;
  return jsonb_build_object('user_id',auth.uid(),'verified',true);
end;
$$;
create or replace function public.room_storage_used(p_space_id uuid)
returns bigint language plpgsql stable security definer set search_path = '' as $$
begin
  if not woff_private.can_read_room(p_space_id) then raise exception 'Active room membership required'; end if;
  return coalesce((select sum(a.size) from public.assets a join public.entries e on e.id = a.entry_id
    where e.space_id = p_space_id),0);
end;
$$;
create or replace function public.claim_legacy_space(p_slug text,p_legacy_device_id text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare room public.spaces;
begin
  if auth.uid() is null or not public.consume_rate_limit('claim_legacy',5,3600) then return false; end if;
  select * into room from public.spaces where slug = p_slug and creator_device_id = p_legacy_device_id
    and creator_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and not secure_invites for update;
  if room.id is null or not woff_private.room_active(room.id) then return false; end if;
  update public.spaces set creator_device_id = auth.uid()::text where id = room.id;
  update public.entries set created_by_device_id = auth.uid()::text
    where space_id = room.id and created_by_device_id = p_legacy_device_id;
  insert into public.space_members(space_id,user_id,display_name)
    values(room.id,auth.uid(),'Legacy owner') on conflict do nothing;
  return true;
end;
$$;
create function public.get_sender_account()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.sender_entitlements; pro boolean; used_bytes bigint;
  pending bigint; active_count integer;
begin
  if not woff_private.is_verified_sender(auth.uid()) then
    raise exception 'A verified sender account is required';
  end if;
  select * into ent from public.sender_entitlements where user_id = auth.uid();
  pro := woff_private.owner_is_pro(auth.uid()::text);
  select coalesce(sum(a.size),0) into used_bytes from public.assets a
    join public.entries e on e.id = a.entry_id join public.spaces s on s.id = e.space_id
    where s.creator_device_id = auth.uid()::text;
  select coalesce(sum(u.size),0) into pending from public.upload_intents u
    join public.spaces s on s.id = u.space_id where s.creator_device_id = auth.uid()::text
    and u.expires_at > now();
  select count(*) into active_count from public.spaces where creator_device_id = auth.uid()::text
    and retention_days > 2 and coalesce(expires_at,last_activity_at + interval '48 hours') > now();
  return jsonb_build_object('user_id',auth.uid(),'is_pro',pro,
    'plan',case when pro then 'pro' else 'free' end,'status',coalesce(ent.status,'free'),
    'customer_id',ent.customer_id,'subscription_id',ent.subscription_id,
    'billing_capacity_reserved',ent.billing_capacity_reserved,
    'paid_through',ent.pro_until,'grace_until',ent.grace_until,
    'storage_used_bytes',used_bytes,'reserved_bytes',pending,
    'storage_limit_bytes',case when pro then 1073741824 else 419430400 end,
    'active_room_count',active_count,'active_room_limit',case when pro then 10 else 0 end);
end;
$$;
create function public.get_sender_dashboard()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb; rooms jsonb; template jsonb;
begin
  result := public.get_sender_account();
  select coalesce(jsonb_agg(to_jsonb(s) - 'owner_recovery_hash' order by s.created_at desc),'[]'::jsonb)
    into rooms from public.spaces s where creator_device_id = auth.uid()::text;
  select t.template into template from woff_private.sender_templates t where user_id = auth.uid();
  return result || jsonb_build_object('rooms',rooms,'template',coalesce(template,'{}'::jsonb));
end;
$$;
create function public.save_sender_template(p_template jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare clean jsonb;
begin
  if not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required'; end if;
  if jsonb_typeof(p_template) is distinct from 'object' then raise exception 'Invalid template'; end if;
  if coalesce(p_template->>'delivery_mode','read_only') not in ('collaborative','read_only')
    or coalesce((p_template->>'retention_days')::integer,7) not in (7,30)
    or char_length(coalesce(p_template->>'name','')) > 120
    or char_length(coalesce(p_template->>'welcome_text','')) > 5000 then
    raise exception 'Invalid template';
  end if;
  clean := jsonb_build_object('name',coalesce(p_template->>'name',''),
    'welcome_text',coalesce(p_template->>'welcome_text',''),
    'delivery_mode',coalesce(p_template->>'delivery_mode','read_only'),
    'retention_days',coalesce((p_template->>'retention_days')::integer,7));
  insert into woff_private.sender_templates(user_id,template) values(auth.uid(),clean)
    on conflict(user_id) do update set template = excluded.template,updated_at = now();
  return clean;
end;
$$;

create function public.create_room_invitation(p_space_id uuid,p_can_write boolean default true,
  p_expires_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; raw_token text; grant_id uuid; deadline timestamptz;
begin
  if auth.uid() is null or not public.consume_rate_limit('create_invitation',30,60) then
    raise exception 'Invitation creation unavailable'; end if;
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text
    or not woff_private.room_active(p_space_id) then raise exception 'Room owner required'; end if;
  if not room.secure_invites then
    update public.spaces set secure_invites = true, access_version = access_version + 1,
      pairing_expires_at = null where id = room.id returning * into room;
  end if;
  deadline := least(coalesce(p_expires_at,room.expires_at),room.expires_at);
  if deadline is null or deadline <= now() then raise exception 'Invalid invitation expiry'; end if;
  raw_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.room_invitations(space_id,token_hash,can_write,access_version,expires_at)
    values(room.id,extensions.digest(raw_token,'sha256'),coalesce(p_can_write,false),room.access_version,deadline)
    returning id into grant_id;
  return jsonb_build_object('id',grant_id,'token',raw_token,'expires_at',deadline,'access_version',room.access_version);
end;
$$;
create function public.join_room_invitation(p_token text,p_display_name text)
returns public.spaces language plpgsql security definer set search_path = '' as $$
declare invitation public.room_invitations; room public.spaces;
begin
  if auth.uid() is null or not public.consume_rate_limit('join_invitation',30,60)
    or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  select * into invitation from public.room_invitations
    where token_hash = extensions.digest(p_token,'sha256') and revoked_at is null and expires_at > now();
  select * into room from public.spaces where id = invitation.space_id;
  if room.id is null or not woff_private.room_active(room.id)
    or room.access_version <> invitation.access_version then raise exception 'Invalid invitation'; end if;
  insert into public.space_members(space_id,user_id,display_name,invitation_id,access_version,can_write,grant_expires_at)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2 then 'Anonymous'
      else left(trim(p_display_name),40) end,invitation.id,room.access_version,
      invitation.can_write,invitation.expires_at)
    on conflict(space_id,user_id) do update set invitation_id = excluded.invitation_id,
      access_version = excluded.access_version,can_write = excluded.can_write,
      grant_expires_at = excluded.grant_expires_at;
  return room;
end;
$$;
create function public.revoke_room_invitation(p_invitation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update public.room_invitations i set revoked_at = now()
    from public.spaces s where s.id = i.space_id and i.id = p_invitation_id
    and s.creator_device_id = auth.uid()::text;
  return found;
end;
$$;
create function public.rotate_room_access(p_space_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  update public.spaces set secure_invites = true,access_version = access_version + 1,
    pairing_expires_at = null where id = p_space_id and creator_device_id = auth.uid()::text;
  if not found then raise exception 'Room owner required'; end if;
  return public.create_room_invitation(p_space_id,true,null);
end;
$$;
create function public.set_room_pairing(p_space_id uuid,p_minutes integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz;
begin
  if p_minutes is null or p_minutes not between 0 and 10 then raise exception 'Invalid pairing window'; end if;
  update public.spaces set pairing_expires_at = case when p_minutes = 0 then null
    else least(expires_at,now() + p_minutes * interval '1 minute') end
    where id = p_space_id and creator_device_id = auth.uid()::text
    and woff_private.room_active(id) returning pairing_expires_at into deadline;
  if not found then raise exception 'Room owner required'; end if;
  return deadline;
end;
$$;

create or replace function public.create_space(p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; candidate text; tries integer := 0; recovery_key text; invitation jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.consume_rate_limit('create_space',5,60) then raise exception 'Too many rooms created'; end if;
  loop
    tries := tries + 1;
    if tries > 30 then raise exception 'Unable to allocate a room code'; end if;
    candidate := public.random_room_code();
    begin
      recovery_key := upper(encode(extensions.gen_random_bytes(16),'hex'));
      insert into public.spaces(slug,creator_device_id,visibility,allow_public_post,is_pro,
        expires_at,owner_recovery_hash,secure_invites)
      values(candidate,auth.uid()::text,'unlisted',true,false,now() + interval '48 hours',
        extensions.digest(recovery_key,'sha256'),true) returning * into room;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  insert into public.space_members(space_id,user_id,display_name)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2
      then 'Anonymous' else left(trim(p_display_name),40) end);
  invitation := public.create_room_invitation(room.id,true,null);
  return jsonb_build_object('space',to_jsonb(room) - 'owner_recovery_hash','recovery_key',recovery_key,
    'invite_token',invitation->>'token','invitation_id',invitation->>'id');
end;
$$;
create or replace function public.join_space(p_slug text,p_display_name text)
returns public.spaces language plpgsql security definer set search_path = '' as $$
declare room public.spaces;
begin
  if auth.uid() is null or not public.consume_rate_limit('join_space',30,60)
    or p_slug !~ '^[0-9]{4}$' then raise exception 'Invalid room code'; end if;
  select * into room from public.spaces where slug = p_slug;
  if room.id is null or not woff_private.room_active(room.id) then raise exception 'Room not found or expired'; end if;
  if woff_private.can_read_room(room.id) then return room; end if;
  if room.secure_invites and coalesce(room.pairing_expires_at <= now(),true) then
    raise exception 'A room invitation is required';
  end if;
  insert into public.space_members(space_id,user_id,display_name,access_version,can_write,grant_expires_at)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2
      then 'Anonymous' else left(trim(p_display_name),40) end,room.access_version,
      room.delivery_mode = 'collaborative',case when room.secure_invites then room.expires_at else null end)
    on conflict(space_id,user_id) do update set invitation_id = null,access_version = excluded.access_version,
      can_write = excluded.can_write,grant_expires_at = excluded.grant_expires_at;
  return room;
end;
$$;
create or replace function public.open_space(p_slug text,p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; room_entries jsonb;
begin
  room := public.join_space(p_slug,p_display_name);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb) into room_entries
    from public.entries e where e.space_id = room.id and woff_private.can_read_entry(e.id);
  return jsonb_build_object('space',(to_jsonb(room) - 'owner_recovery_hash') ||
    jsonb_build_object('can_write',woff_private.can_write_room(room.id)),'entries',room_entries);
end;
$$;
create or replace function public.join_note(p_note_slug text,p_display_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare room_slug text;
begin
  select s.slug into room_slug from public.entries e join public.spaces s on s.id = e.space_id
    left join public.notes n on n.entry_id = e.id
    where (n.slug = p_note_slug or (e.text like 'NOTE:%' and split_part(e.text,':',2) = p_note_slug))
    and (e.expires_at is null or e.expires_at > now()) limit 1;
  if room_slug is null then return null; end if;
  perform public.join_space(room_slug,p_display_name);
  return room_slug;
end;
$$;
create or replace function public.open_note(p_note_slug text,p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  if public.join_note(p_note_slug,p_display_name) is null then return null; end if;
  select jsonb_build_object('id',n.id,'slug',n.slug,'title',n.title,
    'content_html',case when n.is_locked and n.created_by_user_id <> auth.uid() then '' else n.content_html end,
    'content_json',case when n.is_locked and n.created_by_user_id <> auth.uid() then null else n.content_json end,
    'public_code',n.public_code,'visibility',n.visibility,'font_family',n.font_family,
    'space_id',s.id,'space_slug',s.slug,'created_by_device_id',e.created_by_device_id,
    'created_at',n.created_at,'updated_at',n.updated_at,'is_locked',n.is_locked,
    'is_owner',n.created_by_user_id = auth.uid(),
    'can_edit',n.created_by_user_id = auth.uid() and woff_private.can_write_entry(e.id),'version',n.version)
    into result from public.notes n join public.entries e on e.id = n.entry_id
    join public.spaces s on s.id = e.space_id where n.slug = p_note_slug
    and woff_private.can_read_entry(e.id);
  return result;
end;
$$;

create function public.update_room_settings(p_space_id uuid,p_name text,p_welcome_text text,
  p_delivery_mode text,p_retention_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; active_count integer; invitation jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,604031));
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text
    or not woff_private.room_active(p_space_id) then raise exception 'Room owner required'; end if;
  if not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required'; end if;
  if p_name is null or char_length(p_name) > 120 or p_welcome_text is null
    or char_length(p_welcome_text) > 5000 or p_delivery_mode is null
    or p_delivery_mode not in ('collaborative','read_only') or p_retention_days is null
    or p_retention_days not in (7,30) then raise exception 'Invalid room settings'; end if;
  select count(*) into active_count from public.spaces where creator_device_id = auth.uid()::text
    and retention_days > 2 and woff_private.room_active(id) and id <> p_space_id;
  if active_count >= 10 then raise exception 'Active Pro room limit reached'; end if;
  update public.spaces set name = p_name,title = p_name,welcome_text = p_welcome_text,
    delivery_mode = p_delivery_mode,allow_public_post = p_delivery_mode = 'collaborative',
    retention_days = p_retention_days,is_pro = true,
    expires_at = case when room.retention_days = p_retention_days then room.expires_at
      else now() + p_retention_days * interval '1 day' end,
    secure_invites = true,
    access_version = case when room.secure_invites then access_version else access_version + 1 end,
    pairing_expires_at = null where id = room.id returning * into room;
  if not room.secure_invites then invitation := public.create_room_invitation(room.id,true,null); end if;
  return jsonb_build_object('space',to_jsonb(room) - 'owner_recovery_hash');
end;
$$;

create function public.set_note_privacy(p_slug text,p_is_locked boolean,p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare note public.notes;
begin
  if auth.uid() is null or p_is_locked is null then raise exception 'Invalid privacy request'; end if;
  if not public.consume_rate_limit('update_note',120,60) then raise exception 'Too many requests'; end if;
  select * into note from public.notes where slug = p_slug for update;
  if note.id is null or note.created_by_user_id <> auth.uid()
    or not woff_private.can_write_entry(note.entry_id) then raise exception 'Note not found or read-only'; end if;
  if p_expected_version is null or note.version <> p_expected_version then
    raise exception 'This note changed elsewhere. Reload before saving again.';
  end if;
  update public.notes set is_locked = p_is_locked,passcode_hash = null,
    version = version + 1,updated_at = now() where id = note.id returning * into note;
  update public.entries set meta = (coalesce(meta,'{}'::jsonb) - 'content' - 'content_json' - 'passcode')
    || jsonb_build_object('is_locked',p_is_locked)
    where id = note.entry_id;
  return jsonb_build_object('version',note.version,'updated_at',note.updated_at,'is_locked',note.is_locked);
end;
$$;

create function woff_private.transfer_room_authorship(p_space_id uuid,p_old_owner text,p_new_owner uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.entries set created_by_device_id = p_new_owner::text
    where space_id = p_space_id and created_by_device_id = p_old_owner;
  update public.notes n set created_by_user_id = p_new_owner
    from public.entries e where n.entry_id = e.id and e.space_id = p_space_id
    and n.created_by_user_id::text = p_old_owner;
  with removed as (delete from public.upload_intents where space_id = p_space_id
    and user_id::text = p_old_owner returning path)
  insert into public.deleted_storage_keys(bucket_key) select path from removed;
  delete from public.space_members where space_id = p_space_id and user_id::text = p_old_owner
    and user_id <> p_new_owner;
end;
$$;
create function public.recover_space_ownership(p_slug text,p_recovery_key text,p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; previous_owner text; next_key text;
begin
  if auth.uid() is null or not public.consume_rate_limit('recover_space',5,3600) then
    raise exception 'Recovery unavailable'; end if;
  select * into room from public.spaces where slug = p_slug for update;
  if room.id is null or not woff_private.room_active(room.id) or room.owner_recovery_hash is null
    or room.owner_recovery_hash is distinct from extensions.digest(upper(trim(p_recovery_key)),'sha256')
    then raise exception 'Invalid recovery key or expired room'; end if;
  previous_owner := room.creator_device_id;
  next_key := upper(encode(extensions.gen_random_bytes(16),'hex'));
  update public.spaces set creator_device_id = auth.uid()::text,
    owner_recovery_hash = extensions.digest(next_key,'sha256'),access_version = access_version + 1,
    secure_invites = true,pairing_expires_at = null where id = room.id returning * into room;
  perform woff_private.transfer_room_authorship(room.id,previous_owner,auth.uid());
  insert into public.space_members(space_id,user_id,display_name,access_version)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2
      then 'Anonymous' else left(trim(p_display_name),40) end,room.access_version)
    on conflict(space_id,user_id) do update set invitation_id = null,access_version = excluded.access_version,
      can_write = true,grant_expires_at = null;
  return jsonb_build_object('recovered',true,'recovery_key',next_key,'space',to_jsonb(room) - 'owner_recovery_hash');
end;
$$;
-- Compatibility only: new clients use the JSON RPC to retain the rotated key.
create or replace function public.recover_space(p_slug text,p_recovery_key text,p_display_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public.recover_space_ownership(p_slug,p_recovery_key,p_display_name);
  return true;
exception when raise_exception then return false;
end;
$$;
create function public.rotate_room_recovery_key(p_space_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare next_key text;
begin
  if auth.uid() is null or not public.consume_rate_limit('rotate_recovery',5,3600) then
    raise exception 'Recovery rotation unavailable'; end if;
  next_key := upper(encode(extensions.gen_random_bytes(16),'hex'));
  update public.spaces set owner_recovery_hash = extensions.digest(next_key,'sha256')
    where id = p_space_id and creator_device_id = auth.uid()::text and woff_private.room_active(id);
  if not found then raise exception 'Active room owner required'; end if;
  return jsonb_build_object('recovery_key',next_key);
end;
$$;
create function public.create_account_merge_ticket()
returns text language plpgsql security definer set search_path = '' as $$
declare raw_token text;
begin
  if auth.uid() is null or not public.consume_rate_limit('merge_ticket',5,3600) then
    raise exception 'Authentication required or too many attempts'; end if;
  raw_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into woff_private.account_merge_tickets(token_hash,source_user_id)
    values(extensions.digest(raw_token,'sha256'),auth.uid());
  return raw_token;
end;
$$;
create function public.redeem_account_merge_ticket(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ticket woff_private.account_merge_tickets; room public.spaces;
  transferred integer := 0;
begin
  if not woff_private.is_verified_sender(auth.uid()) or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'Verified target account and merge proof are required'; end if;
  select * into ticket from woff_private.account_merge_tickets
    where token_hash = extensions.digest(p_token,'sha256') for update;
  if ticket.source_user_id is null or ticket.source_user_id = auth.uid()
    or ticket.expires_at <= now() or ticket.consumed_at is not null then raise exception 'Invalid merge proof'; end if;
  -- Billing ownership is never transferred through a room/session recovery proof.
  if exists(select 1 from public.sender_entitlements where user_id = ticket.source_user_id
    and (customer_id is not null or subscription_id is not null)) then
    raise exception 'Sign in to the existing billing account instead'; end if;
  perform public.ensure_sender_account();
  perform pg_advisory_xact_lock(hashtextextended(least(ticket.source_user_id::text,auth.uid()::text),604031));
  perform pg_advisory_xact_lock(hashtextextended(greatest(ticket.source_user_id::text,auth.uid()::text),604031));
  for room in select * from public.spaces where creator_device_id = ticket.source_user_id::text for update loop
    update public.spaces set creator_device_id = auth.uid()::text,access_version = access_version + 1,
      secure_invites = true,pairing_expires_at = null,
      owner_recovery_hash = extensions.digest(encode(extensions.gen_random_bytes(32),'hex'),'sha256')
      where id = room.id;
    perform woff_private.transfer_room_authorship(room.id,ticket.source_user_id::text,auth.uid());
    insert into public.space_members(space_id,user_id,display_name,access_version)
      values(room.id,auth.uid(),'Sender',room.access_version + 1)
      on conflict(space_id,user_id) do update set invitation_id = null,access_version = excluded.access_version,
        can_write = true,grant_expires_at = null;
    transferred := transferred + 1;
  end loop;
  update woff_private.account_merge_tickets set consumed_at = now() where token_hash = ticket.token_hash;
  return jsonb_build_object('merged',true,'rooms_transferred',transferred);
end;
$$;

-- Existing RPC bodies still run their own authorization and pass through the
-- new write/asset triggers, so compatibility does not bypass these boundaries.
revoke all on all functions in schema woff_private from public, anon, authenticated;
grant execute on function woff_private.can_read_room(uuid),woff_private.can_write_room(uuid),
  woff_private.can_read_entry(uuid),woff_private.can_read_asset(uuid),woff_private.can_write_entry(uuid)
to authenticated;
do $$
declare signature regprocedure;
begin
  for signature in select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'ensure_sender_account','get_sender_account','get_sender_dashboard','save_sender_template',
      'create_room_invitation','join_room_invitation','revoke_room_invitation','rotate_room_access',
      'set_room_pairing','create_room_from_template','update_room_settings','set_note_privacy',
      'recover_space_ownership','rotate_room_recovery_key','create_account_merge_ticket','redeem_account_merge_ticket',
      'cancel_upload_reservations')
  loop
    execute format('revoke all on function %s from public, anon, authenticated',signature);
    execute format('grant execute on function %s to authenticated',signature);
  end loop;
end;
$$;

-- Billing admission/webhook SQL is appended here before COMMIT by the billing
-- implementation. No checkout is enabled by this migration's default settings.
create function public.create_room_from_template(p_device_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created jsonb; template jsonb; settings jsonb;
begin
  if not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required'; end if;
  select t.template into template from woff_private.sender_templates t where user_id = auth.uid();
  template := coalesce(template,'{}'::jsonb);
  created := public.create_space(p_device_id);
  settings := public.update_room_settings((created->'space'->>'id')::uuid,
    coalesce(template->>'name','Project handoff'),coalesce(template->>'welcome_text',''),
    coalesce(template->>'delivery_mode','read_only'),coalesce((template->>'retention_days')::integer,7));
  -- The initial invitation must share the final bounded room deadline.
  update public.room_invitations set expires_at = (settings->'space'->>'expires_at')::timestamptz
    where id = (created->>'invitation_id')::uuid;
  return created || settings;
end;
$$;
revoke all on function public.create_room_from_template(text) from public, anon, authenticated;
grant execute on function public.create_room_from_template(text) to authenticated;
create function woff_private.increment_product_metric(p_event text)
returns void language sql security definer set search_path = '' as $$
  insert into woff_private.product_daily_metrics(day,event,count)
  values((now() at time zone 'UTC')::date,p_event,1)
  on conflict(day,event) do update set count = woff_private.product_daily_metrics.count + 1;
$$;
create function woff_private.count_published_content()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform woff_private.increment_product_metric(case tg_table_name
    when 'spaces' then 'room_created' when 'assets' then 'file_published' else 'note_created' end);
  return new;
end;
$$;
create trigger count_room_created after insert on public.spaces
for each row execute function woff_private.count_published_content();
create trigger count_file_published after insert on public.assets
for each row execute function woff_private.count_published_content();
create trigger count_note_created after insert on public.notes
for each row execute function woff_private.count_published_content();
create function public.record_room_event(p_space_id uuid,p_event text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_event is null or p_event not in ('share_initiated','download_initiated','upload_failed')
    or not woff_private.can_read_room(p_space_id) then return false; end if;
  if not public.consume_rate_limit('event_' || p_event,30,60) then return false; end if;
  perform woff_private.increment_product_metric(p_event);
  return true;
end;
$$;
revoke all on function woff_private.increment_product_metric(text),woff_private.count_published_content()
from public,anon,authenticated;
revoke all on function public.record_room_event(uuid,text) from public,anon,authenticated;
grant execute on function public.record_room_event(uuid,text) to authenticated;
-- Incorporated into the launch migration by the schema owner. No remote writes.
create table woff_private.pilot_capacity (
  id integer primary key check (id = 1),
  checkout_enabled boolean not null default false,
  capacity_bytes bigint not null default 0 check (capacity_bytes >= 0),
  max_paid_accounts integer not null default 5 check (max_paid_accounts between 1 and 5),
  billing_test_mode boolean not null default false
);
insert into woff_private.pilot_capacity(id) values(1);
create table woff_private.sender_checkout_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  consumed_at timestamptz,
  checkout_url text
);
create table woff_private.billing_events (
  event_key text primary key check (event_key ~ '^[a-f0-9]{64}$'),
  event_name text not null,
  subscription_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  disposition text not null default 'received',
  payload jsonb not null default '{}'::jsonb
);
alter table woff_private.pilot_capacity enable row level security;
alter table woff_private.sender_checkout_reservations enable row level security;
alter table woff_private.billing_events enable row level security;
revoke all on woff_private.pilot_capacity, woff_private.sender_checkout_reservations, woff_private.billing_events from public, anon, authenticated;
grant all on woff_private.pilot_capacity, woff_private.sender_checkout_reservations, woff_private.billing_events to service_role;

-- One lock covers checkout admission and upload reservations. Expired physical
-- objects remain charged until cleanup actually removes them.
create function woff_private.committed_storage_bytes()
returns bigint language plpgsql security definer set search_path = '' as $$
declare total_bytes bigint; reserved_bytes bigint;
begin
  if exists(select 1 from storage.objects where bucket_id = 'files'
    and coalesce(metadata->>'size','') !~ '^[0-9]+$') then
    raise exception 'Storage accounting requires complete object sizes';
  end if;
  select coalesce(sum((metadata->>'size')::bigint),0) into total_bytes
    from storage.objects where bucket_id = 'files';
  total_bytes := total_bytes + coalesce((select sum(u.size) from public.upload_intents u
    where not exists(select 1 from storage.objects o where o.bucket_id='files' and o.name=u.path)),0);
  with paid as (
    select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
    union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
  ), ownership as (
    select p.user_id, coalesce((select sum((o.metadata->>'size')::bigint)
      from storage.objects o join public.spaces s on s.id::text=split_part(o.name,'/',1)
      where o.bucket_id='files' and s.creator_device_id=p.user_id::text),0)
      + coalesce((select sum(u.size) from public.upload_intents u join public.spaces s on s.id=u.space_id
        where s.creator_device_id=p.user_id::text and not exists(select 1 from storage.objects o
          where o.bucket_id='files' and o.name=u.path)),0) as owned_bytes
    from paid p
  ) select coalesce(sum(greatest(1073741824::bigint-owned_bytes,0)),0) into reserved_bytes from ownership;
  return total_bytes + reserved_bytes;
end $$;

create function woff_private.upload_capacity_available(p_owner text,p_bytes bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare capacity bigint; paid boolean;
begin
  perform pg_advisory_xact_lock(7814462001);
  select capacity_bytes into capacity from woff_private.pilot_capacity where id=1;
  if coalesce(capacity,0)=0 then return true; end if;
  paid := exists(select 1 from public.sender_entitlements where user_id::text=p_owner and billing_capacity_reserved)
    or woff_private.owner_is_pro(p_owner) or exists(select 1 from woff_private.sender_checkout_reservations
    where user_id::text=p_owner and consumed_at is null and expires_at>now());
  return woff_private.committed_storage_bytes() + case when paid then 0 else greatest(p_bytes,0) end <= capacity;
end $$;

create function public.reserve_sender_checkout()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare cfg woff_private.pilot_capacity; ent public.sender_entitlements; reservation woff_private.sender_checkout_reservations; seats integer;
begin
  if not woff_private.is_verified_sender(auth.uid()) then raise exception 'Verify your email'; end if;
  perform pg_advisory_xact_lock(7814462001);
  select * into cfg from woff_private.pilot_capacity where id=1;
  if not cfg.checkout_enabled or cfg.capacity_bytes=0 then raise exception 'Checkout capacity is not ready'; end if;
  select * into ent from public.sender_entitlements where user_id=auth.uid() for update;
  if not found then raise exception 'Sender account required'; end if;
  if ent.billing_capacity_reserved or greatest(ent.pro_until,ent.grace_until)>now()
    or (ent.subscription_id is not null and ent.status not in ('expired','unpaid','refunded')) then raise exception 'Manage your existing subscription'; end if;
  select * into reservation from woff_private.sender_checkout_reservations where user_id=auth.uid();
  if found and reservation.consumed_at is null and reservation.expires_at>now() then
    if reservation.checkout_url is null then raise exception 'Checkout is already being prepared'; end if;
    return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at,'checkout_url',reservation.checkout_url);
  end if;
  select count(*) into seats from (
    select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
    union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
  ) cohort;
  if seats>=cfg.max_paid_accounts or woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes then raise exception 'Pro pilot is full'; end if;
  insert into woff_private.sender_checkout_reservations(user_id) values(auth.uid())
    on conflict(user_id) do update set id=gen_random_uuid(),expires_at=now()+interval '30 minutes',consumed_at=null,checkout_url=null
    returning * into reservation;
  return jsonb_build_object('reservation_id',reservation.id,'expires_at',reservation.expires_at);
end $$;

create function public.record_sender_checkout(p_user_id uuid,p_reservation_id uuid,p_checkout_url text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_checkout_url is null or char_length(p_checkout_url)>4096
    or p_checkout_url !~ '^https://([a-zA-Z0-9-]+\.)*lemonsqueezy\.com/' then raise exception 'Invalid checkout URL'; end if;
  update woff_private.sender_checkout_reservations set checkout_url=p_checkout_url
    where id=p_reservation_id and user_id=p_user_id and consumed_at is null and expires_at>now() and checkout_url is null;
  return found;
end $$;

create function public.release_sender_checkout(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not woff_private.is_verified_sender(auth.uid()) then raise exception 'Verify your email'; end if;
  -- Admission leases cannot be released by browsers: an already-issued provider
  -- checkout remains payable until its deadline. This RPC is deliberately inert.
  return false;
end $$;

create function public.process_billing_event(
  p_event_key text,p_event_name text,p_occurred_at timestamptz,p_user_id uuid,
  p_customer_id text,p_subscription_id text,p_status text,p_pro_until timestamptz,
  p_test_mode boolean,p_payload jsonb,p_reservation_id uuid default null,p_capacity_reserved boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare ent public.sender_entitlements; cfg woff_private.pilot_capacity; reservation woff_private.sender_checkout_reservations; next_until timestamptz; next_grace timestamptz; seats integer;
begin
  -- EXECUTE is granted only to service_role below; no browser role may call it.
  if not woff_private.is_verified_sender(p_user_id) then raise exception 'Verified sender required'; end if;
  if p_event_key is null or p_event_key !~ '^[a-f0-9]{64}$'
    or p_customer_id is null or p_customer_id !~ '^[0-9]+$'
    or p_subscription_id is null or p_subscription_id !~ '^[0-9]+$'
    or p_status is null or p_status not in ('active','on_trial','paused','past_due','unpaid','cancelled','expired','refunded')
    or p_event_name is null or p_event_name not in ('subscription_created','subscription_updated','subscription_cancelled',
      'subscription_resumed','subscription_expired','subscription_paused','subscription_unpaused',
      'subscription_payment_success','subscription_payment_failed','subscription_payment_recovered','subscription_payment_refunded')
    or p_test_mode is null or p_payload is null or p_capacity_reserved is null
    or p_occurred_at is null or p_occurred_at>now()+interval '5 minutes'
    or pg_column_size(p_payload)>8192 then raise exception 'Invalid billing event'; end if;
  perform pg_advisory_xact_lock(7814462001);
  select * into cfg from woff_private.pilot_capacity where id=1;
  if p_test_mode is distinct from cfg.billing_test_mode then raise exception 'Billing mode mismatch'; end if;
  insert into woff_private.billing_events(event_key,event_name,subscription_id,occurred_at,payload)
    values(p_event_key,p_event_name,p_subscription_id,p_occurred_at,p_payload) on conflict do nothing;
  if not found then return jsonb_build_object('processed',false,'ignored','duplicate'); end if;
  select * into ent from public.sender_entitlements where user_id=p_user_id for update;
  if not found then raise exception 'Sender account required'; end if;
  if ent.subscription_id is distinct from p_subscription_id then
    if ent.billing_capacity_reserved or greatest(ent.pro_until,ent.grace_until)>now() then raise exception 'Existing paid subscription'; end if;
    select * into reservation from woff_private.sender_checkout_reservations
      where id=p_reservation_id and user_id=p_user_id and consumed_at is null for update;
    if not found then raise exception 'Valid checkout reservation required'; end if;
    if reservation.expires_at<now() then
      -- A payment made just before checkout expiry can be delivered late. Admit
      -- it only if full allowance and a pilot seat can still be honored.
      select count(*) into seats from (
        select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
        union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
      ) cohort;
      if seats>=cfg.max_paid_accounts or cfg.capacity_bytes=0
        or woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes then
        raise exception 'Late payment requires capacity review';
      end if;
    end if;
    update woff_private.sender_checkout_reservations set consumed_at=now() where id=reservation.id;
  elsif ent.customer_id is distinct from p_customer_id then raise exception 'Customer mismatch';
  end if;
  if ent.subscription_id=p_subscription_id and ent.billing_updated_at>=p_occurred_at then
    update woff_private.billing_events set disposition='stale' where event_key=p_event_key;
    return jsonb_build_object('processed',false,'ignored','stale');
  end if;
  if ent.subscription_id=p_subscription_id and not ent.billing_capacity_reserved
    and coalesce(greatest(ent.pro_until,ent.grace_until)>now(),false)=false
    and (p_capacity_reserved or (p_status in ('active','cancelled') and p_pro_until>now())) then
    -- A provider can reactivate an ended subscription without a new Woff
    -- checkout. Its former seat may now belong to somebody else.
    select count(*) into seats from (
      select user_id from public.sender_entitlements where billing_capacity_reserved or (plan='pro' and greatest(pro_until,grace_until)>now())
      union select user_id from woff_private.sender_checkout_reservations where consumed_at is null and expires_at>now()
    ) cohort where user_id<>p_user_id;
    if seats>=cfg.max_paid_accounts or cfg.capacity_bytes=0
      or (not exists(select 1 from woff_private.sender_checkout_reservations where user_id=p_user_id and consumed_at is null and expires_at>now())
        and woff_private.committed_storage_bytes()+1073741824>cfg.capacity_bytes) then
      raise exception 'Reactivated payment requires capacity review';
    end if;
  end if;
  next_until := ent.pro_until;
  next_grace := null;
  if p_status in ('active','cancelled') then
    if p_pro_until is null or p_pro_until>now()+interval '40 days' then raise exception 'Monthly paid deadline required'; end if;
    next_until := p_pro_until;
  elsif p_status='past_due' then
    -- A failure never advances paid-through to the next retry. Three days of
    -- grace are anchored to the last paid period, never refreshed by retries.
    if ent.status in ('active','cancelled','past_due') then
      next_grace := coalesce(ent.grace_until,ent.pro_until+interval '3 days');
    end if;
  elsif p_status in ('unpaid','expired','refunded','on_trial','paused') then
    next_until := least(coalesce(ent.pro_until,now()),now());
  end if;
  update public.sender_entitlements set plan=case when greatest(next_until,next_grace)>now() then 'pro' else 'free' end,
    status=p_status,pro_until=next_until,grace_until=next_grace,customer_id=p_customer_id,
    subscription_id=p_subscription_id,billing_updated_at=p_occurred_at,billing_capacity_reserved=p_capacity_reserved where user_id=p_user_id;
  update woff_private.billing_events set disposition='processed' where event_key=p_event_key;
  return jsonb_build_object('processed',true,'is_pro',coalesce(greatest(next_until,next_grace)>now(),false));
end $$;

revoke all on function woff_private.committed_storage_bytes(),woff_private.upload_capacity_available(text,bigint) from public,anon,authenticated;
revoke all on function public.reserve_sender_checkout(),public.release_sender_checkout(uuid) from public,anon,authenticated;
grant execute on function public.reserve_sender_checkout(),public.release_sender_checkout(uuid) to authenticated;
revoke all on function public.record_sender_checkout(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.record_sender_checkout(uuid,uuid,text) to service_role;
revoke all on function public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean) from public,anon,authenticated;
grant execute on function public.process_billing_event(text,text,timestamptz,uuid,text,text,text,timestamptz,boolean,jsonb,uuid,boolean) to service_role;

commit;
