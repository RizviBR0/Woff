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
declare
  used_bytes bigint;
  reserved_bytes bigint;
  quota_bytes bigint;
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

  select case when is_pro then 1073741824 else 209715200 end
  into quota_bytes
  from public.spaces where id = p_space_id;

  select coalesce(sum(asset.size), 0)
  into used_bytes
  from public.assets asset
  join public.entries entry on entry.id = asset.entry_id
  where entry.space_id = p_space_id;

  select coalesce(sum(size), 0)
  into reserved_bytes
  from public.upload_intents
  where space_id = p_space_id and expires_at > now();

  if used_bytes + reserved_bytes + p_size > quota_bytes then return false; end if;

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
      or coalesce((file->>'size')::bigint, 0) > 52428800
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
