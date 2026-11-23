-- Optimize PostgreSQL indexes, RLS helper functions, hot RPCs, and cron sweeps
-- following Supabase Postgres best practices.
-- No schema-contract or privilege-boundary changes; all function ACLs are
-- restated explicitly.
begin;

-- ---------------------------------------------------------------------------
-- 1. Drop duplicate and unused redundant indexes (reduce write amplification)
-- ---------------------------------------------------------------------------

-- Exact duplicate of unique index spaces_slug_key on public.spaces(slug).
drop index if exists public.idx_spaces_slug;

-- Leftmost-prefix duplicate of idx_spaces_owner_created(creator_device_id, created_at desc).
drop index if exists public.idx_spaces_creator_device_id;

-- Leftmost-prefix duplicate of idx_entries_space_created(space_id, created_at).
drop index if exists public.idx_entries_space_id;

-- Exact duplicate of unique index notes_entry_id_key on public.notes(entry_id).
drop index if exists public.idx_notes_entry;

-- Unused index on locked legacy public.views table (keep idx_views_space_id for FK cascade).
drop index if exists public.idx_views_created_at;

-- ---------------------------------------------------------------------------
-- 2. Add missing FK, partial, composite, and covering indexes
-- ---------------------------------------------------------------------------

-- Missing FK index on woff_private.account_merge_tickets(source_user_id)
-- (Supabase advisor 0001_unindexed_foreign_keys).
create index if not exists idx_account_merge_tickets_source_user_id
  on woff_private.account_merge_tickets (source_user_id);

-- Partial index for hourly cleanup_expired_spaces(); excludes unlimited rooms.
create index if not exists idx_spaces_expires_at
  on public.spaces (expires_at)
  where expires_at is not null;

-- Covering index for 5-minute abandoned upload sweep (Index-Only Scan).
create index if not exists idx_upload_intents_expires_at
  on public.upload_intents (expires_at)
  include (path);

-- Composite covering index replacing idx_upload_intents_space_id: covers the
-- space_id FK cascade AND active reservation SUM(size) with Index-Only Scans.
create index if not exists idx_upload_intents_space_expires
  on public.upload_intents (space_id, expires_at)
  include (size);
drop index if exists public.idx_upload_intents_space_id;

-- Covering index replacing idx_assets_entry: covers the entry_id FK cascade
-- AND room/account SUM(size) aggregations with Index-Only Scans.
create index if not exists idx_assets_entry_size
  on public.assets (entry_id)
  include (size);
drop index if exists public.idx_assets_entry;

-- Partial expression indexes for note entry lookups (getNote / legacy join_note).
-- Use IS NOT NULL so PostgREST's equality predicate (meta->>'note_slug' = $1)
-- satisfies the partial index predicate automatically.
create index if not exists idx_entries_note_slug
  on public.entries ((meta->>'note_slug'))
  where (meta->>'note_slug') is not null;

create index if not exists idx_entries_legacy_note_slug
  on public.entries ((split_part(text, ':', 2)))
  where text like 'NOTE:%';

-- Partial indexes for billing cohort seat & capacity checks as Free users grow.
create index if not exists idx_sender_entitlements_paid_cohort
  on public.sender_entitlements (user_id)
  where billing_capacity_reserved or plan = 'pro';

create index if not exists idx_sender_checkout_reservations_active
  on woff_private.sender_checkout_reservations (expires_at)
  include (user_id, billing_test_mode)
  where consumed_at is null;

-- ---------------------------------------------------------------------------
-- 3. Optimize RLS helper functions & eliminate unindexed UUID-to-text casts
-- ---------------------------------------------------------------------------

-- Cache auth.uid() once per invocation via CTE.
create or replace function woff_private.can_read_room(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with caller as (select auth.uid() as uid)
  select caller.uid is not null and exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_device_id = caller.uid::text
        or exists (
          select 1
          from public.space_members m
          left join public.room_invitations i on i.id = m.invitation_id
          where m.space_id = s.id
            and m.user_id = caller.uid
            and m.access_version = s.access_version
            and (m.grant_expires_at is null or m.grant_expires_at > now())
            and (
              m.invitation_id is null
              or (
                i.revoked_at is null
                and (i.expires_at is null or i.expires_at > now())
                and i.access_version = s.access_version
              )
            )
        )
      )
  )
  from caller;
$$;

