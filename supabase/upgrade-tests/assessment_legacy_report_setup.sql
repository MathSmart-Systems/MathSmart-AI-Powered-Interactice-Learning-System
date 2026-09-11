-- Fixture loaded after migrations through 20260911150000 and before Gate 3.
-- It represents a scored attempt created before result_payload/question snapshots.

insert into auth.users (id, email)
values ('71000000-0000-4000-8000-000000000001', 'legacy.report@mathsmart.test');

insert into app.user_profiles (user_id, full_name, email, role)
values ('71000000-0000-4000-8000-000000000001', 'Legacy Report Learner',
        'legacy.report@mathsmart.test', 'student');

insert into app.student_profiles (student_id, user_id, learner_id, grade_id)
values ('72000000-0000-4000-8000-000000000001',
        '71000000-0000-4000-8000-000000000001', 'LRN-LEGACY1',
        (select grade_id from app.grade_levels where level = 6));

insert into app.competencies
  (competency_id, code, grade_id, domain, name, status)
values
  ('73000000-0000-4000-8000-000000000001', 'LEGACY-REPORT-1',
   (select grade_id from app.grade_levels where level = 6),
   'Numbers', 'Migration-time competency label', 'published'),
  ('73000000-0000-4000-8000-000000000002', 'LEGACY-REPORT-2',
   (select grade_id from app.grade_levels where level = 6),
   'Geometry', 'Second migration-time label', 'published');

insert into app.learning_modules
  (module_id, competency_id, title, estimated_minutes, learning_objective,
   short_explanation, status, order_index)
values ('74000000-0000-4000-8000-000000000001',
        '73000000-0000-4000-8000-000000000002', 'Mutable current path module',
        15, 'Objective.', 'Explanation.', 'published', 1);

insert into app.questions
  (question_id, competency_id, question_type, prompt, answer_key, status)
values
  ('75000000-0000-4000-8000-000000000001',
   '73000000-0000-4000-8000-000000000001', 'number_input',
   'Current mutable question one?', '1'::jsonb, 'published'),
  ('75000000-0000-4000-8000-000000000002',
   '73000000-0000-4000-8000-000000000002', 'number_input',
   'Current mutable question two?', '2'::jsonb, 'published');

insert into app.assessments
  (assessment_id, grade_id, title, assessment_type, status, duration_minutes)
values ('76000000-0000-4000-8000-000000000001',
        (select grade_id from app.grade_levels where level = 6),
        'Legacy report diagnostic', 'diagnostic', 'published', 20);

insert into app.assessment_attempts
  (attempt_id, assessment_id, student_id, status, overall_score, started_at,
   submitted_at, assessment_version, assessment_type_snapshot,
   assessment_grade_id_snapshot, assessment_payload, result_payload)
values ('77000000-0000-4000-8000-000000000001',
        '76000000-0000-4000-8000-000000000001',
        '72000000-0000-4000-8000-000000000001', 'scored', 50.00,
        '2026-09-01 08:00:00+00', '2026-09-01 08:20:00+00', 1, 'diagnostic',
        (select grade_id from app.grade_levels where level = 6),
        '{"id":"76000000-0000-4000-8000-000000000001","title":"Legacy report diagnostic","type":"diagnostic","duration_minutes":20}'::jsonb,
        null);

insert into app.assessment_responses
  (attempt_id, question_id, answer, is_correct)
values
  ('77000000-0000-4000-8000-000000000001',
   '75000000-0000-4000-8000-000000000001', '"1"'::jsonb, true),
  ('77000000-0000-4000-8000-000000000001',
   '75000000-0000-4000-8000-000000000002', '"9"'::jsonb, false);

insert into app.competency_results
  (attempt_id, competency_id, raw_score, max_score, percentage, mastery_band)
values
  ('77000000-0000-4000-8000-000000000001',
   '73000000-0000-4000-8000-000000000001', 1, 1, 100.00, 'Mastered'),
  ('77000000-0000-4000-8000-000000000001',
   '73000000-0000-4000-8000-000000000002', 0, 1, 0.00, 'Needs Improvement');

insert into app.learning_path_items
  (student_id, competency_id, module_id, priority, reason, status)
values ('72000000-0000-4000-8000-000000000001',
        '73000000-0000-4000-8000-000000000002',
        '74000000-0000-4000-8000-000000000001', 1,
        'Mutable current path must not enter historical report.', 'available');
