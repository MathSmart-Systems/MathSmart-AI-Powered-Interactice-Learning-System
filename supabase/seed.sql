-- MathSmart local development seed.
--
-- Runs after `supabase db reset` applies supabase/migrations. It is not part of
-- the schema: everything the application needs to function ships as a migration,
-- so this file only adds convenience data for a local workstation.
--
-- Rules for this file
-- -------------------
--  * No people, no passwords, no credentials, no real email addresses, no Auth
--    accounts, and no production records. MathSmart accounts are
--    administrator-provisioned through the backend.
--  * Every statement is safe to run repeatedly.

-- Grade 6 is created by the Phase 1 migration chain. Re-assert it here so a
-- partially reset local database still lands in a usable state.
insert into app.grade_levels (name, level, is_active)
select 'Grade 6', 6, true
where not exists (
  select 1
  from app.grade_levels
  where grade_levels.level = 6
     or grade_levels.name = 'Grade 6'
);

-- No sections, learners, or Teacher/Administrator records are seeded. Sections
-- belong to a real school and learners belong to Supabase Auth, so both are
-- created through the administrator-provisioned backend workflow rather than
-- invented here.