-- Single-pass write authorization (removes redundant spaces + space_members lookup).
create or replace function woff_private.can_write_room(p_space_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with caller as (select auth.uid() as uid)
  select caller.uid is not null and exists (
    select 1
    from public.spaces s
    where s.id = p_space_id
      and (s.expires_at is null or s.expires_at > now())
      and (
        s.creator_device_id = caller.uid::text
        or (
          s.delivery_mode = 'collaborative'
          and s.allow_public_post
          and exists (
            select 1
            from public.space_members m
            left join public.room_invitations i on i.id = m.invitation_id
            where m.space_id = s.id
              and m.user_id = caller.uid
              and m.can_write
              and m.access_version = s.access_version
              and (m.grant_expires_at is null or m.grant_expires_at > now())
              and (
                m.invitation_id is null
                or (
                  i.revoked_at is null
                  and (i.expires_at is null or i.expires_at > now())
                  and i.access_version = s.access_version
                )
              )
          )
        )
      )
  )
  from caller;
$$;

-- Cache auth.uid() once per invocation.
create or replace function woff_private.can_read_entry(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with caller as (select auth.uid() as uid)
  select exists (
    select 1
    from public.entries e
    where e.id = p_entry_id
      and (e.expires_at is null or e.expires_at > now())
      and not (
        coalesce(e.meta @> '{"is_locked":true}'::jsonb, false)
        and coalesce(e.meta ? 'content', false)
        and e.created_by_device_id is distinct from caller.uid::text
      )
      and woff_private.can_read_room(e.space_id)
  )
  from caller;
$$;

-- Single-pass asset authorization (avoids querying public.entries twice).
create or replace function woff_private.can_read_asset(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with caller as (select auth.uid() as uid)
  select exists (
    select 1
    from public.entries e
    where e.id = p_entry_id
      and (e.expires_at is null or e.expires_at > now())
      and not (
        coalesce(e.meta @> '{"is_locked":true}'::jsonb, false)
        and e.created_by_device_id is distinct from caller.uid::text
      )
      and woff_private.can_read_room(e.space_id)
      and not exists (
        select 1
        from public.notes n
        where n.entry_id = e.id
          and n.is_locked
          and n.created_by_user_id <> caller.uid
      )
  )
  from caller;
$$;

create or replace function woff_private.can_write_entry(p_entry_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  with caller as (select auth.uid() as uid)
  select exists (
    select 1
    from public.entries e
    where e.id = p_entry_id
      and e.created_by_device_id = caller.uid::text
      and (e.expires_at is null or e.expires_at > now())
      and woff_private.can_write_room(e.space_id)
  )
  from caller;
$$;

-- Use PK index on sender_entitlements(user_id) instead of casting user_id::text.
create or replace function woff_private.owner_is_pro(p_owner text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.sender_entitlements e
    join woff_private.pilot_capacity cfg on cfg.id = 1
    where e.user_id = (
        case
          when p_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            then p_owner::uuid
          else null
        end
      )
      and e.plan = 'pro'
      and e.billing_test_mode = cfg.billing_test_mode
      and greatest(e.pro_until, e.grace_until) > now()
      and woff_private.is_verified_sender(e.user_id)
  );
$$;

-- Use indexed uuid comparisons when transferring room authorship.
create or replace function woff_private.transfer_room_authorship(
  p_space_id uuid,
  p_old_owner text,
  p_new_owner uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  old_owner_uuid uuid := case
    when p_old_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_old_owner::uuid
    else null
  end;
begin
  update public.entries
  set created_by_device_id = p_new_owner::text
  where space_id = p_space_id
    and created_by_device_id = p_old_owner;

  if old_owner_uuid is not null then
    update public.notes n
    set created_by_user_id = p_new_owner
    from public.entries e
    where n.entry_id = e.id
      and e.space_id = p_space_id
      and n.created_by_user_id = old_owner_uuid;

    with removed as (
      delete from public.upload_intents
      where space_id = p_space_id
        and user_id = old_owner_uuid
      returning path
    )
    insert into public.deleted_storage_keys(bucket_key)
    select path from removed;

    delete from public.space_members
    where space_id = p_space_id
      and user_id = old_owner_uuid
      and user_id <> p_new_owner;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Eliminate SQL N+1 scans & shrink advisory-locked critical sections
-- ---------------------------------------------------------------------------

-- open_space: check room read authorization once instead of calling
-- SECURITY DEFINER can_read_entry(e.id) per row (eliminates 4*N lookups).
create or replace function public.open_space(p_slug text, p_display_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  room public.spaces;
  room_entries jsonb;
  caller_id text := auth.uid()::text;
begin
  room := public.join_space(p_slug, p_display_name);
  if woff_private.can_read_room(room.id) then
    select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at), '[]'::jsonb)
    into room_entries
    from public.entries e
    where e.space_id = room.id
      and (e.expires_at is null or e.expires_at > now())
      and not (
        coalesce(e.meta @> '{"is_locked":true}'::jsonb, false)
        and coalesce(e.meta ? 'content', false)
        and e.created_by_device_id is distinct from caller_id
      );
  else
    room_entries := '[]'::jsonb;
  end if;
  return jsonb_build_object(
    'space', woff_private.room_payload(room),
    'entries', room_entries
  );
end;
$$;

-- join_note: query notes by unique index notes_slug_key first; only fall back
-- to legacy entries lookup (backed by partial index idx_entries_legacy_note_slug)
-- when not found in public.notes. Eliminates full entries scan on every note open.
create or replace function public.join_note(p_note_slug text, p_display_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  room_slug text;
begin
  select s.slug into room_slug
  from public.notes n
  join public.entries e on e.id = n.entry_id
  join public.spaces s on s.id = e.space_id
  where n.slug = p_note_slug
    and (e.expires_at is null or e.expires_at > now())
  limit 1;

  if room_slug is null then
    select s.slug into room_slug
    from public.entries e
    join public.spaces s on s.id = e.space_id
    where e.text like 'NOTE:%'
      and split_part(e.text, ':', 2) = p_note_slug
      and (e.expires_at is null or e.expires_at > now())
    limit 1;
  end if;

  if room_slug is null then
    return null;
  end if;

  perform public.join_space(room_slug, p_display_name);
  return room_slug;
end;
$$;

-- committed_storage_bytes: single materialized scan over storage.objects and
-- single pass over upload_intents under the global advisory lock.
create or replace function woff_private.committed_storage_bytes()
returns bigint language plpgsql security definer set search_path = '' as $$
declare
  invalid_count bigint;
  total_bytes bigint;
  reserved_bytes bigint;
begin
  with file_objects as materialized (
    select
      o.name,
      case
        when coalesce(o.metadata->>'size', '') ~ '^[0-9]+$'
          then (o.metadata->>'size')::bigint
        else null
      end as size_bytes,
      split_part(o.name, '/', 1) as space_prefix
    from storage.objects o
    where o.bucket_id = 'files'
  ),
  pending_intents as materialized (
    select u.space_id, u.size
    from public.upload_intents u
    where not exists (
      select 1 from file_objects f where f.name = u.path
    )
  ),
  paid as (
    select user_id
    from public.sender_entitlements
    where not billing_test_mode
      and (billing_capacity_reserved or (plan = 'pro' and greatest(pro_until, grace_until) > now()))
    union
    select user_id
    from woff_private.sender_checkout_reservations
    where not billing_test_mode
      and consumed_at is null
      and expires_at > now()
  ),
  paid_spaces as (
    select s.id, s.id::text as id_text, p.user_id
    from paid p
    join public.spaces s on s.creator_device_id = p.user_id::text
  ),
  owned_objects as (
    select ps.user_id, coalesce(sum(f.size_bytes), 0) as bytes
    from file_objects f
    join paid_spaces ps on ps.id_text = f.space_prefix
    group by ps.user_id
  ),
  owned_intents as (
    select ps.user_id, coalesce(sum(pi.size), 0) as bytes
    from pending_intents pi
    join paid_spaces ps on ps.id = pi.space_id
    group by ps.user_id
  ),
  ownership as (
    select
      p.user_id,
      coalesce(oo.bytes, 0) + coalesce(oi.bytes, 0) as owned_bytes
    from paid p
    left join owned_objects oo on oo.user_id = p.user_id
    left join owned_intents oi on oi.user_id = p.user_id
  )
  select
    count(*) filter (where f.size_bytes is null),
    coalesce(sum(f.size_bytes), 0)
      + coalesce((select sum(pi.size) from pending_intents pi), 0),
    coalesce((select sum(greatest(1073741824::bigint - o.owned_bytes, 0)) from ownership o), 0)
  into invalid_count, total_bytes, reserved_bytes
  from file_objects f;

  if invalid_count > 0 then
    raise exception 'Storage accounting requires complete object sizes';
  end if;

  return total_bytes + reserved_bytes;
end;
$$;

-- upload_capacity_available: use indexed uuid PK/unique lookups for paid check.
create or replace function woff_private.upload_capacity_available(p_owner text, p_bytes bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  capacity bigint;
  test_mode boolean;
  paid boolean := false;
  owner_uuid uuid := case
    when p_owner ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then p_owner::uuid
    else null
  end;
begin
  perform pg_advisory_xact_lock(7814462001);
  select capacity_bytes, billing_test_mode
  into capacity, test_mode
  from woff_private.pilot_capacity
  where id = 1;

  if coalesce(capacity, 0) = 0 then
    return coalesce(not test_mode, false);
  end if;

  if owner_uuid is not null then
    paid := exists (
      select 1
      from public.sender_entitlements
      where user_id = owner_uuid
        and not billing_test_mode
        and (billing_capacity_reserved or (plan = 'pro' and greatest(pro_until, grace_until) > now()))
    ) or exists (
      select 1
      from woff_private.sender_checkout_reservations
      where user_id = owner_uuid
        and not billing_test_mode
        and consumed_at is null
        and expires_at > now()
    );
  end if;

  return woff_private.committed_storage_bytes()
    + case when paid then 0 else greatest(p_bytes, 0) end <= capacity;
end;
$$;

-- guard_upload_reservation: combine room + owner asset and intent sums from 4
-- queries into 2 queries using covering indexes (idx_assets_entry_size and
-- idx_upload_intents_space_expires).
create or replace function woff_private.guard_upload_reservation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  owner_id text;
  pro boolean;
  room_used bigint;
  owner_used bigint;
  room_reserved bigint;
  owner_reserved bigint;
begin
  select creator_device_id into owner_id from public.spaces where id = new.space_id;
  if auth.uid() is null or new.user_id <> auth.uid()
    or not woff_private.can_write_room(new.space_id)
    or new.path not like (new.space_id::text || '/%') then
    raise exception 'Upload not authorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(owner_id, 604031));
  if not woff_private.upload_capacity_available(owner_id, new.size) then
    raise exception 'Service storage capacity reached';
  end if;

  pro := woff_private.owner_is_pro(owner_id);

  select
    coalesce(sum(a.size) filter (where e.space_id = new.space_id), 0),
    coalesce(sum(a.size), 0)
  into room_used, owner_used
  from public.spaces s
  join public.entries e on e.space_id = s.id
  join public.assets a on a.entry_id = e.id
  where s.creator_device_id = owner_id;

  select
    coalesce(sum(u.size) filter (where u.space_id = new.space_id), 0),
    coalesce(sum(u.size), 0)
  into room_reserved, owner_reserved
  from public.spaces s
  join public.upload_intents u on u.space_id = s.id
  where s.creator_device_id = owner_id
    and u.expires_at > now();

  room_used := room_used + room_reserved;
  owner_used := owner_used + owner_reserved;

  if room_used + new.size > (case when pro then 1073741824 else 209715200 end)
    or owner_used + new.size > (case when pro then 1073741824 else 419430400 end) then
    raise exception 'Storage quota exceeded';
  end if;

  -- Key tombstones prevent retry/upsert from replacing previously published bytes.
  insert into woff_private.object_keys(path) values (new.path);
  new.expires_at := now() + interval '30 minutes';
  return new;
end;
$$;

-- create_file_entry & create_extension_file_entry: replace per-item validation
-- loop (up to 20 separate queries) with set-based checks.
create or replace function public.create_file_entry(
  p_space_id uuid,
  p_items jsonb,
  p_presentation text
)
returns public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.entries;
  caller_uid uuid := auth.uid();
begin
  if caller_uid is null then raise exception 'Authentication required'; end if;
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
    where space_id = p_space_id and user_id = caller_uid
  ) then
    raise exception 'Room membership required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce(item->>'path', '') not like (p_space_id::text || '/%')
      or coalesce((item->>'size')::bigint, 0) not between 1 and 52428800
  ) then
    raise exception 'Invalid uploaded object';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    left join public.upload_intents intent
      on intent.path = item->>'path'
      and intent.space_id = p_space_id
      and intent.user_id = caller_uid
      and intent.expires_at > now()
      and intent.size = (item->>'size')::bigint
    where intent.path is null
  ) then
    raise exception 'Upload reservation missing or expired';
  end if;

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
    caller_uid::text
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

  return new_entry;
end;
$$;

create or replace function public.create_extension_file_entry(
  p_space_id uuid,
  p_items jsonb,
  p_presentation text
)
returns public.entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_entry public.entries;
  caller_uid uuid := auth.uid();
begin
  if caller_uid is null then
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
      and user_id = caller_uid
  ) then
    raise exception 'Room membership required';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    where coalesce(item->>'path', '') not like (p_space_id::text || '/%')
      or coalesce((item->>'size')::bigint, 0) not between 1 and 52428800
  ) then
    raise exception 'Invalid uploaded object';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item
    left join public.upload_intents intent
      on intent.path = item->>'path'
      and intent.space_id = p_space_id
      and intent.user_id = caller_uid
      and intent.expires_at > now()
      and intent.size = (item->>'size')::bigint
    where intent.path is null
  ) then
    raise exception 'Upload reservation missing or expired';
  end if;

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
    caller_uid::text,
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

  return new_entry;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Short-circuit empty cron cleanup sweeps (skip XID / Vault / pg_net work)
