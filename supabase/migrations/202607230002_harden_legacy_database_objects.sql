-- Remove legacy public API surfaces that are not used by the secured application.

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('device_sessions', 'views')
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;

alter table if exists public.device_sessions enable row level security;
alter table if exists public.views enable row level security;

revoke all on table public.device_sessions from public, anon, authenticated;
revoke all on table public.views from public, anon, authenticated;

drop function if exists public.cleanup_inactive_spaces(integer);
drop function if exists public.log_deleted_assets();
drop function if exists public.log_deleted_spaces();
drop function if exists public.update_space_last_activity();

revoke all on function public.queue_deleted_asset() from public, anon, authenticated;
revoke all on function public.queue_deleted_space() from public, anon, authenticated;
revoke all on function public.touch_space_activity() from public, anon, authenticated;
