-- Supabase installs pgcrypto in the extensions schema. Keep the restricted
-- search path while allowing the recovery-key functions to resolve pgcrypto.

alter function public.create_space(text)
  set search_path = public, extensions, pg_temp;

alter function public.recover_space(text, text, text)
  set search_path = public, extensions, pg_temp;
