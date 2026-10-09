-- Pro owners can name rooms and choose readable URLs independently of delivery
-- settings or time limits. Retired URLs remain reserved until their room is gone.
begin;

-- Keep this policy in sync with lib/room-slug.ts. Numeric Free codes retain their
-- existing format; custom URLs cannot shadow an application route.
create function woff_private.valid_room_slug(p_slug text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(p_slug ~ '^[0-9]{4}$' or (
    char_length(p_slug) between 3 and 40
    and p_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and p_slug ~ '[a-z]'
    and p_slug <> all(array[
      'about','account','admin','api','auth','billing','blog','checkout','contact',
      'dashboard','for-freelancers','help','legal','login','logout','n','new',
      'online-notepad','online-notepad-with-shareable-link','pricing','privacy',
      'recover','s','settings','share-code-snippets-online',
      'share-notes-online-without-login','share-text-between-devices',
      'sign-in','sign-up','signin','signup','status','support','terms','user',
      'users','woff','www'
    ]::text[])
  ),false);
$$;
revoke all on function woff_private.valid_room_slug(text) from public,anon,authenticated;

alter table woff_private.room_code_history drop constraint room_code_history_slug_check;
alter table woff_private.room_code_history add constraint room_code_history_slug_check
  check (woff_private.valid_room_slug(slug));

-- This is a presentation hint only. Every mutation checks the current server
-- entitlement again, so a stale client cannot authorize a paid change.
create function woff_private.room_payload(p_room public.spaces)
returns jsonb language sql stable security definer set search_path = '' as $$
  select (to_jsonb(p_room) - 'owner_recovery_hash') || jsonb_build_object(
    'can_write',woff_private.can_write_room(p_room.id),
    'can_customize_identity',coalesce(p_room.creator_device_id = auth.uid()::text
      and woff_private.room_active(p_room.id)
      and woff_private.owner_is_pro(auth.uid()::text),false));
$$;
revoke all on function woff_private.room_payload(public.spaces) from public,anon,authenticated;

create or replace function public.rotate_room_code(p_space_id uuid,p_slug text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; candidate text; requested text := lower(trim(p_slug)); tries integer := 0;
begin
  if auth.uid() is null then raise exception 'Room owner required'; end if;
  -- Use the same owner lock as handoff settings. Identity changes can call this
  -- RPC while holding a room row; all owner URL changes must share lock order.
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,604031));
  if p_slug is not null and not woff_private.valid_room_slug(requested) then
    raise exception 'Use a four-digit room code or a valid custom room URL'; end if;
  if not public.consume_rate_limit('room_code',10,3600) then raise exception 'Too many code changes'; end if;
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text or not woff_private.room_active(p_space_id)
    then raise exception 'Room owner required'; end if;
  -- Keeping an existing URL does not take it away from an expired subscriber.
  if requested = room.slug then return woff_private.room_payload(room); end if;
  if requested is not null and requested !~ '^[0-9]{4}$'
    and not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required for custom room URLs'; end if;
  loop
    tries := tries + 1;
    if tries > 30 then raise exception 'Unable to allocate a room code'; end if;
    candidate := coalesce(requested,public.random_room_code());
    if candidate = room.slug then continue; end if;
    begin
      -- The primary key serializes all claims to the same URL. The FK keeps
      -- history tied to this room, including after several code/name changes.
      insert into woff_private.room_code_history(slug,space_id) values(candidate,room.id)
        on conflict(slug) do nothing;
      if exists(select 1 from woff_private.room_code_history where slug = candidate and space_id <> room.id)
        then raise unique_violation; end if;
      update public.spaces set slug = candidate where id = room.id returning * into room;
      exit;
    exception when unique_violation then
      if requested is not null then raise exception 'That room code or URL is already in use'; end if;
    end;
  end loop;
  return woff_private.room_payload(room);
end;
$$;

create function public.update_room_identity(p_space_id uuid,p_name text,p_slug text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; requested text := lower(trim(p_slug)); room_name text := trim(p_name);
begin
  if auth.uid() is null then raise exception 'Room owner required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,604031));
  -- set_room_access also takes this limiter before its room lock. Keeping that
  -- order avoids a cycle between a name/URL edit and an admission/timer edit.
  if not public.consume_rate_limit('room_access',30,60) then raise exception 'Too many room changes'; end if;
  select * into room from public.spaces where id = p_space_id for update;
  if room.creator_device_id is distinct from auth.uid()::text or not woff_private.room_active(p_space_id)
    then raise exception 'Room owner required'; end if;
  if not woff_private.owner_is_pro(auth.uid()::text) then raise exception 'Pro is required'; end if;
  if room_name is null or char_length(room_name) not between 1 and 120 then
    raise exception 'Use a room name between 1 and 120 characters'; end if;
  if p_slug is not null and not woff_private.valid_room_slug(requested) then
    raise exception 'Use a four-digit room code or a valid custom room URL'; end if;
  if requested is not null and requested <> room.slug then
    perform public.rotate_room_code(room.id,requested);
  end if;
  -- No implicit upgrade/retention change: URL and display name are independent
  -- of upload quotas, delivery mode, invitations, membership and revocation.
  update public.spaces set name = room_name,title = room_name
    where id = room.id returning * into room;
  return jsonb_build_object('space',woff_private.room_payload(room));
end;
$$;
revoke all on function public.update_room_identity(uuid,text,text) from public,anon,authenticated;
grant execute on function public.update_room_identity(uuid,text,text) to authenticated;

create or replace function public.join_space(p_slug text,p_display_name text)
returns public.spaces language plpgsql security definer set search_path = '' as $$
declare room public.spaces; requested text := lower(trim(p_slug));
begin
  if auth.uid() is null or not public.consume_rate_limit('join_space',30,60)
    or not woff_private.valid_room_slug(requested) then raise exception 'Invalid room code or URL'; end if;
  select * into room from public.spaces where slug = requested for share;
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
create or replace function public.open_space(p_slug text,p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; room_entries jsonb;
begin
  room := public.join_space(p_slug,p_display_name);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at),'[]'::jsonb) into room_entries
    from public.entries e where e.space_id = room.id and woff_private.can_read_entry(e.id);
  return jsonb_build_object('space',woff_private.room_payload(room),'entries',room_entries);
end;
$$;

create or replace function public.recover_space_ownership(p_slug text,p_recovery_key text,p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.spaces; previous_owner text; next_key text; requested text := lower(trim(p_slug));
begin
  if auth.uid() is null or not public.consume_rate_limit('recover_space',5,3600)
    or not woff_private.valid_room_slug(requested) then raise exception 'Recovery unavailable'; end if;
  select * into room from public.spaces where slug = requested for update;
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
  return jsonb_build_object('recovered',true,'recovery_key',next_key,'space',woff_private.room_payload(room));
end;
$$;

-- Replaced RPCs retain their restricted grants; restate them explicitly so the
-- migration is reviewable without depending on PostgreSQL default privileges.
revoke all on function public.rotate_room_code(uuid,text),public.join_space(text,text),
  public.open_space(text,text),public.recover_space_ownership(text,text,text) from public,anon,authenticated;
grant execute on function public.rotate_room_code(uuid,text),public.join_space(text,text),
  public.open_space(text,text),public.recover_space_ownership(text,text,text) to authenticated;
commit;
