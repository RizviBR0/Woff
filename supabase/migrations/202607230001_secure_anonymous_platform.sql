-- Woff secure anonymous-identity migration (authoritative)
-- Run this once in the Supabase SQL editor before deploying the matching app.
-- Anonymous sign-ins must be enabled in Supabase Authentication.

begin;

create extension if not exists pgcrypto;

create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text,
  creator_device_id text,
  visibility text not null default 'unlisted'
    check (visibility in ('public', 'unlisted', 'private')),
  allow_public_post boolean not null default true,
  is_pro boolean not null default false,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz,
  owner_recovery_hash bytea
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  kind text not null check (kind in ('text', 'image', 'pdf', 'file')),
  text text,
  meta jsonb,
  created_by_device_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.entries(id) on delete cascade,
  bucket_key text not null,
  mime text not null,
  size bigint not null,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);

alter table public.spaces
  add column if not exists is_pro boolean not null default false;
update public.spaces set is_pro = false where is_pro is null;
alter table public.spaces alter column is_pro set default false;
alter table public.spaces alter column is_pro set not null;
alter table public.spaces
  add column if not exists expires_at timestamptz;
alter table public.spaces
  add column if not exists owner_recovery_hash bytea;

update public.spaces
set expires_at = coalesce(expires_at, last_activity_at + interval '7 days');

alter table public.spaces
  alter column expires_at set default (now() + interval '7 days');

create index if not exists idx_spaces_slug on public.spaces(slug);
create index if not exists idx_entries_space_created
  on public.entries(space_id, created_at);
create index if not exists idx_assets_entry on public.assets(entry_id);
create unique index if not exists idx_assets_bucket_key
  on public.assets(bucket_key);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entries_text_size_limit'
  ) then
    alter table public.entries
      add constraint entries_text_size_limit
      check (text is null or octet_length(text) <= 200000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'entries_meta_size_limit'
  ) then
    alter table public.entries
      add constraint entries_meta_size_limit
      check (meta is null or octet_length(meta::text) <= 250000) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'entries_no_embedded_binary'
  ) then
    alter table public.entries
      add constraint entries_no_embedded_binary
      check (
        text is null
        or text !~ '^(PHOTO:|PHOTOS:|DRAWING:).*;base64,'
      ) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'assets_file_size_limit'
  ) then
    alter table public.assets
      add constraint assets_file_size_limit
      check (size > 0 and size <= 20971520) not valid;
  end if;
end
$$;

create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 40),
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create index if not exists idx_space_members_user
  on public.space_members(user_id);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null unique references public.entries(id) on delete cascade,
  slug text not null unique,
  public_code text not null unique,
  title text not null default 'Untitled Note',
  content_json jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb,
  content_html text not null default '',
  font_family text not null default 'system'
    check (font_family in ('system', 'serif', 'mono')),
  visibility text not null default 'unlisted'
    check (visibility in ('public', 'unlisted', 'private')),
  is_locked boolean not null default false,
  passcode_hash text,
  version integer not null default 1,
  created_by_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'notes_content_size_limit'
  ) then
    alter table public.notes
      add constraint notes_content_size_limit
      check (octet_length(content_html) <= 1000000) not valid;
  end if;
end
$$;

create table if not exists public.action_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  window_start timestamptz not null,
  request_count integer not null default 0,
  primary key (user_id, action)
);

create table if not exists public.upload_intents (
  path text primary key,
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  size bigint not null check (size > 0 and size <= 20971520),
  mime text not null,
  expires_at timestamptz not null default (now() + interval '30 minutes')
);

create table if not exists public.deleted_spaces_queue (
  id bigserial primary key,
  space_id uuid not null,
  deleted_at timestamptz not null default now()
);

create table if not exists public.deleted_storage_keys (
  id bigserial primary key,
  bucket_key text not null,
  deleted_at timestamptz not null default now()
);

create table if not exists public.content_reports (
  id bigserial primary key,
  entry_id uuid not null references public.entries(id) on delete cascade,
  reported_by_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'inappropriate',
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed', 'removed')),
  created_at timestamptz not null default now(),
  unique (entry_id, reported_by_user_id)
);

