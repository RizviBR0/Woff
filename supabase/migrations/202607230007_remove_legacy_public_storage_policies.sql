-- A private bucket still obeys object-level policies. Remove the legacy public
-- policies so only the membership and upload-intent policies remain.

drop policy if exists "Public can read files (files bucket)"
  on storage.objects;
drop policy if exists "Public can upload files (files bucket)"
  on storage.objects;
drop policy if exists "Public can delete files (files bucket)"
  on storage.objects;
