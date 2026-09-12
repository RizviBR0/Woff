-- Chrome extension uploads disappear 48 hours after publication while ordinary web
-- entries keep the room-level lifetime policy.

begin;

alter table public.entries
  add column if not exists expires_at timestamptz;

create index if not exists idx_entries_expires_at
  on public.entries(expires_at)
  where expires_at is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'entries_expiry_window'
  ) then
    alter table public.entries
      add constraint entries_expiry_window
      check (
        expires_at is null
        or expires_at <= created_at + interval '48 hours'
      ) not valid;
  end if;
end
$$;

-- Once an entry has an expiry, clients cannot extend or remove it. Service
-- cleanup deletes the row instead of trying to mutate the deadline.
create or replace function public.protect_entry_expiry()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.expires_at is not null
    and new.expires_at is distinct from old.expires_at then
    new.expires_at := old.expires_at;
  end if;
  return new;
end
$$;

drop trigger if exists protect_entry_expiry on public.entries;
create trigger protect_entry_expiry
before update on public.entries
for each row execute function public.protect_entry_expiry();

revoke all on function public.protect_entry_expiry() from public, anon, authenticated;

-- Atomic extension publisher. It mirrors the existing validated file RPC but
-- always sets a server-side 48-hour deadline and an auditable source marker.
create or replace function public.create_extension_file_entry(
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.consume_rate_limit('create_extension_file_entry', 30, 60) then
    raise exception 'Too many file entries';
  end if;
  if p_presentation not in ('files', 'photos') then
    raise exception 'Invalid presentation';
  end if;
  if jsonb_typeof(p_items) <> 'array'
    or jsonb_array_length(p_items) < 1
    or jsonb_array_length(p_items) > 20 then
    raise exception 'Invalid file batch';
  end if;
  if not exists (
    select 1
    from public.space_members
    where space_id = p_space_id
      and user_id = (select auth.uid())
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
      select 1
      from public.upload_intents intent
      where intent.path = item_record->>'path'
        and intent.space_id = p_space_id
        and intent.user_id = (select auth.uid())
        and intent.expires_at > now()
        and intent.size = (item_record->>'size')::bigint
    ) then
      raise exception 'Upload reservation missing or expired';
    end if;
  end loop;

  insert into public.entries(
    space_id,
    kind,
    text,
    meta,
    created_by_device_id,
    expires_at
  )
  values (
    p_space_id,
    'file',
    null,
    jsonb_build_object(
      'type', 'files',
      'presentation', p_presentation,
      'source', 'chrome_extension',
      'items', p_items
    ),
    auth.uid()::text,
    now() + interval '48 hours'
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
    select value->>'path'
    from jsonb_array_elements(p_items)
  )
    and user_id = (select auth.uid());

  return new_entry;
end
$$;

revoke all on function public.create_extension_file_entry(uuid, jsonb, text)
  from public, anon;
grant execute on function public.create_extension_file_entry(uuid, jsonb, text)
  to authenticated;

-- Security-definer room snapshots must apply expiry explicitly because they do
-- not rely on the caller's entries RLS policy.
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
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.consume_rate_limit('join_space', 30, 60) then
    raise exception 'Too many room attempts';
  end if;
  if p_slug !~ '^[0-9]{4}$' then
    raise exception 'Invalid room code';
  end if;

  select * into opened_space
  from public.spaces
  where slug = p_slug
    and (
      is_pro
      or coalesce(expires_at, last_activity_at + interval '48 hours') > now()
    );

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
  where entry.space_id = opened_space.id
    and (entry.expires_at is null or entry.expires_at > now());

  return jsonb_build_object(
    'space', to_jsonb(opened_space) - 'owner_recovery_hash',
    'entries', room_entries
  );
end
$$;

revoke all on function public.open_space(text, text) from public, anon;
grant execute on function public.open_space(text, text) to authenticated;

-- Data API and Storage reads stop at the deadline even before the cleanup job
-- removes the row and physical object.
alter policy "members can read entries"
on public.entries
using (
  (expires_at is null or expires_at > now())
  and exists (
    select 1
    from public.space_members member
    where member.space_id = entries.space_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "members can read entry assets"
on public.assets
using (
  exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = assets.entry_id
      and (entry.expires_at is null or entry.expires_at > now())
      and member.user_id = (select auth.uid())
  )
);

alter policy "Woff members can read files"
on storage.objects
using (
  bucket_id = 'files'
  and exists (
    select 1
    from public.assets asset
    join public.entries entry on entry.id = asset.entry_id
    join public.space_members member on member.space_id = entry.space_id
    where asset.bucket_key = storage.objects.name
      and (entry.expires_at is null or entry.expires_at > now())
      and member.user_id = (select auth.uid())
  )
);

create or replace function public.cleanup_expired_entries()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  with deleted as (
    delete from public.entries
    where expires_at is not null
      and expires_at <= now()
    returning id
  )
  select count(*) into removed from deleted;
  return removed;
end
$$;

revoke all on function public.cleanup_expired_entries()
  from public, anon, authenticated;
grant execute on function public.cleanup_expired_entries() to service_role;

-- Database rows and access disappear within five minutes of the deadline. The
-- existing Storage API cleanup route permanently removes queued objects.
do $$
declare
  old_job record;
begin
  for old_job in
    select jobid
    from cron.job
    where jobname = 'woff-expire-extension-files'
  loop
    perform cron.unschedule(old_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'woff-expire-extension-files',
  '*/5 * * * *',
  $cron$select public.cleanup_expired_entries();$cron$
);

commit;