alter table public.action_rate_limits enable row level security;
alter table public.upload_intents enable row level security;
alter table public.deleted_spaces_queue enable row level security;
alter table public.deleted_storage_keys enable row level security;
alter table public.content_reports enable row level security;

create index if not exists idx_notes_entry on public.notes(entry_id);
create index if not exists idx_notes_owner on public.notes(created_by_user_id);

alter table public.spaces enable row level security;
alter table public.entries enable row level security;
alter table public.assets enable row level security;
alter table public.space_members enable row level security;
alter table public.notes enable row level security;

-- Remove every legacy policy on the protected application tables. The old
-- repository contained mutually contradictory "temporary allow all" policies.
do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'spaces', 'entries', 'assets', 'space_members', 'notes',
        'content_reports', 'upload_intents', 'action_rate_limits',
        'deleted_spaces_queue', 'deleted_storage_keys'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end $$;

create policy "members can report entries"
on public.content_reports for insert to authenticated
with check (
  reported_by_user_id = auth.uid()
  and exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = content_reports.entry_id and member.user_id = auth.uid()
  )
);

create policy "users can read their upload reservations"
on public.upload_intents for select to authenticated
using (user_id = auth.uid() and expires_at > now());

revoke all on table
  public.spaces,
  public.entries,
  public.assets,
  public.space_members,
  public.notes,
  public.content_reports,
  public.action_rate_limits,
  public.upload_intents,
  public.deleted_spaces_queue,
  public.deleted_storage_keys
from anon;

revoke all on table
  public.spaces,
  public.entries,
  public.assets,
  public.space_members,
  public.notes,
  public.content_reports,
  public.action_rate_limits,
  public.upload_intents,
  public.deleted_spaces_queue,
  public.deleted_storage_keys
from authenticated;

grant select, update, delete on public.spaces to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert on public.assets to authenticated;
grant select on public.space_members to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant insert on public.content_reports to authenticated;
grant select on public.upload_intents to authenticated;

create policy "members can read their spaces"
on public.spaces for select to authenticated
using (
  creator_device_id = auth.uid()::text
  or exists (
    select 1 from public.space_members member
    where member.space_id = spaces.id and member.user_id = auth.uid()
  )
);

create policy "owners can update their spaces"
on public.spaces for update to authenticated
using (creator_device_id = auth.uid()::text)
with check (creator_device_id = auth.uid()::text);

create policy "owners can delete their spaces"
on public.spaces for delete to authenticated
using (creator_device_id = auth.uid()::text);

create policy "members can read membership"
on public.space_members for select to authenticated
using (user_id = auth.uid());

create policy "members can read entries"
on public.entries for select to authenticated
using (
  exists (
    select 1 from public.space_members member
    where member.space_id = entries.space_id and member.user_id = auth.uid()
  )
);

create policy "members can create their own entries"
on public.entries for insert to authenticated
with check (
  created_by_device_id = auth.uid()::text
  and exists (
    select 1 from public.space_members member
    where member.space_id = entries.space_id and member.user_id = auth.uid()
  )
);

create policy "senders can update their own entries"
on public.entries for update to authenticated
using (created_by_device_id = auth.uid()::text)
with check (
  created_by_device_id = auth.uid()::text
  and exists (
    select 1 from public.space_members member
    where member.space_id = entries.space_id and member.user_id = auth.uid()
  )
);

create policy "senders can delete their own entries"
on public.entries for delete to authenticated
using (created_by_device_id = auth.uid()::text);

create policy "members can read entry assets"
on public.assets for select to authenticated
using (
  exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = assets.entry_id and member.user_id = auth.uid()
  )
);

create policy "senders can register entry assets"
on public.assets for insert to authenticated
with check (
  exists (
    select 1 from public.entries entry
    where entry.id = assets.entry_id
      and entry.created_by_device_id = auth.uid()::text
  )
);

