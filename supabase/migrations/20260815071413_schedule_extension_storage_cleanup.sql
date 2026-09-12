-- Physically remove expired extension files close to their 48-hour deadline.
-- The Edge Function authenticates Supabase Cron with a separate secret held in
-- Vault; no service-role key is stored in a database function or migration.

begin;

create extension if not exists pg_net with schema extensions;

create or replace function public.validate_extension_cleanup_secret(
  p_secret text
)
returns boolean
language sql
stable
security definer
set search_path = public, vault, extensions, pg_temp
as $$
  select coalesce(
    (
      select
        extensions.digest(convert_to(secret.decrypted_secret, 'UTF8'), 'sha256')
        = extensions.digest(convert_to(p_secret, 'UTF8'), 'sha256')
      from vault.decrypted_secrets secret
      where secret.name = 'woff_extension_cleanup_secret'
      limit 1
    ),
    false
  );
$$;

revoke all on function public.validate_extension_cleanup_secret(text)
  from public, anon, authenticated;
grant execute on function public.validate_extension_cleanup_secret(text)
  to service_role;

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

revoke all on function public.invoke_extension_storage_cleanup()
  from public, anon, authenticated;
grant execute on function public.invoke_extension_storage_cleanup()
  to service_role;

do $$
declare
  old_job record;
begin
  for old_job in
    select jobid
    from cron.job
    where jobname = 'woff-clean-extension-storage'
  loop
    perform cron.unschedule(old_job.jobid);
  end loop;
end
$$;

select cron.schedule(
  'woff-clean-extension-storage',
  '*/5 * * * *',
  $cron$select public.invoke_extension_storage_cleanup();$cron$
);

commit;
