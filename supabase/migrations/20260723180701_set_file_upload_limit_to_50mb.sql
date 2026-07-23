-- Match the application and bucket to the Free-plan global Storage ceiling.
-- The comparison is inclusive: exactly 50 MiB is accepted.

alter table public.upload_intents
  drop constraint if exists upload_intents_size_check;

alter table public.upload_intents
  add constraint upload_intents_size_check
  check (size > 0 and size <= 52428800);

alter table public.assets
  drop constraint if exists assets_file_size_limit;

alter table public.assets
  add constraint assets_file_size_limit
  check (
    size > 0
    and (
      (not is_legacy and size <= 52428800)
      or (is_legacy and size <= 1073741824)
    )
  ) not valid;

update storage.buckets
set file_size_limit = 52428800
where id = 'files';

create or replace function public.reserve_upload(
  p_space_id uuid,
  p_path text,
  p_size bigint,
  p_mime text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  ) then
    return false;
  end if;
  if not public.consume_rate_limit('upload_intent', 60, 60) then
    return false;
  end if;
  if p_path not like (p_space_id::text || '/%')
    or p_size < 1 or p_size > 52428800 then
    return false;
  end if;

  insert into public.upload_intents(path, space_id, user_id, size, mime)
  values (
    p_path, p_space_id, auth.uid(), p_size,
    coalesce(nullif(p_mime, ''), 'application/octet-stream')
  );
  return true;
end
$$;

create or replace function public.reserve_upload_batch(
  p_space_id uuid,
  p_files jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

  if exists (
    select 1
    from jsonb_array_elements(p_files) as file
    where coalesce(file->>'path', '') not like (p_space_id::text || '/%')
      or coalesce((file->>'size')::bigint, 0) < 1
      or coalesce((file->>'size')::bigint, 0) > 52428800
  ) then
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

create or replace function public.create_file_entry(
  p_space_id uuid,
  p_items jsonb,
  p_presentation text
)
returns public.entries
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_entry public.entries;
  item_record jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.consume_rate_limit('create_file_entry', 30, 60) then
    raise exception 'Too many file entries';
  end if;
  if p_presentation not in ('files', 'photos', 'drawing') then
    raise exception 'Invalid presentation';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 20 then
    raise exception 'Invalid file batch';
  end if;
  if not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;

  for item_record in select value from jsonb_array_elements(p_items)
  loop
    if item_record->>'path' not like (p_space_id::text || '/%')
      or coalesce((item_record->>'size')::bigint, 0) < 1
      or coalesce((item_record->>'size')::bigint, 0) > 52428800 then
      raise exception 'Invalid uploaded object';
    end if;
    if not exists (
      select 1 from public.upload_intents intent
      where intent.path = item_record->>'path'
        and intent.space_id = p_space_id
        and intent.user_id = auth.uid()
        and intent.expires_at > now()
        and intent.size = (item_record->>'size')::bigint
    ) then
      raise exception 'Upload reservation missing or expired';
    end if;
  end loop;

  insert into public.entries(
    space_id, kind, text, meta, created_by_device_id
  )
  values (
    p_space_id,
    'file',
    null,
    jsonb_build_object(
      'type', 'files',
      'presentation', p_presentation,
      'items', p_items
    ),
    auth.uid()::text
  )
  returning * into new_entry;

  insert into public.assets(entry_id, bucket_key, mime, size, width, height)
  select
    new_entry.id,
    uploaded_item->>'path',
    coalesce(nullif(uploaded_item->>'type', ''), 'application/octet-stream'),
    (uploaded_item->>'size')::bigint,
    nullif(uploaded_item->>'width', '')::integer,
    nullif(uploaded_item->>'height', '')::integer
  from jsonb_array_elements(p_items) uploaded_item;

  delete from public.upload_intents
  where path in (
    select value->>'path' from jsonb_array_elements(p_items)
  ) and user_id = auth.uid();

  return new_entry;
end
$$;