create policy "members can read unlocked notes"
on public.notes for select to authenticated
using (
  (not is_locked or created_by_user_id = auth.uid())
  and exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = notes.entry_id and member.user_id = auth.uid()
  )
);

create policy "senders can create notes"
on public.notes for insert to authenticated
with check (
  created_by_user_id = auth.uid()
  and exists (
    select 1 from public.entries entry
    where entry.id = notes.entry_id
      and entry.created_by_device_id = auth.uid()::text
  )
);

create policy "note creators can update notes"
on public.notes for update to authenticated
using (created_by_user_id = auth.uid())
with check (
  created_by_user_id = auth.uid()
  and exists (
    select 1 from public.entries entry
    where entry.id = notes.entry_id
      and entry.created_by_device_id = auth.uid()::text
  )
);

create policy "note creators can delete notes"
on public.notes for delete to authenticated
using (created_by_user_id = auth.uid());

create or replace function public.random_room_code()
returns text
language sql
volatile
set search_path = public, pg_temp
as $$
  select lpad(floor(random() * 10000)::int::text, 4, '0')
$$;

create or replace function public.consume_rate_limit(
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed boolean;
begin
  if auth.uid() is null then return false; end if;
  if p_limit < 1 or p_window_seconds < 1 then return false; end if;

  insert into public.action_rate_limits(user_id, action, window_start, request_count)
  values (auth.uid(), left(p_action, 80), now(), 1)
  on conflict (user_id, action) do update
  set
    window_start = case
      when action_rate_limits.window_start
        < now() - make_interval(secs => p_window_seconds)
      then now()
      else action_rate_limits.window_start
    end,
    request_count = case
      when action_rate_limits.window_start
        < now() - make_interval(secs => p_window_seconds)
      then 1
      else action_rate_limits.request_count + 1
    end
  returning request_count <= p_limit into allowed;

  return allowed;
end
$$;

create or replace function public.room_storage_used(p_space_id uuid)
returns bigint
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.space_members
    where space_id = p_space_id and user_id = auth.uid()
  ) then
    raise exception 'Room membership required';
  end if;
  return coalesce((
    select sum(asset.size)
    from public.assets asset
    join public.entries entry on entry.id = asset.entry_id
    where entry.space_id = p_space_id
  ), 0);
end
$$;

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
    or p_size < 1 or p_size > 20971520 then
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

drop function if exists public.create_space(text);
create function public.create_space(p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_space public.spaces;
  candidate text;
  attempt integer := 0;
  recovery_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.consume_rate_limit('create_space', 5, 60) then
    raise exception 'Too many spaces created';
  end if;

  loop
    attempt := attempt + 1;
    if attempt > 30 then
      raise exception 'Unable to allocate a room code';
    end if;

    candidate := public.random_room_code();
    begin
      recovery_key := upper(encode(extensions.gen_random_bytes(10), 'hex'));
      insert into public.spaces (
        slug, creator_device_id, visibility, allow_public_post,
        is_pro, expires_at, owner_recovery_hash
      )
      values (
        candidate, auth.uid()::text, 'unlisted', true,
        false, now() + interval '7 days',
        extensions.digest(recovery_key, 'sha256')
      )
      returning * into new_space;
      exit;
    exception when unique_violation then
      -- Try another four-digit code.
    end;
  end loop;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    new_space.id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  );

  return jsonb_build_object(
    'space', to_jsonb(new_space) - 'owner_recovery_hash',
    'recovery_key', recovery_key
  );
end
$$;

create or replace function public.recover_space(
  p_slug text,
  p_recovery_key text,
  p_display_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recovered_space_id uuid;
begin
  if auth.uid() is null then return false; end if;
  if not public.consume_rate_limit('recover_space', 5, 3600) then
    return false;
  end if;

  update public.spaces
  set creator_device_id = auth.uid()::text
  where slug = p_slug
    and owner_recovery_hash is not null
    and owner_recovery_hash = extensions.digest(upper(trim(p_recovery_key)), 'sha256')
  returning id into recovered_space_id;

  if recovered_space_id is null then return false; end if;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    recovered_space_id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  )
  on conflict (space_id, user_id) do nothing;
  return true;
