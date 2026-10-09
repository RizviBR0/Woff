-- INSERT/UPDATE RETURNING evaluates the entries SELECT policy on the new row.
-- Read its fields directly: a STABLE helper that reselects entries cannot see
-- a row first inserted by the current statement. Room access still uses the
-- existing invitation, membership, expiry and revocation checks.
begin;

alter policy "members can read entries" on public.entries
using (
  (expires_at is null or expires_at > now())
  and not (
    coalesce(meta @> '{"is_locked":true}'::jsonb, false)
    and coalesce(meta ? 'content', false)
    and created_by_device_id is distinct from (select auth.uid())::text
  )
  and woff_private.can_read_room(space_id)
);

commit;
