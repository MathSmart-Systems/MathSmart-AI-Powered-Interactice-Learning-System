-- MathSmart Phase 5 — intervention cases and the audit trail.
--
-- app.interventions and app.audit_events are SELECT-only for `authenticated`,
-- which is deliberate: a case is an educator's record about a learner, and an
-- audit row is evidence. Neither should be writable by whoever is being
-- described, and an audit row that the actor can edit is not evidence at all.
--
-- So both are written through functions. The educator comes from auth.uid(),
-- the lifecycle transitions are enforced here rather than trusted from the
-- request, and every mutation writes its own audit row in the same transaction.
-- Nothing here consults Groq; the advisory columns are only ever filled by the
-- caller passing text that Groq already produced, and no status, severity or
-- transition depends on them.

-- ---------------------------------------------------------------------------
-- app.record_audit_event
-- ---------------------------------------------------------------------------
-- Sensitive Teacher/Administrator actions that are not themselves a row change
-- — an export, for instance — still have to leave a trace.
create function app.record_audit_event(
  p_action text,
  p_target_type text,
  p_target_id uuid default null,
  p_request_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_audit_event_id uuid;
begin
  if not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may record an audit event'
      using errcode = '42501';
  end if;

  insert into app.audit_events
    (actor_user_id, actor_role, action, target_type, target_id, request_id, details)
  values (
    v_actor, 'teacher_admin'::app.user_role, p_action, p_target_type, p_target_id,
    p_request_id, coalesce(p_details, '{}'::jsonb)
  )
  returning audit_events.audit_event_id into v_audit_event_id;

  return v_audit_event_id;
end;
$$;

comment on function app.record_audit_event(text, text, uuid, text, jsonb) is
  'Records one Teacher/Administrator action in the audit trail. The actor comes from auth.uid(), and the details are still subject to the secret-shaped-value check on the table.';

revoke all on function app.record_audit_event(text, text, uuid, text, jsonb) from public;
grant execute on function app.record_audit_event(text, text, uuid, text, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.open_intervention
-- ---------------------------------------------------------------------------
-- Creating a manual case, or recording the first action on one the system
-- opened automatically. A learner and a competency have at most one live case,
-- so a second call records against the existing one rather than duplicating it.
create function app.open_intervention(
  p_student_id uuid,
  p_competency_id uuid,
  p_severity app.intervention_severity,
  p_intervention_type app.intervention_type,
  p_educator_notes text default null,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_teacher_admin_id uuid;
  v_actor uuid := (select auth.uid());
  v_row app.interventions;
begin
  select teacher_admin_profiles.teacher_admin_id into v_teacher_admin_id
  from app.teacher_admin_profiles
  where teacher_admin_profiles.user_id = v_actor;

  if v_teacher_admin_id is null or not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may record an intervention'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from app.student_profiles
    where student_profiles.student_id = p_student_id
  ) then
    raise exception 'No such learner' using errcode = 'P0002';
  end if;

  select * into v_row
  from app.interventions
  where interventions.student_id = p_student_id
    and interventions.competency_id = p_competency_id
    and interventions.archived_at is null
    and interventions.status <> 'Resolved'::app.intervention_status
  for update;

  if found then
    -- Recording an action on an existing case, which is what the route
    -- contract asks for: it moves to In Progress and takes the educator's own
    -- words, rather than a second case appearing in the queue.
    update app.interventions
    set severity = p_severity,
        intervention_type = p_intervention_type,
        educator_notes = coalesce(p_educator_notes, interventions.educator_notes),
        status = 'In Progress'::app.intervention_status,
        teacher_admin_id = v_teacher_admin_id,
        recorded_at = now()
    where interventions.intervention_id = v_row.intervention_id
    returning * into v_row;
  else
    insert into app.interventions
      (student_id, teacher_admin_id, competency_id, severity, status,
       intervention_type, educator_notes)
    values (
      p_student_id, v_teacher_admin_id, p_competency_id, p_severity,
      'In Progress'::app.intervention_status, p_intervention_type, p_educator_notes
    )
    returning * into v_row;
  end if;

  perform app.record_audit_event(
    'intervention.recorded',
    'intervention',
    v_row.intervention_id,
    p_request_id,
    jsonb_build_object(
      'student_id', p_student_id,
      'competency_id', p_competency_id,
      'severity', p_severity::text,
      'intervention_type', p_intervention_type::text,
      'status', v_row.status::text
    )
  );

  return v_row;
end;
$$;

comment on function app.open_intervention(uuid, uuid, app.intervention_severity, app.intervention_type, text, text) is
  'Records a Teacher/Administrator intervention: a new case, or the first action on one already open for that learner and competency. Audited in the same transaction.';

revoke all on function app.open_intervention(uuid, uuid, app.intervention_severity, app.intervention_type, text, text) from public;
grant execute on function app.open_intervention(uuid, uuid, app.intervention_severity, app.intervention_type, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.update_intervention
-- ---------------------------------------------------------------------------
-- The documented lifecycle is Needs Intervention → In Progress → Resolved, and
-- a resolved case may reopen to In Progress with a required reason. The
-- transitions are enforced here, so a request cannot move a case somewhere the
-- workflow does not allow.
create function app.update_intervention(
  p_intervention_id uuid,
  p_severity app.intervention_severity default null,
  p_intervention_type app.intervention_type default null,
  p_educator_notes text default null,
  p_status app.intervention_status default null,
  p_reopen_reason text default null,
  p_request_id text default null
)
returns app.interventions
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_current app.intervention_status;
  v_next app.intervention_status;
  v_row app.interventions;
begin
  if not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may update an intervention'
      using errcode = '42501';
  end if;

  select interventions.status into v_current
  from app.interventions
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null
  for update;

  if v_current is null then
    raise exception 'No such intervention' using errcode = 'P0002';
  end if;

  v_next := coalesce(p_status, v_current);

  if v_next <> v_current then
    if v_current = 'Needs Intervention'::app.intervention_status
       and v_next <> 'In Progress'::app.intervention_status then
      raise exception 'A case must be taken up before it can be resolved'
        using errcode = '23514';
    end if;

    if v_current = 'Resolved'::app.intervention_status then
      if v_next <> 'In Progress'::app.intervention_status then
        raise exception 'A resolved case may only reopen to In Progress'
          using errcode = '23514';
      end if;
      if p_reopen_reason is null or btrim(p_reopen_reason) = '' then
        raise exception 'Reopening a resolved case needs a reason'
          using errcode = '23514';
      end if;
    end if;
  end if;

  update app.interventions
  set severity = coalesce(p_severity, interventions.severity),
      intervention_type = coalesce(p_intervention_type, interventions.intervention_type),
      educator_notes = coalesce(p_educator_notes, interventions.educator_notes),
      status = v_next,
      reopen_reason = case
        when v_current = 'Resolved'::app.intervention_status
         and v_next = 'In Progress'::app.intervention_status
          then p_reopen_reason
        else interventions.reopen_reason
      end,
      resolved_at = case
        when v_next = 'Resolved'::app.intervention_status
          then coalesce(interventions.resolved_at, now())
        else null
      end,
      recorded_at = now()
  where interventions.intervention_id = p_intervention_id
  returning * into v_row;

  perform app.record_audit_event(
    'intervention.updated',
    'intervention',
    p_intervention_id,
    p_request_id,
    jsonb_build_object(
      'from_status', v_current::text,
      'to_status', v_next::text,
      'severity', v_row.severity::text,
      'intervention_type', v_row.intervention_type::text,
      'notes_changed', p_educator_notes is not null
    )
  );

  return v_row;
end;
$$;

comment on function app.update_intervention(uuid, app.intervention_severity, app.intervention_type, text, app.intervention_status, text, text) is
  'Updates an intervention within the documented lifecycle. Reopening a resolved case requires a reason. Every change is audited.';

revoke all on function app.update_intervention(uuid, app.intervention_severity, app.intervention_type, text, app.intervention_status, text, text) from public;
grant execute on function app.update_intervention(uuid, app.intervention_severity, app.intervention_type, text, app.intervention_status, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- app.archive_intervention
-- ---------------------------------------------------------------------------
-- An incorrect or duplicate case is archived, never deleted: the audit trail
-- has to survive the mistake.
create function app.archive_intervention(p_intervention_id uuid, p_request_id text default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_rows integer;
begin
  if not app.is_teacher_admin() then
    raise exception 'Only a Teacher/Administrator may archive an intervention'
      using errcode = '42501';
  end if;

  update app.interventions
  set archived_at = now()
  where interventions.intervention_id = p_intervention_id
    and interventions.archived_at is null;

  get diagnostics v_rows = row_count;

  if v_rows = 0 then
    return false;
  end if;

  perform app.record_audit_event(
    'intervention.archived', 'intervention', p_intervention_id, p_request_id, '{}'::jsonb
  );

  return true;
end;
$$;

comment on function app.archive_intervention(uuid, text) is
  'Archives an intervention case and audits the action. Cases are never deleted.';

revoke all on function app.archive_intervention(uuid, text) from public;
grant execute on function app.archive_intervention(uuid, text) to authenticated, service_role;
