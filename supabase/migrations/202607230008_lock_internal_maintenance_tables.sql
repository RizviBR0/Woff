-- Remove legacy direct access to server-only maintenance data. Application
-- users interact with these tables only through audited SECURITY DEFINER RPCs;
-- the cleanup route uses a server-only Supabase secret.
do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'action_rate_limits',
        'deleted_spaces_queue',
        'deleted_storage_keys'
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

revoke all on table
  public.action_rate_limits,
  public.deleted_spaces_queue,
  public.deleted_storage_keys
from public, anon, authenticated;

grant all on table
  public.action_rate_limits,
  public.deleted_spaces_queue,
  public.deleted_storage_keys
to service_role;
