-- New rooms stay open until their owner chooses a deadline or closes the code.
-- Historical rooms retain their existing deadlines and admission settings.
begin;

alter table public.spaces
  add column code_enabled boolean not null default true,
  add column expiry_mode text not null default 'none'
    check (expiry_mode in ('none','fixed','inactivity')),
  alter column expires_at drop default;

update public.spaces
set code_enabled = not secure_invites or coalesce(pairing_expires_at > now(),false),
  expiry_mode = case when retention_days = 2 then 'inactivity' else 'fixed' end,
  expires_at = coalesce(expires_at,last_activity_at + interval '48 hours');

-- NULL is an invitation without a separate deadline. Room expiry, revocation,
-- and the room's access version still govern every read and write.
alter table public.room_invitations
  alter column expires_at drop not null,
  add column uses_room_expiry boolean not null default false;
-- Older callers did not record whether an invitation used its own deadline.
-- Only an exact room-deadline match is safe to identify as room-bound.
update public.room_invitations i set uses_room_expiry = true
  from public.spaces s where s.id = i.space_id
  and i.expires_at is not distinct from s.expires_at;

-- A retired code stays reserved while its room exists, so stale room URLs
-- cannot accidentally become an entrance to someone else's new room.
create table woff_private.room_code_history (
  slug text primary key check (slug ~ '^[0-9]{4}$'),
  space_id uuid not null references public.spaces(id) on delete cascade
);
create index on woff_private.room_code_history(space_id);
alter table woff_private.room_code_history enable row level security;
revoke all on woff_private.room_code_history from public,anon,authenticated;
insert into woff_private.room_code_history(slug,space_id)
  select slug,id from public.spaces where slug ~ '^[0-9]{4}$';

create or replace function woff_private.room_active(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.spaces s where s.id = p_space_id
    and (s.expires_at is null or s.expires_at > now()));
$$;
create or replace function woff_private.can_read_room(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.spaces s where s.id = p_space_id
    and (s.expires_at is null or s.expires_at > now())
    and (s.creator_device_id = auth.uid()::text or exists (
      select 1 from public.space_members m
      left join public.room_invitations i on i.id = m.invitation_id
      where m.space_id = s.id and m.user_id = auth.uid()
      and m.access_version = s.access_version
      and (m.grant_expires_at is null or m.grant_expires_at > now())
      and (m.invitation_id is null or (i.revoked_at is null
        and (i.expires_at is null or i.expires_at > now())
        and i.access_version = s.access_version))
    )));
$$;

create or replace function public.touch_space_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.spaces set last_activity_at = now(),
    expires_at = case when expiry_mode = 'inactivity' then now() + interval '48 hours' else expires_at end
  where id = new.space_id and (expires_at is null or expires_at > now());
  return new;
end;
$$;
create or replace function public.touch_note_space_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.spaces s set last_activity_at = now(),
    expires_at = case when s.expiry_mode = 'inactivity' then now() + interval '48 hours' else s.expires_at end
  from public.entries e where e.id = new.entry_id and s.id = e.space_id
    and (s.expires_at is null or s.expires_at > now());
  return new;
end;
$$;
create or replace function public.cleanup_expired_spaces()
returns integer language plpgsql security definer set search_path = '' as $$
declare removed integer;
begin
  with deleted as (delete from public.spaces
    where expires_at is not null and expires_at <= now() returning id)
  select count(*) into removed from deleted;
  return removed;
end;
$$;

create or replace function public.create_room_invitation(p_space_id uuid,p_can_write boolean default true,
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
    update public.spaces set secure_invites = true,access_version = access_version + 1
      where id = room.id returning * into room;
  end if;
  if p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at <= now())
    then raise exception 'Invalid invitation expiry'; end if;
  deadline := coalesce(p_expires_at,room.expires_at);
  raw_token := encode(extensions.gen_random_bytes(32),'hex');
  insert into public.room_invitations(space_id,token_hash,can_write,access_version,expires_at,uses_room_expiry)
    values(room.id,extensions.digest(raw_token,'sha256'),coalesce(p_can_write,false),room.access_version,
      deadline,p_expires_at is null)
    returning id into grant_id;
  return jsonb_build_object('id',grant_id,'token',raw_token,'expires_at',deadline,'access_version',room.access_version);