end
$$;

create or replace function public.join_space(
  p_slug text,
  p_display_name text
)
returns public.spaces
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  joined_space public.spaces;
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

  select * into joined_space
  from public.spaces
  where slug = p_slug
    and (
      is_pro
      or coalesce(expires_at, last_activity_at + interval '7 days') > now()
    );

  if joined_space.id is null then
    raise exception 'Room not found or expired';
  end if;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    joined_space.id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  )
  on conflict (space_id, user_id) do nothing;

  return joined_space;
end
$$;

create or replace function public.join_note(
  p_note_slug text,
  p_display_name text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_space_id uuid;
  target_space_slug text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if not public.consume_rate_limit('join_note', 60, 60) then
    raise exception 'Too many note attempts';
  end if;

  select entry.space_id, space.slug
  into target_space_id, target_space_slug
  from public.entries entry
  join public.spaces space on space.id = entry.space_id
  left join public.notes note on note.entry_id = entry.id
  where note.slug = p_note_slug
     or entry.text like ('NOTE:' || p_note_slug || ':%')
     or entry.meta->>'note_slug' = p_note_slug
  limit 1;

  if target_space_id is null then return null; end if;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    target_space_id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  )
  on conflict (space_id, user_id) do nothing;

  return target_space_slug;
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
      or coalesce((item_record->>'size')::bigint, 0) > 20971520 then
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

