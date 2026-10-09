-- Disposable PostgreSQL fixture only. This models the platform's schemas and
-- roles, not the Storage HTTP server, Auth email delivery, Cron or Realtime.
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema auth;
create schema storage;
create schema extensions;
create schema cron;
create schema vault;
create schema net;
create extension pgcrypto with schema extensions;
create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
  is_anonymous boolean not null default true);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub',true),''),
    nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub'),'')::uuid;
$$;
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'::jsonb);
$$;
grant usage on schema public,auth,storage,extensions to anon,authenticated,service_role;
grant execute on all functions in schema auth to anon,authenticated,service_role;
create table storage.buckets(id text primary key,name text,public boolean default false,file_size_limit bigint);
insert into storage.buckets(id,name,file_size_limit) values('files','files',52428800);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,
  name text not null,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant select,insert,update,delete on storage.objects to authenticated;
grant all on all tables in schema storage to service_role;
create function storage.foldername(text) returns text[] language sql immutable as $$
  select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1];
$$;
-- Historical objects referenced by migrations, unused in the secured product.
create table public.device_sessions(id uuid);
create table public.views(id uuid);
create publication supabase_realtime;
create table cron.job(jobid bigserial primary key,jobname text,schedule text,command text);
create function cron.schedule(text,text,text) returns bigint language sql as $$
  insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid;
$$;
create function cron.unschedule(bigint) returns boolean language plpgsql as $$
begin delete from cron.job where jobid = $1; return found; end $$;
create table vault.decrypted_secrets(name text,decrypted_secret text);
create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer)
returns bigint language sql as $$ select 1::bigint; $$;
