-- Optimize tenant policies and foreign-key access paths identified by the advisor.

create index if not exists idx_content_reports_reported_by_user_id
  on public.content_reports(reported_by_user_id);
create index if not exists idx_upload_intents_space_id
  on public.upload_intents(space_id);
create index if not exists idx_upload_intents_user_id
  on public.upload_intents(user_id);

drop index if exists public.idx_assets_entry_id;

alter policy "members can report entries"
on public.content_reports
with check (
  reported_by_user_id = (select auth.uid())
  and exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = content_reports.entry_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "users can read their upload reservations"
on public.upload_intents
using (
  user_id = (select auth.uid())
  and expires_at > now()
);

alter policy "members can read their spaces"
on public.spaces
using (
  creator_device_id = (select auth.uid())::text
  or exists (
    select 1
    from public.space_members member
    where member.space_id = spaces.id
      and member.user_id = (select auth.uid())
  )
);

alter policy "owners can update their spaces"
on public.spaces
using (creator_device_id = (select auth.uid())::text)
with check (creator_device_id = (select auth.uid())::text);

alter policy "owners can delete their spaces"
on public.spaces
using (creator_device_id = (select auth.uid())::text);

alter policy "members can read membership"
on public.space_members
using (user_id = (select auth.uid()));

alter policy "members can read entries"
on public.entries
using (
  exists (
    select 1
    from public.space_members member
    where member.space_id = entries.space_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "members can create their own entries"
on public.entries
with check (
  created_by_device_id = (select auth.uid())::text
  and exists (
    select 1
    from public.space_members member
    where member.space_id = entries.space_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "senders can update their own entries"
on public.entries
using (created_by_device_id = (select auth.uid())::text)
with check (
  created_by_device_id = (select auth.uid())::text
  and exists (
    select 1
    from public.space_members member
    where member.space_id = entries.space_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "senders can delete their own entries"
on public.entries
using (created_by_device_id = (select auth.uid())::text);

alter policy "members can read entry assets"
on public.assets
using (
  exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = assets.entry_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "senders can register entry assets"
on public.assets
with check (
  exists (
    select 1
    from public.entries entry
    where entry.id = assets.entry_id
      and entry.created_by_device_id = (select auth.uid())::text
  )
);

alter policy "members can read unlocked notes"
on public.notes
using (
  (not is_locked or created_by_user_id = (select auth.uid()))
  and exists (
    select 1
    from public.entries entry
    join public.space_members member on member.space_id = entry.space_id
    where entry.id = notes.entry_id
      and member.user_id = (select auth.uid())
  )
);

alter policy "senders can create notes"
on public.notes
with check (
  created_by_user_id = (select auth.uid())
  and exists (
    select 1
    from public.entries entry
    where entry.id = notes.entry_id
      and entry.created_by_device_id = (select auth.uid())::text
  )
);

alter policy "note creators can update notes"
on public.notes
using (created_by_user_id = (select auth.uid()))
with check (
  created_by_user_id = (select auth.uid())
  and exists (
    select 1
    from public.entries entry
    where entry.id = notes.entry_id
      and entry.created_by_device_id = (select auth.uid())::text
  )
);

alter policy "note creators can delete notes"
on public.notes
using (created_by_user_id = (select auth.uid()));

alter policy "Woff members can read files"
on storage.objects
using (
  bucket_id = 'files'
  and exists (
    select 1
    from public.space_members member
    where member.space_id::text = (storage.foldername(name))[1]
      and member.user_id = (select auth.uid())
  )
);

alter policy "Woff members can upload files"
on storage.objects
with check (
  bucket_id = 'files'
  and exists (
    select 1
    from public.upload_intents intent
    where intent.path = name
      and intent.user_id = (select auth.uid())
      and intent.expires_at > now()
  )
);

alter policy "Woff senders can update their files"
on storage.objects
using (
  bucket_id = 'files'
  and owner_id = (select auth.uid())::text
)
with check (
  bucket_id = 'files'
  and owner_id = (select auth.uid())::text
);

alter policy "Woff senders can delete their files"
on storage.objects
using (
  bucket_id = 'files'
  and owner_id = (select auth.uid())::text
);
