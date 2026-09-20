-- MathSmart — the purge ledger is the elevated backend's alone.
--
-- app.purge_operations records a permanent student purge before the first row
-- is deleted, so a failure between the database and Supabase Auth can be
-- resumed rather than guessed at. It therefore holds the one mapping that
-- outlives the learner, and nothing a browser holds a token for may reach it.

begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

-- ---------------------------------------------------------------------------
-- It exists, and holds what it needs to resume
-- ---------------------------------------------------------------------------
select has_table('app', 'purge_operations', 'app.purge_operations exists');

select has_column('app', 'purge_operations', 'student_id', 'it records which learner');
select has_column('app', 'purge_operations', 'auth_user_id',
                  'it records the Auth account still owed a deletion');
select has_column('app', 'purge_operations', 'requested_by',
                  'it records who asked for this');
select has_column('app', 'purge_operations', 'confirmation_fingerprint',
                  'it records a fingerprint of the typed learner id');
select has_column('app', 'purge_operations', 'state', 'it records how far it got');
select has_column('app', 'purge_operations', 'failure_code',
                  'it records why a step stopped');

-- ---------------------------------------------------------------------------
-- It holds no identity of its own
-- ---------------------------------------------------------------------------
select hasnt_column('app', 'purge_operations', 'full_name',
                    'the ledger never holds a learner name');
select hasnt_column('app', 'purge_operations', 'email',
                    'the ledger never holds an email address');

-- ---------------------------------------------------------------------------
-- The ids are deliberately not foreign keys
-- ---------------------------------------------------------------------------
-- A reference would either block the deletion this row describes or vanish
-- along with it, and a resumed purge would then have nothing to work from.
select is(
  (select count(*)
   from pg_constraint
   join pg_class on pg_class.oid = pg_constraint.conrelid
   join pg_namespace on pg_namespace.oid = pg_class.relnamespace
   where pg_namespace.nspname = 'app'
     and pg_class.relname = 'purge_operations'
     and pg_constraint.contype = 'f'),
  0::bigint,
  'the ledger carries no foreign key, so it outlives the rows it names'
);

-- ---------------------------------------------------------------------------
-- Reachable only from the elevated backend
-- ---------------------------------------------------------------------------
select ok(
  not has_table_privilege('anon', 'app.purge_operations', 'select'),
  'anon cannot read the purge ledger'
);
select ok(
  not has_table_privilege('authenticated', 'app.purge_operations', 'select'),
  'authenticated cannot read the purge ledger'
);
select ok(
  not has_table_privilege('authenticated', 'app.purge_operations', 'insert'),
  'authenticated cannot open a purge'
);
select ok(
  has_table_privilege('service_role', 'app.purge_operations', 'insert'),
  'the elevated backend can open a purge'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'app.purge_operations'::regclass),
  'row level security is on, so a grant added by mistake still lands behind it'
);

-- ---------------------------------------------------------------------------
-- The learner's own rows stay closed to deletion by authenticated
-- ---------------------------------------------------------------------------
-- Purge runs as service_role precisely because these are shut. If either of
-- these ever opened, a purge-shaped operation would be reachable from a
-- browser session rather than from the audited elevated boundary.
select ok(
  not has_table_privilege('authenticated', 'app.user_profiles', 'delete'),
  'authenticated cannot delete a user profile'
);
select ok(
  not has_table_privilege('authenticated', 'app.student_profiles', 'delete'),
  'authenticated cannot delete a student profile'
);

-- ---------------------------------------------------------------------------
-- The audit trail stays immutable, and the one exception is narrow
-- ---------------------------------------------------------------------------
-- Purging a learner has to remove their own audit records: actor_user_id
-- references user_profiles ON DELETE RESTRICT, so those rows block the
-- deletion of the profile and name the learner in a trail that outlives them.
-- That is done through a function, so the table itself needs no DELETE grant
-- and the invariant below still holds.
select ok(
  not has_table_privilege('service_role', 'app.audit_events'::regclass, 'delete'),
  'Not even service_role can erase an audit record directly'
);
select ok(
  not has_table_privilege('service_role', 'app.audit_events'::regclass, 'update'),
  'Not even service_role can alter an audit record'
);

select has_function('app', 'purge_learner_audit_trail', array['uuid'],
                    'the narrow audit deletion exists as a function');

select ok(
  (select pg_proc.prosecdef
   from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app' and pg_proc.proname = 'purge_learner_audit_trail'),
  'it is SECURITY DEFINER, which is what lets it reach a table nobody may delete from'
);
select ok(
  (select pg_proc.proconfig::text like '%search_path%'
   from pg_proc join pg_namespace on pg_namespace.oid = pg_proc.pronamespace
   where pg_namespace.nspname = 'app' and pg_proc.proname = 'purge_learner_audit_trail'),
  'its search_path is pinned'
);

select ok(
  not has_function_privilege('anon', 'app.purge_learner_audit_trail(uuid)', 'execute'),
  'anon cannot purge an audit trail'
);
select ok(
  not has_function_privilege('authenticated', 'app.purge_learner_audit_trail(uuid)', 'execute'),
  'authenticated cannot purge an audit trail — a browser session never reaches this'
);
select ok(
  has_function_privilege('service_role', 'app.purge_learner_audit_trail(uuid)', 'execute'),
  'the isolated elevated backend can'
);

select * from finish();
rollback;
