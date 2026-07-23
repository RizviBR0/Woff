-- Preserve legacy file posts after making the files bucket private.

alter table public.assets
  add column if not exists is_legacy boolean not null default false;

alter table public.assets
  drop constraint if exists assets_file_size_limit;

alter table public.assets
  add constraint assets_file_size_limit
  check (
    size > 0
    and (
      (not is_legacy and size <= 20971520)
      or (is_legacy and size <= 1073741824)
    )
  ) not valid;

-- Client code registers assets through validated RPCs; direct table inserts are
-- unnecessary and would allow callers to mark arbitrary rows as legacy.
revoke insert on public.assets from authenticated;

with rebuilt_entries as (
  select
    entry.id,
    jsonb_set(
      entry.meta,
      '{items}',
      jsonb_agg(
        case
          when extracted.legacy_path <> '' then
            item.value || jsonb_build_object(
              'path', extracted.legacy_path,
              'url', '/api/files/' || extracted.legacy_path
            )
          else item.value
        end
        order by item.ordinality
      )
    ) as migrated_meta
  from public.entries entry
  cross join lateral jsonb_array_elements(entry.meta->'items')
    with ordinality as item(value, ordinality)
  cross join lateral (
    select regexp_replace(
      split_part(
        item.value->>'url',
        '/storage/v1/object/public/files/',
        2
      ),
      '\?.*$',
      ''
    ) as legacy_path
  ) extracted
  where entry.kind = 'file'
    and jsonb_typeof(entry.meta->'items') = 'array'
  group by entry.id, entry.meta
)
update public.entries entry
set meta = rebuilt.migrated_meta
from rebuilt_entries rebuilt
where entry.id = rebuilt.id;

insert into public.assets (
  entry_id,
  bucket_key,
  mime,
  size,
  is_legacy
)
select
  entry.id,
  object.name,
  coalesce(
    nullif(item.value->>'type', ''),
    nullif(object.metadata->>'mimetype', ''),
    'application/octet-stream'
  ),
  coalesce(
    nullif(item.value->>'size', '')::bigint,
    nullif(object.metadata->>'size', '')::bigint
  ),
  true
from public.entries entry
cross join lateral jsonb_array_elements(entry.meta->'items') item(value)
join storage.objects object
  on object.bucket_id = 'files'
  and object.name = item.value->>'path'
where entry.kind = 'file'
  and jsonb_typeof(entry.meta->'items') = 'array'
on conflict (bucket_key) do nothing;

insert into public.deleted_storage_keys (bucket_key)
select object.name
from storage.objects object
left join public.assets asset on asset.bucket_key = object.name
where object.bucket_id = 'files'
  and asset.id is null
  and not exists (
    select 1
    from public.deleted_storage_keys queued
    where queued.bucket_key = object.name
  );
