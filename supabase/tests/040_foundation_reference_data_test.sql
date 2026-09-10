-- MathSmart Phase 1 — reference data, seed repeatability and migration order.
--
-- Written for the documented verification path:
--     supabase db reset && supabase test db
-- so it asserts the state a freshly rebuilt database is in.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- Grade 6 comes from the migration chain, not from the Dashboard
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from app.grade_levels where level = 6),
  1::bigint,
  'Exactly one Grade 6 row exists'
);

select is(
  (select name from app.grade_levels where level = 6),
  'Grade 6',
  'The Grade 6 row carries the canonical name'
);

select ok(
  (select is_active from app.grade_levels where level = 6),
  'Grade 6 is the active MVP grade level'
);

-- True with or without the development seed: the reference data is owned by the
-- migration chain, and the seed only re-asserts the same guarded row.
select is(
  (select count(*) from app.grade_levels where grade_levels.level <> 6),
  0::bigint,
  'A rebuilt database holds Grade 6 and no other grade level'
);

-- ---------------------------------------------------------------------------
-- Nothing personal is seeded
-- ---------------------------------------------------------------------------
select is((select count(*) from app.user_profiles),          0::bigint, 'No application profiles are seeded');
select is((select count(*) from app.student_profiles),       0::bigint, 'No learner records are seeded');
select is((select count(*) from app.teacher_admin_profiles), 0::bigint, 'No Teacher/Administrator records are seeded');
select is((select count(*) from app.sections),               0::bigint, 'No sections are seeded');

-- ---------------------------------------------------------------------------
-- The reference-data statements are safe to run again
-- ---------------------------------------------------------------------------
-- This is the exact guard used by the reference-data migration and by
-- supabase/seed.sql. Running it a second time must add nothing.
insert into app.grade_levels (name, level, is_active)
select 'Grade 6', 6, true
where not exists (
  select 1
  from app.grade_levels
  where grade_levels.level = 6
     or grade_levels.name = 'Grade 6'
);

select is(
  (select count(*) from app.grade_levels where level = 6),
  1::bigint,
  'Re-running the Grade 6 reference-data statement inserts no duplicate'
);

-- The migration also re-asserts is_active. When Grade 6 is already active the
-- guarded update matches zero rows, so the row and its updated_at are untouched.
select is(
  (select count(*)
   from app.grade_levels
   where grade_levels.level = 6
     and grade_levels.is_active is distinct from true),
  0::bigint,
  'The guarded re-activation statement matches no rows when Grade 6 is already active'
);

update app.grade_levels
set is_active = true
where grade_levels.level = 6
  and grade_levels.is_active is distinct from true;

select ok(
  (select is_active from app.grade_levels where level = 6),
  'Re-running the is_active re-assertion leaves Grade 6 active'
);

-- Archiving and re-running the migration statement restores the active flag.
update app.grade_levels set is_active = false where level = 6;

update app.grade_levels
set is_active = true
where grade_levels.level = 6
  and grade_levels.is_active is distinct from true;

select ok(
  (select is_active from app.grade_levels where level = 6),
  'The reference-data migration re-activates Grade 6 if it was archived'
);

-- ---------------------------------------------------------------------------
-- Migration ordering
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(version, ',' order by version)
   from supabase_migrations.schema_migrations
   where version between '20260909063045' and '20260909063054'),
  '20260909063045,20260909063048,20260909063051,20260909063054',
  'The four Phase 1 foundation migrations are recorded in ascending order'
);

select is(
  (select count(*)
   from supabase_migrations.schema_migrations
   where version between '20260909063045' and '20260909063054'),
  4::bigint,
  'No Phase 1 foundation migration is missing or applied twice'
);

select * from finish();

rollback;
