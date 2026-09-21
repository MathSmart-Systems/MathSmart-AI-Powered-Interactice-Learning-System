-- MathSmart Phase 5 — advisory text attached to an intervention case.
--
-- The promise these tests hold to is that storing a suggestion is not the same
-- act as taking one. Advisory text lands in its own columns, carries its own
-- provenance, and leaves severity, status, type and the educator's own notes
-- exactly as the teacher left them. Everything else follows from that: only a
-- Teacher/Administrator may attach or dismiss, an archived case accepts
-- neither, an empty suggestion is refused rather than stored, and both
-- decisions leave an audit row behind.

begin;

create extension if not exists pgtap with schema extensions;

select * from no_plan();

-- ---------------------------------------------------------------------------
-- The grants, and who may run these functions at all
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege(
    'anon',
    'app.attach_intervention_advice(uuid, text, text, text, text, numeric, jsonb, text)',
    'execute'
  ),
  'anon cannot attach advisory text'
);

select ok(
  not has_function_privilege('anon', 'app.clear_intervention_advice(uuid, text)', 'execute'),
  'anon cannot dismiss advisory text'
);

select ok(
  has_function_privilege(
    'authenticated',
    'app.attach_intervention_advice(uuid, text, text, text, text, numeric, jsonb, text)',
    'execute'
  ),
  'authenticated may call the attach function, which then checks the role itself'
);

-- ---------------------------------------------------------------------------
-- Fixture
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('ad000000-0000-4000-8000-0000000000a1', 'advice.adviser@mathsmart.test'),
  ('bd000000-0000-4000-8000-0000000000b1', 'advice.learner@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role) values
  ('ad000000-0000-4000-8000-0000000000a1', 'Advice Adviser',
   'advice.adviser@mathsmart.test', 'teacher_admin'),
  ('bd000000-0000-4000-8000-0000000000b1', 'Advice Learner',
   'advice.learner@mathsmart.test', 'student');

insert into app.teacher_admin_profiles
  (teacher_admin_id, user_id, employee_id, school_name, division_name)
values
  ('4d000000-0000-4000-8000-000000000001', 'ad000000-0000-4000-8000-0000000000a1',
   'EMP-D001', 'Sample School', 'Sample Division');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id) values
  ('5d000000-0000-4000-8000-000000000001', 'bd000000-0000-4000-8000-0000000000b1',
   'LRN-D00001', (select grade_id from app.grade_levels where level = 6));

insert into app.competencies (competency_id, code, grade_id, domain, name, status) values
  ('cd000000-0000-4000-8000-000000000001', 'ADVICE-COMP-1',
   (select grade_id from app.grade_levels where level = 6),
   'Number Sense', 'Advice competency', 'published');

insert into app.interventions
  (intervention_id, student_id, teacher_admin_id, competency_id,
   severity, status, intervention_type, educator_notes)
values
  ('1d000000-0000-4000-8000-000000000001',
   '5d000000-0000-4000-8000-000000000001',
   '4d000000-0000-4000-8000-000000000001',
   'cd000000-0000-4000-8000-000000000001',
   'HIGH', 'In Progress', 'One-on-One Remediation',
   'Teacher wrote this. Nothing generated may replace it.');

-- ---------------------------------------------------------------------------
-- A learner may neither attach nor dismiss
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"bd000000-0000-4000-8000-0000000000b1","role":"authenticated","app_metadata":{"role":"student"}}';
set local role authenticated;

select throws_ok(
  $$ select app.attach_intervention_advice(
       '1d000000-0000-4000-8000-000000000001',
       'Let me write my own advice.', null, 'groq', 'a-model', null, null
     ) $$,
  '42501',
  'Only a Teacher/Administrator may attach advisory text to an intervention',
  'A learner cannot attach advisory text to a case about themselves'
);

select throws_ok(
  $$ select app.clear_intervention_advice('1d000000-0000-4000-8000-000000000001') $$,
  '42501',
  'Only a Teacher/Administrator may dismiss advisory text on an intervention',
  'A learner cannot dismiss advisory text'
);

-- ---------------------------------------------------------------------------
-- The educator attaches a suggestion
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims = '{"sub":"ad000000-0000-4000-8000-0000000000a1","role":"authenticated","app_metadata":{"role":"teacher_admin"}}';
set local role authenticated;

select is(
  (select attached.ai_insight
   from app.attach_intervention_advice(
     '1d000000-0000-4000-8000-000000000001',
     'A number line would make the regrouping step visible.',
     'Try one guided drill before the next activity.',
     'groq', 'a-configured-model', 0.5,
     '{"gap": "She drops the decimal point.",
       "strategies": ["Use a number line first.", "Ask her to estimate."],
       "scaffold": "A place-value chart with the point in red.",
       "next_check": "Two similar problems on Friday."}'::jsonb
   ) as attached),
  'A number line would make the regrouping step visible.',
  'The attached insight is returned as it was stored'
);

