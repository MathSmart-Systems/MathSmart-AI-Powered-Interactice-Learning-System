-- Keep learner progression and activity prerequisites in the database. The
-- existing function signatures and grants are preserved by CREATE OR REPLACE.

create or replace function app.save_module_progress(
  p_module_id uuid,
  p_completed_section_ids text[],
  p_last_section_id text default null
)
returns app.student_module_progress
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_sections text[];
  v_recognised text[];
  v_percentage numeric(5,2);
  v_complete boolean;
  v_priority integer;
  v_row app.student_module_progress;
begin
  -- Serialize this learner's saves so a late autosave cannot reverse a
  -- completion or unlock a later path item out of order.
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account())
  for update;

  if v_student_id is null then
    raise exception 'Only a learner may save module progress'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.learning_modules
    where learning_modules.module_id = p_module_id
      and app.can_read_content(learning_modules.status)
  ) then
    raise exception 'No such learning module' using errcode = 'P0002';
  end if;

  select priority into v_priority
  from app.learning_path_items
  where student_id = v_student_id and module_id = p_module_id;

  if v_priority is not null and exists (
    select 1 from app.learning_path_items
    where student_id = v_student_id and module_id = p_module_id
      and status = 'locked'::app.path_item_status
  ) then
    raise exception 'This learning module is still locked' using errcode = 'MS001';
  end if;

  v_sections := app.module_section_ids(p_module_id);
  select coalesce(array_agg(section), '{}'::text[]) into v_recognised
  from unnest(v_sections) as section
  where section = any (coalesce(p_completed_section_ids, '{}'::text[]));

  v_percentage := round(
    (cardinality(v_recognised)::numeric * 100) / greatest(cardinality(v_sections), 1)
  );
  v_complete := cardinality(v_sections) > 0
            and cardinality(v_recognised) = cardinality(v_sections);

  insert into app.student_module_progress as progress
    (student_id, module_id, completion_percentage, is_complete,
     completed_section_ids, last_section_id, started_at, completed_at)
  values (
    v_student_id, p_module_id, v_percentage, v_complete,
    to_jsonb(v_recognised), p_last_section_id, now(),
    case when v_complete then now() else null end
  )
  on conflict (student_id, module_id) do update set
    completion_percentage = case when progress.is_complete
      then progress.completion_percentage else excluded.completion_percentage end,
    is_complete = progress.is_complete or excluded.is_complete,
    completed_section_ids = case when progress.is_complete
      then progress.completed_section_ids else excluded.completed_section_ids end,
    last_section_id = case when progress.is_complete
      then progress.last_section_id
      else coalesce(excluded.last_section_id, progress.last_section_id) end,
    started_at = coalesce(progress.started_at, excluded.started_at),
    completed_at = case
      when progress.is_complete then progress.completed_at
      when excluded.is_complete then now()
      else null
    end
  returning * into v_row;

  if v_priority is not null then
    update app.learning_path_items
    set status = case
      when v_row.is_complete then 'completed'::app.path_item_status
      when v_row.completion_percentage > 0 then 'in_progress'::app.path_item_status
      else 'available'::app.path_item_status
    end
    where student_id = v_student_id and module_id = p_module_id
      and status is distinct from case
        when v_row.is_complete then 'completed'::app.path_item_status
        when v_row.completion_percentage > 0 then 'in_progress'::app.path_item_status
        else 'available'::app.path_item_status
      end;

    if v_row.is_complete then
      update app.learning_path_items
      set status = 'available'::app.path_item_status
      where student_id = v_student_id
        and priority = (
          select min(priority) from app.learning_path_items
          where student_id = v_student_id and priority > v_priority
            and status = 'locked'::app.path_item_status
        );
    end if;
  end if;

  return v_row;
end;
$$;

comment on function app.save_module_progress(uuid, text[], text) is
  'Saves the calling learner''s module progress, keeps completion final, and advances their ordered learning path when a module is complete.';

create or replace function app.start_activity_attempt(p_activity_id uuid)
returns app.activity_attempts
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_module_id uuid;
  v_version integer;
  v_row app.activity_attempts;
begin
  select student_profiles.student_id into v_student_id
  from app.student_profiles
  where student_profiles.user_id = (select auth.uid())
    and (select app.is_active_account());

  if v_student_id is null then
    raise exception 'Only a learner may attempt an activity' using errcode = '42501';
  end if;

  select activities.module_id, activities.version into v_module_id, v_version
  from app.activities
  where activities.activity_id = p_activity_id
    and activities.status = 'published'::app.publication_status;

  if v_version is null then
    raise exception 'No such published activity' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from app.student_module_progress
    where student_module_progress.student_id = v_student_id
      and student_module_progress.module_id = v_module_id
      and student_module_progress.is_complete
  ) then
    raise exception 'Complete the linked module before starting its activity'
      using errcode = 'MS001';
  end if;

  select * into v_row
  from app.activity_attempts
  where activity_attempts.student_id = v_student_id
    and activity_attempts.activity_id = p_activity_id
    and activity_attempts.status = 'in_progress'::app.attempt_status;

  if found then
    return v_row;
  end if;

  insert into app.activity_attempts
    (student_id, activity_id, attempt_number, activity_version)
  values (
    v_student_id,
    p_activity_id,
    1 + (
      select count(*)
      from app.activity_attempts as earlier
      where earlier.student_id = v_student_id
        and earlier.activity_id = p_activity_id
    ),
    v_version
  )
  returning * into v_row;

  return v_row;
end;
$$;

comment on function app.start_activity_attempt(uuid) is
  'Starts or resumes the calling learner''s activity only after their linked module is complete. The attempt number counts their own earlier attempts.';
