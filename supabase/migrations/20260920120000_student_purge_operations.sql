-- MathSmart — the durable ledger behind a permanent student purge.
--
-- Purging a learner spans two systems that cannot share a transaction: the
-- application database owns the record graph, Supabase Auth owns the identity.
-- The graph has to go first, because app.audit_events.actor_user_id references
-- app.user_profiles ON DELETE RESTRICT — deleting the Auth account first would
-- cascade into user_profiles and be refused.
--
-- That ordering creates the problem this table exists to solve. Once the
-- application rows are committed away, nothing is left that maps a student_id
-- to the Auth user_id, so a retry after a failed Auth deletion would have no
-- way to finish the job — and would have to either guess or lie. The ledger is
-- written *before* the first deletion and outlives every row the operation
-- removes, so a resumed purge knows exactly which Auth account is still owed.
--
-- What it deliberately does not hold: no name, no email, no token, no
-- credential, and no free-text error. Only ids, a confirmation fingerprint, a
-- state, and a short failure code.

-- ---------------------------------------------------------------------------
-- app.purge_state
-- ---------------------------------------------------------------------------
create type app.purge_state as enum (
  'pending',
  'database_deleted',
  'storage_deleted',
  'completed'
);

comment on type app.purge_state is
  'How far a permanent purge has progressed. A retry resumes from this, never from the start.';

-- ---------------------------------------------------------------------------
-- app.purge_operations
-- ---------------------------------------------------------------------------
create table app.purge_operations (
  purge_operation_id uuid primary key default gen_random_uuid(),

  -- No foreign keys on the next three columns, and that is the point. These
  -- name rows this operation is in the business of destroying: a reference
  -- would either block the deletion or disappear along with it, and a resumed
  -- purge would find nothing to work from. The ledger has to outlive its own
  -- subject.
  student_id uuid not null,
  auth_user_id uuid not null,
  requested_by uuid not null,

  -- A hash of the learner id the teacher typed, never the learner id itself
  -- and never their name. A retry re-types the same value and is checked
  -- against this; nothing here identifies the learner to a reader.
  confirmation_fingerprint text not null,

  state app.purge_state not null default 'pending',

  -- A short slug, never an exception message: an error string can carry a
  -- connection string, a statement, or a credential.
  failure_code text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,

  constraint purge_operations_fingerprint_shape
    check (confirmation_fingerprint ~ '^[0-9a-f]{64}$'),
  constraint purge_operations_failure_code_shape
    check (failure_code is null or failure_code ~ '^[a-z][a-z0-9_]{0,63}$'),

  -- Completion is one fact said two ways, so the two must agree.
  constraint purge_operations_completed_is_consistent
    check (
      (state = 'completed' and completed_at is not null)
      or (state <> 'completed' and completed_at is null)
    ),
  constraint purge_operations_completed_not_before_created
    check (completed_at is null or completed_at >= created_at),
  constraint purge_operations_updated_not_before_created
    check (updated_at >= created_at)
);

comment on table app.purge_operations is
  'Durable record of a permanent student purge, written before the first deletion so a failed run can be resumed rather than guessed at. Holds ids, a confirmation fingerprint, a state and a failure slug — never a name, an email or a credential.';
comment on column app.purge_operations.auth_user_id is
  'The Supabase Auth account still owed a deletion. Survives the profile rows precisely so a retry can find it.';
comment on column app.purge_operations.confirmation_fingerprint is
  'SHA-256 of the learner id the teacher typed. Lets a retry prove it means the same learner without storing one.';

-- At most one unfinished purge per learner, so a resumed request finds exactly
-- one operation to continue. Finished ones may accumulate.
create unique index purge_operations_one_unfinished_key
  on app.purge_operations (student_id)
  where state <> 'completed';

create index purge_operations_auth_user_idx on app.purge_operations (auth_user_id);
create index purge_operations_state_idx on app.purge_operations (state);

create trigger purge_operations_set_updated_at
  before update on app.purge_operations
  for each row
  execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Reachable only from the isolated elevated backend
-- ---------------------------------------------------------------------------
-- No grant to anon or authenticated, at all. Row Level Security is enabled
-- with no policy, so the table stays closed even if a grant is ever added by
-- mistake; service_role bypasses RLS and is the only way in.
alter table app.purge_operations enable row level security;

revoke all on table app.purge_operations from public;
revoke all on table app.purge_operations from anon;
revoke all on table app.purge_operations from authenticated;

grant select, insert, update on table app.purge_operations to service_role;

-- The schema-wide rule: every table in `app` carries the restrictive
-- account-status policy, and this one is no exception. It can only ever deny,
-- and `authenticated` holds no grant here to be denied on — but the invariant
-- is worth more unbroken than it is worth carving a hole in, and a future
-- grant added by mistake now lands behind this as well as behind RLS.
create policy purge_operations_requires_an_active_account
  on app.purge_operations
  as restrictive
  for all
  to authenticated
  using ((select app.is_active_account()))
  with check ((select app.is_active_account()));