end;
$$;
create or replace function public.join_room_invitation(p_token text,p_display_name text)
returns public.spaces language plpgsql security definer set search_path = '' as $$
declare invitation public.room_invitations; room public.spaces;
begin
  if auth.uid() is null or not public.consume_rate_limit('join_invitation',30,60)
    or p_token !~ '^[0-9a-f]{64}$' then raise exception 'Invalid invitation'; end if;
  select * into invitation from public.room_invitations
    where token_hash = extensions.digest(p_token,'sha256') and revoked_at is null
    and (expires_at is null or expires_at > now());
  select * into room from public.spaces where id = invitation.space_id for share;
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
create or replace function public.rotate_room_access(p_space_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Room owner required'; end if;
  update public.spaces set secure_invites = true,access_version = access_version + 1,
    code_enabled = false,pairing_expires_at = null
    where id = p_space_id and creator_device_id = auth.uid()::text
    and (expires_at is null or expires_at > now());
  if not found then raise exception 'Room owner required'; end if;
  return public.create_room_invitation(p_space_id,true,null);
end;
$$;

-- Keep old clients functional; the new UI uses an explicit open/closed control.
create or replace function public.set_room_pairing(p_space_id uuid,p_minutes integer)
returns timestamptz language plpgsql security definer set search_path = '' as $$
declare deadline timestamptz;
begin
  if auth.uid() is null or p_minutes is null or p_minutes not between 0 and 10 then
    raise exception 'Invalid pairing window'; end if;
  if not public.consume_rate_limit('room_access',30,60) then raise exception 'Too many room changes'; end if;
  update public.spaces set code_enabled = p_minutes > 0,
    pairing_expires_at = case when p_minutes = 0 then null
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
        expires_at,expiry_mode,code_enabled,owner_recovery_hash,secure_invites)
      values(candidate,auth.uid()::text,'unlisted',true,false,null,'none',true,
        extensions.digest(recovery_key,'sha256'),true) returning * into room;
      insert into woff_private.room_code_history(slug,space_id) values(candidate,room.id);
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
  select * into room from public.spaces where slug = p_slug for share;
  if room.id is null or not woff_private.room_active(room.id) then raise exception 'Room not found or expired'; end if;
  if woff_private.can_read_room(room.id) then return room; end if;
  if not room.code_enabled or (room.pairing_expires_at is not null and room.pairing_expires_at <= now()) then
    raise exception 'The room code is closed';
  end if;
  insert into public.space_members(space_id,user_id,display_name,access_version,can_write,grant_expires_at)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2
      then 'Anonymous' else left(trim(p_display_name),40) end,room.access_version,
      room.delivery_mode = 'collaborative',null)
    on conflict(space_id,user_id) do update set invitation_id = null,access_version = excluded.access_version,
      can_write = excluded.can_write,grant_expires_at = excluded.grant_expires_at;
  return room;
end;
$$;

create function public.set_room_access(p_space_id uuid,p_code_enabled boolean,p_expires_at timestamptz,
  p_update_expiry boolean default true)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces;
begin
  if auth.uid() is null or p_code_enabled is null or p_update_expiry is null
    then raise exception 'Room owner required'; end if;
  if not public.consume_rate_limit('room_access',30,60) then raise exception 'Too many room changes'; end if;
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text or not woff_private.room_active(p_space_id)
    then raise exception 'Room owner required'; end if;
  if p_update_expiry and p_expires_at is not null and (not isfinite(p_expires_at) or p_expires_at <= now())
    then raise exception 'Choose a future time limit'; end if;
  update public.spaces set code_enabled = p_code_enabled,pairing_expires_at = null,
    expires_at = case when p_update_expiry then p_expires_at else expires_at end,
    expiry_mode = case when not p_update_expiry then expiry_mode
      when p_expires_at is null then 'none' else 'fixed' end
    where id = room.id returning * into room;
  if p_update_expiry then
    update public.room_invitations set expires_at = p_expires_at
      where space_id = room.id and uses_room_expiry and revoked_at is null;
    update public.space_members m set grant_expires_at = p_expires_at
      from public.room_invitations i where m.invitation_id = i.id and i.space_id = room.id
      and i.uses_room_expiry and i.revoked_at is null;
  end if;
  return (to_jsonb(room) - 'owner_recovery_hash') || jsonb_build_object('can_write',true);