-- ---------------------------------------------------------------------------

create or replace function public.cleanup_expired_entries()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not exists (
    select 1
    from public.entries
    where expires_at is not null
      and expires_at <= now()
  ) then
    return 0;
  end if;

  with deleted as (
    delete from public.entries
    where expires_at is not null
      and expires_at <= now()
    returning id
  )
  select count(*) into removed from deleted;
  return removed;
end;
$$;

create or replace function public.cleanup_expired_spaces()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not exists (
    select 1
    from public.spaces
    where expires_at is not null
      and expires_at <= now()
  ) then
    return 0;
  end if;

  with deleted as (
    delete from public.spaces
    where expires_at is not null
      and expires_at <= now()
    returning id
  )
  select count(*) into removed from deleted;
  return removed;
end;
$$;

create or replace function public.invoke_extension_storage_cleanup()
returns bigint
language plpgsql
security definer
set search_path = public, vault, net, pg_temp
as $$
declare
  project_url text;
  cleanup_secret text;
  request_id bigint;
begin
  -- Skip Vault decryption and Edge Function HTTP dispatch when all queues are empty.
  if not exists (
    select 1
    from public.entries
    where expires_at is not null
      and expires_at <= now()
  ) and not exists (
    select 1
    from public.deleted_storage_keys
  ) and not exists (
    select 1
    from public.upload_intents
    where expires_at < now()
  ) then
    return null;
  end if;

  select secret.decrypted_secret
    into project_url
  from vault.decrypted_secrets secret
  where secret.name = 'woff_project_url'
  limit 1;

  select secret.decrypted_secret
    into cleanup_secret
  from vault.decrypted_secrets secret
  where secret.name = 'woff_extension_cleanup_secret'
  limit 1;

  if nullif(project_url, '') is null or nullif(cleanup_secret, '') is null then
    raise exception 'Extension cleanup Vault secrets are not configured';
  end if;

  select net.http_post(
    url := rtrim(project_url, '/') || '/functions/v1/cleanup-expired-files',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-woff-cleanup-secret', cleanup_secret
    ),
    body := jsonb_build_object('source', 'supabase_cron'),
    timeout_milliseconds := 30000
  )
  into request_id;

  return request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Restate explicit function ACLs