-- The plan is the readable half: a teacher takes one strategy from it and
-- leaves the rest, which they cannot do with a paragraph.
select is(
  (select interventions.ai_plan->>'gap' from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'She drops the decimal point.',
  'The structured plan is stored beside the text'
);

select is(
  (select jsonb_array_length(interventions.ai_plan->'strategies') from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  2,
  'Each strategy stays its own item rather than being run together into prose'
);

select throws_ok(
  $$ update app.interventions
     set ai_plan = '"not an object"'::jsonb
     where intervention_id = '1d000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'A plan that is not an object is refused'
);

select is(
  (select interventions.ai_recommendation from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'Try one guided drill before the next activity.',
  'The remediation suggestion is stored beside the insight, in its own column'
);

select is(
  (select interventions.ai_provider || ' ' || interventions.ai_model from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'groq a-configured-model',
  'Provenance is stored, so advisory text is never mistaken for an authored fact'
);

select isnt(
  (select interventions.ai_generated_at from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  null,
  'The moment the advice was generated is recorded'
);

-- The whole point: nothing deterministic and nothing the teacher wrote moved.
select is(
  (select interventions.status from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'In Progress'::app.intervention_status,
  'Storing a suggestion does not advance the case'
);

select is(
  (select interventions.severity from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'HIGH'::app.intervention_severity,
  'Storing a suggestion does not change severity'
);

select is(
  (select interventions.intervention_type from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'One-on-One Remediation'::app.intervention_type,
  'Storing a suggestion does not change the recorded action'
);

select is(
  (select interventions.educator_notes from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'Teacher wrote this. Nothing generated may replace it.',
  'Generated text never overwrites what the educator wrote'
);

select is(
  (select count(*)::int from app.audit_events
   where audit_events.target_id = '1d000000-0000-4000-8000-000000000001'
     and audit_events.action = 'intervention.advice_attached'),
  1,
  'Attaching advice leaves exactly one audit row'
);

select ok(
  (select not (audit_events.details::text ilike '%a-configured-model%')
   from app.audit_events
   where audit_events.target_id = '1d000000-0000-4000-8000-000000000001'
     and audit_events.action = 'intervention.advice_attached'),
  'The configured model name stays out of the audit trail'
);

-- ---------------------------------------------------------------------------
-- An empty suggestion is not a suggestion
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select app.attach_intervention_advice(
       '1d000000-0000-4000-8000-000000000001', '   ', null, 'groq', 'a-model', null, null
     ) $$,
  '23514',
  'Advisory text cannot be empty',
  'Blank advisory text is refused rather than stored'
);

select is(
  (select interventions.ai_insight from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'A number line would make the regrouping step visible.',
  'The refused write left the previous suggestion in place'
);

-- ---------------------------------------------------------------------------
-- Regenerating replaces only the advisory columns
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select app.attach_intervention_advice(
       '1d000000-0000-4000-8000-000000000001',
       'Second thoughts: start with place value.', null, 'groq', 'a-configured-model', null,
       '{"gap": "Place value first.", "strategies": []}'::jsonb
     ) $$,
  'A teacher may ask again and replace the previous suggestion'
);

select is(
  (select jsonb_array_length(interventions.ai_plan->'strategies') from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  0,
  'A regenerated plan replaces the previous one rather than merging with it'
);

select is(
  (select interventions.ai_recommendation from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  null,
  'A regenerated suggestion replaces the previous one rather than merging with it'
);

select is(
  (select interventions.educator_notes from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'Teacher wrote this. Nothing generated may replace it.',
  'Regenerating still leaves the educator''s own notes alone'
);

-- ---------------------------------------------------------------------------
-- Dismissing
-- ---------------------------------------------------------------------------
select is(
  (select cleared.ai_insight
   from app.clear_intervention_advice('1d000000-0000-4000-8000-000000000001') as cleared),
  null,
  'Dismissing removes the advisory text'
);

select is(
  (select coalesce(interventions.ai_provider, '') || coalesce(interventions.ai_model, '')
   from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  '',
  'Dismissing removes the provenance with the text it described'
);

select is(
  (select interventions.ai_plan from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  null,
  'Dismissing takes the plan away with the text'
);

select is(
  (select interventions.status::text || '|' || coalesce(interventions.educator_notes, '')
   from app.interventions
   where interventions.intervention_id = '1d000000-0000-4000-8000-000000000001'),
  'In Progress|Teacher wrote this. Nothing generated may replace it.',
  'Dismissing changes neither the lifecycle nor the educator notes'
);

select is(
  (select count(*)::int from app.audit_events
   where audit_events.target_id = '1d000000-0000-4000-8000-000000000001'
     and audit_events.action = 'intervention.advice_dismissed'),
  1,
  'Dismissing advice is audited as the teacher decision it is'
);

-- ---------------------------------------------------------------------------
-- An archived case accepts neither
-- ---------------------------------------------------------------------------
select ok(
  (select app.archive_intervention('1d000000-0000-4000-8000-000000000001')),
  'The case is archived for the next two checks'
);

select throws_ok(
  $$ select app.attach_intervention_advice(
       '1d000000-0000-4000-8000-000000000001', 'Too late.', null, 'groq', 'a-model', null, null
     ) $$,
  'P0002',
  'No such intervention',
  'An archived case cannot be given new advisory text'
);

select throws_ok(
  $$ select app.clear_intervention_advice('1d000000-0000-4000-8000-000000000001') $$,
  'P0002',
  'No such intervention',
  'An archived case cannot have advisory text dismissed'
);

select throws_ok(
  $$ select app.attach_intervention_advice(
       '1d000000-0000-4000-8000-0000000000ff', 'Nobody.', null, 'groq', 'a-model', null, null
     ) $$,
  'P0002',
  'No such intervention',
  'A case that does not exist cannot be given advisory text'
);

select * from finish();

rollback;
