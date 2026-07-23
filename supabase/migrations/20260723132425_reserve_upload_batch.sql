-- Reserve every file in a composer batch in one transaction. Locking the room
-- prevents concurrent batches from racing its storage quota.
create or replace function public.reserve_upload_batch(
  p_space_id uuid,
  p_files jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quota_bytes bigint;
  used_bytes bigint;
  reserved_bytes bigint;
  requested_bytes bigint;
begin
  if auth.uid() is null
    or jsonb_typeof(p_files) <> 'array'
    or jsonb_array_length(p_files) < 1
    or jsonb_array_length(p_files) > 20
    or not exists (
      select 1 from public.space_members
      where space_id = p_space_id and user_id = auth.uid()
    )
  then
    return false;
  end if;

  if not public.consume_rate_limit('upload_batch', 20, 60) then
    return false;
  end if;

  select case when is_pro then 1073741824 else 209715200 end
  into quota_bytes
  from public.spaces
  where id = p_space_id
  for update;

  if quota_bytes is null then return false; end if;

  if exists (
    select 1
    from jsonb_array_elements(p_files) as file
    where coalesce(file->>'path', '') not like (p_space_id::text || '/%')
      or coalesce((file->>'size')::bigint, 0) < 1
      or coalesce((file->>'size')::bigint, 0) > 20971520
  ) then
    return false;
  end if;

  select coalesce(sum((file->>'size')::bigint), 0)
  into requested_bytes
  from jsonb_array_elements(p_files) as file;

  select coalesce(sum(asset.size), 0)
  into used_bytes
  from public.assets asset
  join public.entries entry on entry.id = asset.entry_id
  where entry.space_id = p_space_id;

  select coalesce(sum(size), 0)
  into reserved_bytes
  from public.upload_intents
  where space_id = p_space_id and expires_at > now();

  if used_bytes + reserved_bytes + requested_bytes > quota_bytes then
    return false;
  end if;

  insert into public.upload_intents(path, space_id, user_id, size, mime)
  select
    file->>'path',
    p_space_id,
    auth.uid(),
    (file->>'size')::bigint,
    coalesce(nullif(file->>'mime', ''), 'application/octet-stream')
  from jsonb_array_elements(p_files) as file;

  return true;
end
$$;

-- Create the room entry and note atomically in one request.
create or replace function public.create_note_entry(
  p_space_id uuid,
  p_note_slug text,
  p_public_code text,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_entry public.entries;
  clean_title text := left(coalesce(nullif(trim(p_title), ''), 'Untitled Note'), 120);
begin
  if auth.uid() is null or not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;
  if not public.consume_rate_limit('create_note', 10, 60) then
    raise exception 'Too many notes created';
  end if;

  insert into public.entries(
    space_id, kind, text, meta, created_by_device_id
  )
  values (
    p_space_id,
    'text',
    'NOTE:' || p_note_slug,
    jsonb_build_object(
      'type', 'note',
      'note_slug', p_note_slug,
      'public_code', p_public_code,
      'title', clean_title,
      'is_locked', false
    ),
    auth.uid()::text
  )
  returning * into created_entry;

  insert into public.notes(
    entry_id, slug, public_code, title, created_by_user_id
  )
  values (
    created_entry.id, p_note_slug, p_public_code, clean_title, auth.uid()
  );

  return jsonb_build_object(
    'note_slug', p_note_slug,
    'public_code', p_public_code,
    'entry_id', created_entry.id
  );
end
$$;

-- Join a room and return its first render in one database round-trip.
create or replace function public.open_space(
  p_slug text,
  p_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  opened_space public.spaces;
  room_entries jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.consume_rate_limit('join_space', 30, 60) then
    raise exception 'Too many room attempts';
  end if;
  if p_slug !~ '^[0-9]{4}$' then raise exception 'Invalid room code'; end if;

  select * into opened_space
  from public.spaces
  where slug = p_slug
    and (is_pro or coalesce(expires_at, last_activity_at + interval '48 hours') > now());

  if opened_space.id is null then
    raise exception 'Room not found or expired';
  end if;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    opened_space.id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  )
  on conflict (space_id, user_id) do nothing;

  select coalesce(
    jsonb_agg(to_jsonb(entry) order by entry.created_at),
    '[]'::jsonb
  )
  into room_entries
  from public.entries entry
  where entry.space_id = opened_space.id;

  return jsonb_build_object(
    'space', to_jsonb(opened_space) - 'owner_recovery_hash',
    'entries', room_entries
  );
end
$$;

revoke all on function public.reserve_upload_batch(uuid, jsonb) from public, anon;
revoke all on function public.create_note_entry(uuid, text, text, text) from public, anon;
revoke all on function public.open_space(text, text) from public, anon;
grant execute on function public.reserve_upload_batch(uuid, jsonb) to authenticated;
grant execute on function public.create_note_entry(uuid, text, text, text) to authenticated;
grant execute on function public.open_space(text, text) to authenticated;