-- ---------------------------------------------------------------------------

revoke all on function
  woff_private.can_read_room(uuid),
  woff_private.can_write_room(uuid),
  woff_private.can_read_entry(uuid),
  woff_private.can_read_asset(uuid),
  woff_private.can_write_entry(uuid),
  woff_private.owner_is_pro(text),
  woff_private.transfer_room_authorship(uuid, text, uuid),
  woff_private.committed_storage_bytes(),
  woff_private.upload_capacity_available(text, bigint),
  woff_private.guard_upload_reservation()
from public, anon, authenticated;

grant execute on function
  woff_private.can_read_room(uuid),
  woff_private.can_write_room(uuid),
  woff_private.can_read_entry(uuid),
  woff_private.can_read_asset(uuid),
  woff_private.can_write_entry(uuid)
to authenticated;

revoke all on function
  public.open_space(text, text),
  public.join_note(text, text),
  public.create_file_entry(uuid, jsonb, text),
  public.create_extension_file_entry(uuid, jsonb, text)
from public, anon, authenticated;

grant execute on function
  public.open_space(text, text),
  public.join_note(text, text),
  public.create_file_entry(uuid, jsonb, text),
  public.create_extension_file_entry(uuid, jsonb, text)
to authenticated;

revoke all on function
  public.cleanup_expired_entries(),
  public.cleanup_expired_spaces(),
  public.invoke_extension_storage_cleanup()
from public, anon, authenticated;

grant execute on function
  public.cleanup_expired_entries(),
  public.cleanup_expired_spaces(),
  public.invoke_extension_storage_cleanup()
to service_role;

commit;
