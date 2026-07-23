-- Non-Pro spaces expire 48 hours after their last meaningful activity.
alter table public.spaces
  alter column expires_at set default (now() + interval '48 hours');

update public.spaces
set expires_at = case
  when coalesce(is_pro, false) then null
  else coalesce(last_activity_at, created_at, now()) + interval '48 hours'
end;

create or replace function public.create_space(p_display_name text)
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
        false, now() + interval '48 hours',
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
      or coalesce(expires_at, last_activity_at + interval '48 hours') > now()
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

create or replace function public.touch_space_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.spaces
  set last_activity_at = now(),
      expires_at = case when is_pro then null else now() + interval '48 hours' end
  where id = new.space_id;
  return new;
end
$$;

-- Editing an existing note is activity too. Notes reference their space through
-- the entry row, so refresh that room without trusting client-supplied IDs.
create or replace function public.touch_note_space_activity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.spaces as space
  set last_activity_at = now(),
      expires_at = case when space.is_pro then null else now() + interval '48 hours' end
  from public.entries as entry
  where entry.id = new.entry_id
    and space.id = entry.space_id;
  return new;
end
$$;

drop trigger if exists trigger_update_note_space_activity on public.notes;
create trigger trigger_update_note_space_activity
after insert or update on public.notes
for each row execute function public.touch_note_space_activity();

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
      and coalesce(expires_at, last_activity_at + interval '48 hours') < now()
    returning id
  )
  select count(*) into removed from deleted;
  return removed;
end
$$;

revoke all on function public.touch_note_space_activity() from public, anon, authenticated;
revoke all on function public.cleanup_expired_spaces() from public, anon, authenticated;
grant execute on function public.cleanup_expired_spaces() to service_role;

-- Replace the old daily two-day cleanup with an hourly 48-hour policy job.
do $$
declare
  old_job record;
begin
  for old_job in
    select jobid
    from cron.job
    where jobname in ('cleanup-inactive-spaces', 'woff-expire-spaces-hourly')
  loop
    perform cron.unschedule(old_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'woff-expire-spaces-hourly',
  '0 * * * *',
  $cron$select public.cleanup_expired_spaces();$cron$
);
