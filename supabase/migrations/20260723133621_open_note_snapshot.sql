-- Join the note's room and return the editor snapshot in one request.
create or replace function public.open_note(p_note_slug text, p_display_name text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  target_space_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.consume_rate_limit('join_note', 60, 60) then
    raise exception 'Too many note attempts';
  end if;

  select
    jsonb_build_object(
      'id', note.id,
      'slug', note.slug,
      'title', note.title,
      'content_html', case when note.is_locked and note.created_by_user_id <> auth.uid() then '' else note.content_html end,
      'content_json', case when note.is_locked and note.created_by_user_id <> auth.uid() then null else note.content_json end,
      'public_code', note.public_code,
      'visibility', note.visibility,
      'font_family', note.font_family,
      'space_id', space.id,
      'space_slug', space.slug,
      'created_by_device_id', entry.created_by_device_id,
      'created_at', note.created_at,
      'updated_at', note.updated_at,
      'is_locked', note.is_locked,
      'is_owner', note.created_by_user_id = auth.uid(),
      'version', note.version
    ),
    space.id
  into result, target_space_id
  from public.notes note
  join public.entries entry on entry.id = note.entry_id
  join public.spaces space on space.id = entry.space_id
  where note.slug = p_note_slug
    and (space.is_pro or coalesce(space.expires_at, space.last_activity_at + interval '48 hours') > now());

  if result is null then return null; end if;

  insert into public.space_members(space_id, user_id, display_name)
  values (
    target_space_id,
    auth.uid(),
    left(coalesce(nullif(trim(p_display_name), ''), 'Anonymous'), 40)
  )
  on conflict (space_id, user_id) do nothing;

  return result;
end
$$;

revoke all on function public.open_note(text, text) from public, anon;
grant execute on function public.open_note(text, text) to authenticated;
