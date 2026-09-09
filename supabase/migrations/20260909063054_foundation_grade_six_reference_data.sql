-- MathSmart Phase 1 — database foundation, part 4 of 4.
--
-- Grade 6 reference data.
--
-- Grade 6 is the DepEd curriculum target of the MathSmart MVP and is required
-- for the application to function, so it ships as a migration rather than as
-- developer seed data: every environment built from this migration chain has it,
-- with no Dashboard step.
--
-- This migration contains no people, no credentials, no email addresses and no
-- Auth accounts. It is written to be safe to run repeatedly.

insert into app.grade_levels (name, level, is_active)
select 'Grade 6', 6, true
where not exists (
  select 1
  from app.grade_levels
  where grade_levels.level = 6
     or grade_levels.name = 'Grade 6'
);

-- Grade 6 is the active MVP grade level. Re-running the migration re-asserts
-- that without touching updated_at when nothing has changed.
update app.grade_levels
set is_active = true
where grade_levels.level = 6
  and grade_levels.is_active is distinct from true;
