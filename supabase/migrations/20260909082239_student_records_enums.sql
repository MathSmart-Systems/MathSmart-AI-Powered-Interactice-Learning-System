-- MathSmart Phase 3 — student learning records, part 1 of 3.
--
-- The vocabularies the learner-record tables use, and the deterministic
-- functions that derive a percentage and a mastery band from raw evidence.
--
-- Why the derivations are functions
-- ---------------------------------
-- Scores and mastery bands are deterministic application responsibilities. Groq
-- is advisory and may not decide them. Expressing the two rules as IMMUTABLE
-- functions lets the tables enforce them as CHECK constraints, so a stored
-- percentage or band that disagrees with its own evidence cannot be written at
-- all — by the backend, by an advisory model, or by anybody else.

create type app.attempt_status as enum ('in_progress', 'submitted', 'scored', 'voided');

comment on type app.attempt_status is
  'Canonical assessment attempt lifecycle.';

-- Title Case with spaces, exactly as the canonical vocabulary defines it.
create type app.mastery_band as enum ('Mastered', 'Developing', 'Needs Improvement');

comment on type app.mastery_band is
  'Canonical competency display band. Mastered at 80-100, Developing at 50-79, Needs Improvement at 0-49.';

create type app.path_item_status as enum ('locked', 'available', 'in_progress', 'completed');

comment on type app.path_item_status is
  'Canonical learning-path item state.';

-- ---------------------------------------------------------------------------
-- Deterministic derivations
-- ---------------------------------------------------------------------------
create function app.percentage_for(raw_score integer, max_score integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round((raw_score::numeric * 100) / nullif(max_score, 0), 2);
$$;

comment on function app.percentage_for(integer, integer) is
  'The only definition of a MathSmart percentage. IMMUTABLE so the tables can enforce it as a CHECK constraint.';

create function app.mastery_band_for(score numeric)
returns app.mastery_band
language sql
immutable
set search_path = ''
as $$
  select case
           when score is null then null
           when score >= 80 then 'Mastered'::app.mastery_band
           when score >= 50 then 'Developing'::app.mastery_band
           else 'Needs Improvement'::app.mastery_band
         end;
$$;

comment on function app.mastery_band_for(numeric) is
  'The only definition of a MathSmart mastery band. Deterministic, Groq-independent, and IMMUTABLE so the tables can enforce it as a CHECK constraint.';

-- ---------------------------------------------------------------------------
-- Learner identity helper
-- ---------------------------------------------------------------------------
-- Resolves the caller's own learner record. Plain STABLE SQL, not SECURITY
-- DEFINER: it reads app.student_profiles as the caller, whose own policy
-- already restricts that table to the caller's row, so this can only ever
-- return the caller's own student_id.
create function app.current_student_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select student_profiles.student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid());
$$;

comment on function app.current_student_id() is
  'The caller''s own student_id, or NULL when the caller is not a learner.';

revoke all on function app.percentage_for(integer, integer) from public;
revoke all on function app.mastery_band_for(numeric) from public;
revoke all on function app.current_student_id() from public;

grant execute on function app.percentage_for(integer, integer) to authenticated, service_role;
grant execute on function app.mastery_band_for(numeric) to authenticated, service_role;
grant execute on function app.current_student_id() to authenticated, service_role;
