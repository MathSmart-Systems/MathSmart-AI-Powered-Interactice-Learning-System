-- MathSmart Phase 5b — account status enforcement.
--
-- A Supabase access token stays cryptographically valid until it expires.
-- Signing a user out does not retract a token already issued, and neither does
-- deleting them. Suspending an account therefore cannot be implemented by
-- revoking a session: for as long as an outstanding token lives, the holder
-- still presents a perfectly valid signature.
--
-- The authoritative answer lives here instead, and is consulted on every
-- request rather than at sign-in. `app.user_profiles.account_status` is that
-- answer, and the restrictive policies below apply it to every table.
--
-- Why restrictive rather than editing thirty permissive policies
-- -------------------------------------------------------------
-- A RESTRICTIVE policy is ANDed with whatever the permissive policies decided.
-- One per table states the rule once — "in addition to everything else, the
-- account must be active" — without rewriting rules that are already correct,
-- and with no chance of weakening one by accident while editing it.
--
-- Why this one function is SECURITY DEFINER
-- -----------------------------------------
-- Every other function in this schema is SECURITY INVOKER and stays that way.
-- This one cannot be: it is consulted by a policy on `app.user_profiles`
-- itself, and an invoker-rights function reading that table from inside its own
-- policy is infinite recursion, which Postgres refuses at runtime.
--
-- It is hardened as the documentation requires for a reviewed exception. It
-- lives in a schema that is not exposed through the Data API, its `search_path`
-- is pinned so every name is schema-qualified, its default PUBLIC execute grant
-- is revoked, it takes no parameter, and it reads exactly one row — the
-- caller's own, keyed by `auth.uid()` — returning a boolean. There is no input
-- to probe with and no other row it can reach.

create function app.is_active_account()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from app.user_profiles
    where user_profiles.user_id = (select auth.uid())
      and user_profiles.account_status = 'active'::app.account_status
  );
$$;

comment on function app.is_active_account() is
  'True when the caller has an application profile whose account_status is active. SECURITY DEFINER because a policy on the very table it reads consults it; it takes no parameter and can only ever see the caller''s own row.';

revoke all on function app.is_active_account() from public;
grant execute on function app.is_active_account() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- One restrictive policy per table
-- ---------------------------------------------------------------------------
-- ANDed with the permissive policies, so a suspended or archived account loses
-- every path at once — including a repository reached directly, with no
-- application authorization check in front of it.

create policy user_profiles_requires_an_active_account
  on app.user_profiles
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy grade_levels_requires_an_active_account
  on app.grade_levels
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy teacher_admin_profiles_requires_an_active_account
  on app.teacher_admin_profiles
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy sections_requires_an_active_account
  on app.sections
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy student_profiles_requires_an_active_account
  on app.student_profiles
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy competencies_requires_an_active_account
  on app.competencies
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy learning_modules_requires_an_active_account
  on app.learning_modules
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy questions_requires_an_active_account
  on app.questions
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy assessments_requires_an_active_account
  on app.assessments
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy assessment_questions_requires_an_active_account
  on app.assessment_questions
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy activities_requires_an_active_account
  on app.activities
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy activity_questions_requires_an_active_account
  on app.activity_questions
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy assessment_attempts_requires_an_active_account
  on app.assessment_attempts
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy assessment_responses_requires_an_active_account
  on app.assessment_responses
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy competency_results_requires_an_active_account
  on app.competency_results
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy learning_path_items_requires_an_active_account
  on app.learning_path_items
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy student_module_progress_requires_an_active_account
  on app.student_module_progress
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy activity_attempts_requires_an_active_account
  on app.activity_attempts
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy competency_progress_requires_an_active_account
  on app.competency_progress
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy interventions_requires_an_active_account
  on app.interventions
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy system_settings_requires_an_active_account
  on app.system_settings
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy audit_events_requires_an_active_account
  on app.audit_events
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy idempotency_keys_requires_an_active_account
  on app.idempotency_keys
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy activity_responses_requires_an_active_account
  on app.activity_responses
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));

create policy reassessment_authorizations_requires_an_active_account
  on app.reassessment_authorizations
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));
