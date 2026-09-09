-- MathSmart Phase 6 — an expired grant is retired, not a permanent block.
--
-- app.reassessment_authorizations allows one open grant per learner and
-- assessment, through a partial unique index on `consumed_at is null`. That
-- index cannot read a clock: an expired grant is still unconsumed, so it keeps
-- the open slot. Now that expiry is enforced — 20260910072000 made an expired
-- grant refuse the reassessment — an expired row would deadlock the workflow
-- instead: the learner cannot sit, and the educator cannot grant again, because
-- app.authorize_reassessment would raise 23505 for the row nobody can use.
--
-- The fix is a third state. `superseded_at` retires a grant without pretending
-- it was spent: consumed_at still means "a reassessment was opened with this",
-- which is what consumed_attempt_id documents, and the CHECK keeps the two
-- states apart. The row itself stays, with its educator, its reason and its
-- timestamps, because it is an audit record.
--
-- The retirement is a trigger rather than a line in app.authorize_reassessment,
-- so every path is covered: that function, app.reset_diagnostic — which writes
-- its own grant for the retake — and anything added later. Only an *expired*
-- open grant is retired. An unexpired one still collides, which is the original
-- intent: granting twice must not stockpile retries.

alter table app.reassessment_authorizations
  add column if not exists superseded_at timestamptz;

comment on column app.reassessment_authorizations.superseded_at is
  'When this grant was retired unspent because it had expired and the educator issued a replacement. A retired grant is kept as an audit record and can never be consumed.';

alter table app.reassessment_authorizations
  drop constraint if exists reassessment_authorizations_not_both_spent_and_retired;

alter table app.reassessment_authorizations
  add constraint reassessment_authorizations_not_both_spent_and_retired
    check (superseded_at is null or consumed_at is null);

-- The open slot now means unspent and unretired.
drop index if exists app.reassessment_authorizations_one_open_key;

create unique index reassessment_authorizations_one_open_key
  on app.reassessment_authorizations (student_id, assessment_id)
  where consumed_at is null and superseded_at is null;

-- ---------------------------------------------------------------------------
-- Retire an expired grant when its replacement arrives
-- ---------------------------------------------------------------------------
-- Invoker rights on purpose. `authenticated` holds no INSERT on this table, so
-- every insert already arrives from inside a SECURITY DEFINER function or from
-- service_role, and the trigger runs with rights enough to retire the row.
-- Keeping it invoker keeps the reviewed SECURITY DEFINER list in
-- supabase/tests/010_foundation_structure_test.sql unchanged.
create or replace function app.retire_expired_reassessment_authorizations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update app.reassessment_authorizations
  set superseded_at = pg_catalog.now()
  where reassessment_authorizations.student_id = new.student_id
    and reassessment_authorizations.assessment_id = new.assessment_id
    and reassessment_authorizations.consumed_at is null
    and reassessment_authorizations.superseded_at is null
    and reassessment_authorizations.expires_at is not null
    and reassessment_authorizations.expires_at <= pg_catalog.now();

  return new;
end;
$$;

comment on function app.retire_expired_reassessment_authorizations() is
  'BEFORE INSERT trigger routine that retires an expired, unspent grant for the same learner and assessment, so the one-open-grant index cannot be held by a grant nobody may use.';

revoke all on function app.retire_expired_reassessment_authorizations() from public;

drop trigger if exists retire_expired_reassessment_authorizations
  on app.reassessment_authorizations;

create trigger retire_expired_reassessment_authorizations
  before insert on app.reassessment_authorizations
  for each row
  execute function app.retire_expired_reassessment_authorizations();

-- ---------------------------------------------------------------------------
-- app.start_assessment_attempt
-- ---------------------------------------------------------------------------
-- Two changes from 20260910072000.
--
-- The candidate grant is now locked with `for update` before the attempt is
-- inserted. Without the lock, two callers racing one grant both reached the
-- insert, and the loser collided on assessment_attempts_one_in_progress_key —
-- surfacing as 23505, a fault, rather than as the refusal this rule is about.
-- With the lock the loser waits at the grant, and once the winner commits
-- PostgreSQL re-checks the predicate against the updated row, finds it spent,
-- and the loser refuses before it has written anything.
--
-- A retired grant is excluded alongside a spent or expired one.
create or replace function app.start_assessment_attempt(p_assessment_id uuid)
returns app.assessment_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_version integer;
  v_authorization_id uuid;
  v_consumed uuid;
  v_row app.assessment_attempts;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may attempt an assessment' using errcode = '42501';
  end if;

  select assessments.version into v_version
  from app.assessments
  where assessments.assessment_id = p_assessment_id
    and assessments.status = 'published'::app.publication_status;

  if v_version is null then
    raise exception 'No such published assessment' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.assessment_attempts
  where assessment_attempts.student_id = v_student_id
    and assessment_attempts.assessment_id = p_assessment_id
    and assessment_attempts.status = 'in_progress'::app.attempt_status;

  if found then
    -- Resuming the open attempt. This is not a second sitting, so it spends no
    -- authorization.
    return v_row;
  end if;

  -- A finished sitting of this assessment means any further one is a
  -- reassessment, and a reassessment is the educator's decision to make.
  if exists (
    select 1
    from app.assessment_attempts
    where assessment_attempts.student_id = v_student_id
      and assessment_attempts.assessment_id = p_assessment_id
      and assessment_attempts.status in (
        'submitted'::app.attempt_status, 'scored'::app.attempt_status)
  ) then
    select reassessment_authorizations.authorization_id into v_authorization_id
    from app.reassessment_authorizations
    where reassessment_authorizations.student_id = v_student_id
      and reassessment_authorizations.assessment_id = p_assessment_id
      and reassessment_authorizations.consumed_at is null
      and reassessment_authorizations.superseded_at is null
      and (reassessment_authorizations.expires_at is null
           or reassessment_authorizations.expires_at > now())
    order by reassessment_authorizations.granted_at
    limit 1
    for update;

    if v_authorization_id is null then
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  insert into app.assessment_attempts (assessment_id, student_id, assessment_version)
  values (p_assessment_id, v_student_id, v_version)
  returning * into v_row;

  if v_authorization_id is not null then
    update app.reassessment_authorizations
    set consumed_at = now(),
        consumed_attempt_id = v_row.attempt_id
    where reassessment_authorizations.authorization_id = v_authorization_id
      and reassessment_authorizations.consumed_at is null
    returning reassessment_authorizations.authorization_id into v_consumed;

    if v_consumed is null then
      -- The lock above makes this unreachable in practice. It stays because the
      -- guarantee is the compare-and-set, not the lock: if the grant is spent,
      -- nothing is opened on it, and the attempt inserted just above rolls back
      -- with this refusal.
      raise exception 'A reassessment needs an authorization' using errcode = '42501';
    end if;
  end if;

  -- A learner who has begun the diagnostic is no longer "not started".
  update app.student_profiles
  set diagnostic_status = 'in_progress'::app.diagnostic_status
  where student_profiles.student_id = v_student_id
    and student_profiles.diagnostic_status = 'not_started'::app.diagnostic_status
    and exists (
      select 1 from app.assessments
      where assessments.assessment_id = p_assessment_id
        and assessments.assessment_type = 'diagnostic'::app.assessment_type
    );

  return v_row;
end;
$$;

comment on function app.start_assessment_attempt(uuid) is
  'Opens or resumes the calling learner''s attempt at a published assessment. A sitting after a finished one requires an unexpired, unspent, unretired reassessment authorization, which it locks and then spends in the same transaction.';