create or replace function public.register_note_asset(
  p_note_slug text,
  p_path text,
  p_mime text,
  p_size bigint,
  p_width integer,
  p_height integer
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_entry_id uuid;
  target_space_id uuid;
begin
  select note.entry_id, entry.space_id
  into target_entry_id, target_space_id
  from public.notes note
  join public.entries entry on entry.id = note.entry_id
  where note.slug = p_note_slug
    and note.created_by_user_id = auth.uid();

  if target_entry_id is null or not exists (
    select 1 from public.upload_intents intent
    where intent.path = p_path
      and intent.space_id = target_space_id
      and intent.user_id = auth.uid()
      and intent.expires_at > now()
      and intent.size = p_size
  ) then
    return false;
  end if;

  insert into public.assets(entry_id, bucket_key, mime, size, width, height)
  values (
    target_entry_id, p_path,
    coalesce(nullif(p_mime, ''), 'application/octet-stream'),
    p_size, p_width, p_height
  );
  delete from public.upload_intents where path = p_path and user_id = auth.uid();
  return true;
end
$$;

-- One-time compatibility path for pre-migration rooms. The legacy device ID is
-- never returned to other users after this migration.
create or replace function public.claim_legacy_space(
  p_slug text,
  p_legacy_device_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claimed_space_id uuid;
begin
  if auth.uid() is null or p_legacy_device_id is null then return false; end if;

  update public.spaces
  set creator_device_id = auth.uid()::text
  where slug = p_slug
    and creator_device_id = p_legacy_device_id
    and creator_device_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  returning id into claimed_space_id;

  if claimed_space_id is null then return false; end if;

  update public.entries
  set created_by_device_id = auth.uid()::text
  where space_id = claimed_space_id
    and created_by_device_id = p_legacy_device_id;

  return true;
end
$$;

create or replace function public.protect_space_admin_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
      new.is_pro := false;
    end if;
  elsif new.is_pro is distinct from old.is_pro
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Pro status is admin-managed';
  elsif new.owner_recovery_hash is distinct from old.owner_recovery_hash
    and coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Recovery secret is immutable';
  end if;
  return new;
end
$$;

create or replace function public.queue_deleted_space()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.deleted_spaces_queue(space_id) values (old.id);
  return old;
end
$$;

create or replace function public.queue_deleted_asset()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.deleted_storage_keys(bucket_key) values (old.bucket_key);
  return old;
end
$$;

drop trigger if exists trigger_log_deleted_assets on public.assets;
drop trigger if exists trigger_queue_deleted_asset on public.assets;
create trigger trigger_queue_deleted_asset
before delete on public.assets
for each row execute function public.queue_deleted_asset();

drop trigger if exists trigger_queue_deleted_space on public.spaces;
drop trigger if exists trigger_log_deleted_spaces on public.spaces;
create trigger trigger_queue_deleted_space
after delete on public.spaces
for each row execute function public.queue_deleted_space();

drop trigger if exists protect_space_admin_fields on public.spaces;
create trigger protect_space_admin_fields
before insert or update on public.spaces
for each row execute function public.protect_space_admin_fields();

create or replace function public.touch_space_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.spaces
  set last_activity_at = now(),
      expires_at = case when is_pro then null else now() + interval '7 days' end
  where id = new.space_id;
  return new;
end
$$;

drop trigger if exists trigger_update_space_activity on public.entries;
create trigger trigger_update_space_activity
after insert or update on public.entries
for each row execute function public.touch_space_activity();

create or replace function public.cleanup_expired_spaces()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed integer;
begin
  with deleted as (
    delete from public.spaces
    where not coalesce(is_pro, false)
      and coalesce(expires_at, last_activity_at + interval '7 days') < now()
    returning id
  )
  select count(*) into removed from deleted;
  return removed;
end
$$;

revoke all on function public.cleanup_expired_spaces() from public, anon, authenticated;
grant execute on function public.cleanup_expired_spaces() to service_role;

revoke all on function public.create_space(text) from public, anon;
revoke all on function public.recover_space(text, text, text) from public, anon;
revoke all on function public.join_space(text, text) from public, anon;
revoke all on function public.join_note(text, text) from public, anon;
revoke all on function public.claim_legacy_space(text, text) from public, anon;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon;
revoke all on function public.create_file_entry(uuid, jsonb, text) from public, anon;
revoke all on function public.room_storage_used(uuid) from public, anon;
revoke all on function public.reserve_upload(uuid, text, bigint, text) from public, anon;
revoke all on function public.register_note_asset(text, text, text, bigint, integer, integer) from public, anon;
grant execute on function public.create_space(text) to authenticated;
grant execute on function public.recover_space(text, text, text) to authenticated;
grant execute on function public.join_space(text, text) to authenticated;
grant execute on function public.join_note(text, text) to authenticated;
grant execute on function public.claim_legacy_space(text, text) to authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to authenticated;
grant execute on function public.create_file_entry(uuid, jsonb, text) to authenticated;
grant execute on function public.room_storage_used(uuid) to authenticated;
grant execute on function public.reserve_upload(uuid, text, bigint, text) to authenticated;
grant execute on function public.register_note_asset(text, text, text, bigint, integer, integer) to authenticated;

-- Private storage: the first path segment is the room UUID.
insert into storage.buckets(id, name, public, file_size_limit)
values ('files', 'files', false, 20971520)
on conflict (id) do update
set public = false, file_size_limit = 20971520;

do $$
declare policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (
        policyname like 'Woff %'
        or policyname in (
          'Public can read files (files bucket)',
          'Public can upload files (files bucket)',
          'Public can delete files (files bucket)'
        )
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end $$;

create policy "Woff members can read files"
on storage.objects for select to authenticated
using (
  bucket_id = 'files'
  and exists (
    select 1 from public.space_members member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = auth.uid()
  )
);

create policy "Woff members can upload files"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'files'
  and exists (
    select 1 from public.upload_intents intent
    where intent.path = name
      and intent.user_id = auth.uid()
      and intent.expires_at > now()
  )
);

create policy "Woff senders can update their files"
on storage.objects for update to authenticated
using (bucket_id = 'files' and owner_id = auth.uid()::text)
with check (bucket_id = 'files' and owner_id = auth.uid()::text);

create policy "Woff senders can delete their files"
on storage.objects for delete to authenticated
using (bucket_id = 'files' and owner_id = auth.uid()::text);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'entries'
  ) then
    alter publication supabase_realtime add table public.entries;
  end if;
end $$;

commit;