end;
$$;
create function public.rotate_room_code(p_space_id uuid,p_slug text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; candidate text; tries integer := 0;
begin
  if auth.uid() is null then raise exception 'Room owner required'; end if;
  if p_slug is not null and p_slug !~ '^[0-9]{4}$' then raise exception 'Use a four-digit room code'; end if;
  if not public.consume_rate_limit('room_code',10,3600) then raise exception 'Too many code changes'; end if;
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text or not woff_private.room_active(p_space_id)
    then raise exception 'Room owner required'; end if;
  if p_slug = room.slug then return (to_jsonb(room) - 'owner_recovery_hash') || jsonb_build_object('can_write',true); end if;
  loop
    tries := tries + 1;
    if tries > 30 then raise exception 'Unable to allocate a room code'; end if;
    candidate := coalesce(p_slug,public.random_room_code());
    if candidate = room.slug then continue; end if;
    begin
      insert into woff_private.room_code_history(slug,space_id) values(candidate,room.id)
        on conflict(slug) do nothing;
      if exists(select 1 from woff_private.room_code_history where slug = candidate and space_id <> room.id)
        then raise unique_violation; end if;
      update public.spaces set slug = candidate where id = room.id returning * into room;
      exit;
    exception when unique_violation then
      if p_slug is not null then raise exception 'That room code is already in use'; end if;
    end;
  end loop;
  return (to_jsonb(room) - 'owner_recovery_hash') || jsonb_build_object('can_write',true);
end;
$$;

revoke all on function public.set_room_access(uuid,boolean,timestamptz,boolean),public.rotate_room_code(uuid,text)
  from public,anon,authenticated;
grant execute on function public.set_room_access(uuid,boolean,timestamptz,boolean),public.rotate_room_code(uuid,text)
  to authenticated;

-- The existing privileges on replaced functions remain restricted. New public
-- RPCs validate auth.uid(), ownership, active lifetime and server rate limits.

create or replace function public.update_room_settings(p_space_id uuid,p_name text,p_welcome_text text,
  p_delivery_mode text,p_retention_days integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; active_count integer;
begin
  if auth.uid() is null then raise exception 'Room owner required'; end if;
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
    and is_pro and woff_private.room_active(id) and id <> p_space_id;
  if active_count >= 10 then raise exception 'Active Pro room limit reached'; end if;
  -- Handoff presentation changes must not silently replace the owner's timer
  -- or their open/closed code choice. Time limits have a separate owner RPC.
  update public.spaces set name = p_name,title = p_name,welcome_text = p_welcome_text,
    delivery_mode = p_delivery_mode,allow_public_post = p_delivery_mode = 'collaborative',
    retention_days = p_retention_days,is_pro = true
    where id = room.id returning * into room;
  return jsonb_build_object('space',to_jsonb(room) - 'owner_recovery_hash');
end;
$$;

create or replace function public.create_room_from_template(p_device_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare created jsonb; settings jsonb; template jsonb; days integer; room_id uuid; room public.spaces;
begin
  if not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required'; end if;
  select t.template into template from woff_private.sender_templates t where t.user_id = auth.uid();
  created := public.create_space(p_device_id);
  room_id := (created->'space'->>'id')::uuid;
  days := coalesce((template->>'retention_days')::integer,7);
  settings := public.update_room_settings(room_id,coalesce(template->>'name',''),
    coalesce(template->>'welcome_text',''),coalesce(template->>'delivery_mode','read_only'),days);
  update public.spaces set expires_at = now() + days * interval '1 day',expiry_mode = 'fixed'
    where id = room_id returning * into room;
  update public.room_invitations set expires_at = room.expires_at
    where space_id = room.id and uses_room_expiry;
  return created || jsonb_build_object('space',to_jsonb(room) - 'owner_recovery_hash');
end;
$$;

create or replace function public.consume_rate_limit(p_action text,p_limit integer,p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare server_limit integer; server_window integer; allowed boolean;
begin
  if auth.uid() is null then return false; end if;
  server_limit := case p_action
    when 'create_space' then 5 when 'recover_space' then 5 when 'claim_legacy' then 5
    when 'room_access' then 30 when 'room_code' then 10 when 'merge_ticket' then 5 when 'rotate_recovery' then 5 when 'join_space' then 30 when 'join_note' then 60
    when 'join_invitation' then 30 when 'create_invitation' then 30 when 'upload_intent' then 60 when 'upload_batch' then 20
    when 'create_file_entry' then 30 when 'create_extension_file_entry' then 30
    when 'create_note' then 10 when 'create_entry' then 60 when 'update_entry' then 60
    when 'update_note' then 120 when 'report_entry' then 10
    when 'event_share_initiated' then 30 when 'event_download_initiated' then 30
    when 'event_upload_failed' then 30 else null end;
  if server_limit is null then return false; end if;
  server_window := case when p_action in ('recover_space','claim_legacy','merge_ticket','rotate_recovery','report_entry','room_code')
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

create or replace function public.get_sender_account()
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
    and is_pro and (expires_at is null or expires_at > now());
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

create or replace function public.recover_space_ownership(p_slug text,p_recovery_key text,p_display_name text)
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
    secure_invites = true,code_enabled = false,pairing_expires_at = null where id = room.id returning * into room;
  perform woff_private.transfer_room_authorship(room.id,previous_owner,auth.uid());
  insert into public.space_members(space_id,user_id,display_name,access_version)
    values(room.id,auth.uid(),case when char_length(trim(coalesce(p_display_name,''))) < 2
      then 'Anonymous' else left(trim(p_display_name),40) end,room.access_version)
    on conflict(space_id,user_id) do update set invitation_id = null,access_version = excluded.access_version,
      can_write = true,grant_expires_at = null;
  return jsonb_build_object('recovered',true,'recovery_key',next_key,'space',to_jsonb(room) - 'owner_recovery_hash');
end;
$$;

create or replace function public.redeem_account_merge_ticket(p_token text)
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
      secure_invites = true,code_enabled = false,pairing_expires_at = null,
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

do $$
begin
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'spaces') then
    alter publication supabase_realtime add table public.spaces;
  end if;
end;
$$;

commit;
