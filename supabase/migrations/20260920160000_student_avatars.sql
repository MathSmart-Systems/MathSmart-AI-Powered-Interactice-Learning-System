-- MathSmart — profile pictures, kept private.
--
-- These are photographs of children, so the bucket is private and stays
-- private. Nothing here is served from a public URL: a picture is reached only
-- through a short-lived signed URL minted for a caller who has already proved,
-- through Row Level Security, that the picture is their own.
--
-- The object name is the owner's own user id and nothing else. That is what
-- makes the policies below a complete answer rather than a filter over
-- attacker-supplied text: an uploaded filename never reaches the path, so
-- there is no traversal to escape, no extension to spoof, and no collision
-- between two learners. Replacing a picture overwrites the same object, so a
-- learner can never accumulate orphans, and the purge has exactly one object
-- to remove.
--
-- The content type travels with the object, so the signed URL serves the right
-- one without the name carrying an extension.

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
-- Size and type are enforced here as well as in the browser. The browser check
-- is a courtesy to the learner; this is the one that holds when the request
-- does not come from the browser.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  false,
  2097152,  -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- Ownership
-- ---------------------------------------------------------------------------
-- One rule, applied four times: the object is named after you, or it is not
-- yours. `auth.uid()` is wrapped in a scalar subquery so the planner evaluates
-- it once per statement rather than once per row, which is the pattern the
-- rest of this schema uses.
--
-- There is deliberately no policy granting anyone else access, not even a
-- Teacher/Administrator. Nothing in MathSmart needs to show one learner's
-- photograph to another person, and a policy written "just in case" is a
-- policy nobody reviews.

drop policy if exists avatars_select_own on storage.objects;
create policy avatars_select_own
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text
  );

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text
  );

-- Replacing a picture is an update of the same object, so upsert needs both
-- halves: `using` to reach the row that is there, `with check` so the update
-- cannot rename it into somebody else's.
drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and name = (select auth.uid())::text
  );

comment on policy avatars_select_own on storage.objects is
  'A learner may read only the avatar named after their own user id. Signed URLs are minted under this policy, so a signed URL can only ever be produced for your own picture.';
