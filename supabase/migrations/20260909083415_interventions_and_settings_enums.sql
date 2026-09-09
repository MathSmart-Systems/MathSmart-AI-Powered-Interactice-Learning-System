-- MathSmart Phase 4 — interventions and reporting, part 1 of 4.
--
-- The intervention vocabularies, taken verbatim from the frozen canonical enum
-- table, including their casing: severity is upper case, lifecycle status and
-- type are Title Case with spaces.

create type app.intervention_severity as enum ('HIGH', 'MEDIUM', 'LOW');

comment on type app.intervention_severity is
  'Canonical intervention severity.';

create type app.intervention_status as enum ('Needs Intervention', 'In Progress', 'Resolved');

comment on type app.intervention_status is
  'Canonical intervention lifecycle: a case moves from Needs Intervention through In Progress to Resolved.';

create type app.intervention_type as enum (
  'Additional Exercise',
  'One-on-One Remediation',
  'Additional Module',
  'Teacher Consultation',
  'Other'
);

comment on type app.intervention_type is
  'Canonical typed action a Teacher/Administrator records against a case.';

-- ---------------------------------------------------------------------------
-- Configuration safety helper
-- ---------------------------------------------------------------------------
-- Deployment secrets and the Groq model selection are `.env` values and must
-- never reach app.system_settings. Wrapping the check in an explicitly
-- IMMUTABLE function lets the table enforce it as a CHECK constraint, rather
-- than leaving it to a code review to notice.
create function app.looks_like_a_secret(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select value::text ~* '(api[_-]?key|secret|password|access[_-]?token|service[_-]?role|groq[_-]?model)';
$$;

comment on function app.looks_like_a_secret(jsonb) is
  'True when a configuration value looks like a credential, a token or a model selection. Used to keep deployment secrets out of app.system_settings.';

revoke all on function app.looks_like_a_secret(jsonb) from public;
grant execute on function app.looks_like_a_secret(jsonb) to authenticated, service_role;
