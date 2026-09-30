-- Authenticated callers can only save their own active notes. The server action
-- sanitizes HTML; database reads also sanitize HTML before rendering it.
create or replace function public.save_note_snapshot(
  p_slug text, p_title text, p_content_html text, p_content_json jsonb,
  p_expected_version integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  saved_note public.notes;
  owning_entry public.entries;
  owning_space public.spaces;
  clean_title text := left(coalesce(nullif(trim(p_title), ''), 'Untitled Note'), 120);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.consume_rate_limit('update_note', 120, 60) then
    raise exception 'Too many requests. Please wait and try again.';
  end if;
  if p_content_html is null or p_content_json is null
    or octet_length(p_content_html) > 1000000
    or octet_length(p_content_json::text) > 2000000 then
    raise exception 'Note is too large';
  end if;
  select * into saved_note from public.notes where slug = p_slug for update;
  if saved_note.id is null then raise exception 'Note not found'; end if;
  if saved_note.created_by_user_id <> auth.uid() then
    raise exception 'Only the note creator can edit this note';
  end if;
  select * into owning_entry from public.entries where id = saved_note.entry_id;
  select * into owning_space from public.spaces where id = owning_entry.space_id for update;
  if owning_space.id is null
    or (not owning_space.is_pro and coalesce(owning_space.expires_at, owning_space.last_activity_at + interval '48 hours') <= now())
    or (owning_entry.expires_at is not null and owning_entry.expires_at <= now()) then
    raise exception 'Note not found or expired';
  end if;
  if p_expected_version is null or saved_note.version <> p_expected_version then
    raise exception 'This note changed elsewhere. Reload before saving again.';
  end if;
  update public.notes set title = clean_title, content_html = p_content_html,
    content_json = p_content_json, version = version + 1, updated_at = now()
    where id = saved_note.id returning * into saved_note;
  -- Content-only saves do not emit an unnecessary room entry UPDATE event.
  if owning_entry.meta->>'title' is distinct from clean_title then
    update public.entries
    set meta = coalesce(meta, '{}'::jsonb) || jsonb_build_object('title', clean_title)
    where id = saved_note.entry_id;
  end if;
  return jsonb_build_object('version', saved_note.version, 'updated_at', saved_note.updated_at);
end;
$$;
revoke all on function public.save_note_snapshot(text, text, text, jsonb, integer) from public, anon;
grant execute on function public.save_note_snapshot(text, text, text, jsonb, integer) to authenticated;
