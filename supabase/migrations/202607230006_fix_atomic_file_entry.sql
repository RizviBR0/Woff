-- Resolve the PL/pgSQL variable/SQL alias collision in atomic file publishing.

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
