-- MathSmart Phase 6 — one path item per learner and module.
--
-- app.learning_path_items already forbids two items for the same learner and
-- competency, and two items at the same position. It says nothing about the
-- module, and the module is what the catalogue joins on: modules/learning_modules
-- reads a learner's path status by (student_id, module_id). Two items pointing
-- at one module would return that module twice in `GET /modules` and inflate
-- `total_items`, because the count is `count(*)` over the same join.
--
-- Today nothing produces that state: app.submit_assessment_attempt picks the
-- first published module of each competency, and a module belongs to exactly one
-- competency, so the existing per-competency constraint happens to imply
-- per-module uniqueness. That is a property of the current rebuild, not of the
-- schema, and a second recommender or a module moved between competencies would
-- end it quietly — as a duplicated row in a list rather than as an error.
--
-- The constraint is added rather than relied upon by inference, so the join is
-- guaranteed by the table instead of by the behaviour of one function.
--
-- Any pre-existing duplicate has to go first. Deployment applies this to a
-- database whose learning_path_items is empty, so the delete is a formality
-- there, but it must be correct wherever this runs: it keeps the lowest
-- priority for each learner and module, which is the one a learner is shown
-- first, and removes the rest.

delete from app.learning_path_items
where learning_path_items.path_item_id in (
  select duplicates.path_item_id
  from (
    select
      learning_path_items.path_item_id,
      row_number() over (
        partition by learning_path_items.student_id, learning_path_items.module_id
        order by learning_path_items.priority, learning_path_items.created_at
      ) as position
    from app.learning_path_items
  ) as duplicates
  where duplicates.position > 1
);

alter table app.learning_path_items
  add constraint learning_path_items_student_module_key
    unique (student_id, module_id);

comment on constraint learning_path_items_student_module_key on app.learning_path_items is
  'One item per learner and module. The catalogue joins a learner''s path status on (student_id, module_id), so a second item for the same module would duplicate that module in the listing and inflate its total.';
