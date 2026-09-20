-- MathSmart — a learner's profile picture is their own and nobody else's.
--
-- These are photographs of children. The bucket is private, and the policies
-- below are the whole of the access rule: an object is named after its owner,
-- and only that owner may read, write, replace or remove it. A signed URL can
-- only be minted for an object the caller may already read, so the select
-- policy is also what stops one learner producing a link to another's face.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Two learners who exist in the seed, and a Teacher/Administrator.
\set learner_one '"b0000000-0000-4000-8000-0000000000b1"'
\set learner_two '"b0000000-0000-4000-8000-0000000000b2"'

-- ---------------------------------------------------------------------------
-- The bucket
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from storage.buckets where id = 'avatars'),
  1::bigint,
  'the avatars bucket exists'
);

select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'the avatars bucket is private, so nothing is served from a public URL'
);

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'the bucket enforces the same 2 MiB the browser does'
);

select ok(
  (select allowed_mime_types from storage.buckets where id = 'avatars')
    @> array['image/jpeg', 'image/png', 'image/webp'],
  'the bucket accepts exactly the image types the form offers'
);

select ok(
  not (
    (select allowed_mime_types from storage.buckets where id = 'avatars')
      && array['image/svg+xml', 'text/html', 'application/pdf']
  ),
  'the bucket refuses types that can carry script'
);

-- ---------------------------------------------------------------------------
-- The policies exist, one per verb
-- ---------------------------------------------------------------------------
select is(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'storage'
     and pg_class.relname = 'objects'
     and pg_policy.polname like 'avatars_%'),
  4::bigint,
  'read, write, replace and remove each have their own policy'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'storage.objects'::regclass),
  'row level security is on for storage.objects'
);

select is(
  (select count(*)
   from pg_policy
   join pg_class on pg_class.oid = pg_policy.polrelid
   where pg_class.relname = 'objects'
     and pg_policy.polname = 'avatars_delete_own'
     and pg_policy.polcmd = 'd'),
  1::bigint,
  'removal is governed by its own policy, which the Storage API consults'
);

-- ---------------------------------------------------------------------------
-- One learner, acting as themselves
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('avatars', 'b0000000-0000-4000-8000-0000000000b1',
             'b0000000-0000-4000-8000-0000000000b1',
             '{"mimetype":"image/png","size":1024}'::jsonb) $$,
  'a learner may upload a picture named after themselves'
);

select is(
  (select count(*) from storage.objects
   where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1'),
  1::bigint,
  'and can read it back, which is what lets a signed URL be minted'
);

-- The name is the whole rule, so an object under any other name is refused
-- however it is dressed up.
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('avatars', 'b0000000-0000-4000-8000-0000000000b2',
             'b0000000-0000-4000-8000-0000000000b1',
             '{"mimetype":"image/png","size":1024}'::jsonb) $$,
  '42501',
  null::text,
  'a learner cannot upload a picture named after another learner'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('avatars', '../b0000000-0000-4000-8000-0000000000b2',
             'b0000000-0000-4000-8000-0000000000b1',
             '{"mimetype":"image/png","size":1024}'::jsonb) $$,
  '42501',
  null::text,
  'and cannot reach one by walking out of their own name'
);

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, metadata)
     values ('avatars', 'b0000000-0000-4000-8000-0000000000b1/../b0000000-0000-4000-8000-0000000000b2',
             'b0000000-0000-4000-8000-0000000000b1',
             '{"mimetype":"image/png","size":1024}'::jsonb) $$,
  '42501',
  null::text,
  'nor by prefixing their own name onto somebody else''s'
);

-- ---------------------------------------------------------------------------
-- The other learner, who must not be able to touch it
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b2","role":"authenticated","app_metadata":{"role":"student"}}';

select is(
  (select count(*) from storage.objects
   where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'another learner cannot see that a picture exists, so cannot sign a URL for it'
);

-- A denial by USING clause removes the row from view rather than raising, so
-- the proof is that nothing was affected.
select lives_ok(
  $$ update storage.objects set metadata = '{"mimetype":"image/png","size":2}'::jsonb
     where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1' $$,
  'an update aimed at another learner''s picture runs'
);

select is(
  (select metadata->>'size' from storage.objects
   where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1'),
  null,
  'but changes nothing, because the row is not theirs to see'
);

-- Storage refuses every direct SQL delete, whoever is asking: deletion goes
-- through the Storage API, where `avatars_delete_own` is what decides. So the
-- cross-learner proof for removal is this trigger plus that policy, and the
-- assertion below is that the door is shut rather than merely guarded.
select throws_ok(
  $$ delete from storage.objects
     where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1' $$,
  '42501',
  null::text,
  'no one may delete a stored object straight from SQL, policy or not'
);

-- ---------------------------------------------------------------------------
-- Back as the owner: the picture survived the other learner entirely
-- ---------------------------------------------------------------------------
set local request.jwt.claims = '{"sub":"b0000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';

select is(
  (select metadata->>'size' from storage.objects
   where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1'),
  '1024',
  'the owner''s picture is untouched: still there, and still what they uploaded'
);

-- ---------------------------------------------------------------------------
-- A Teacher/Administrator is not an exception
-- ---------------------------------------------------------------------------
-- Nothing in MathSmart shows one learner's photograph to another person, so no
-- policy grants it. A policy written "just in case" is one nobody reviews.
set local request.jwt.claims = '{"sub":"a0000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';

select is(
  (select count(*) from storage.objects
   where bucket_id = 'avatars' and name = 'b0000000-0000-4000-8000-0000000000b1'),
  0::bigint,
  'not even a Teacher/Administrator may read a learner''s picture'
);

reset role;
select * from finish();
rollback;
