-- Freeze readable reports for scored attempts created before result_payload.
--
-- Only stored attempt and competency-result evidence is authoritative here.
-- Historical learning paths and question snapshots are not reconstructed.

begin;

create or replace function app.backfill_legacy_assessment_reports()
returns integer
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_attempt record;
  v_payload jsonb;
  v_updated integer := 0;
  v_result_count integer;
  v_max_score integer;
  v_raw_score integer;
  v_rows integer;
begin
  for v_attempt in
    select assessment_attempts.attempt_id,
           assessment_attempts.assessment_id,
           assessment_attempts.status,
           assessment_attempts.overall_score,
           assessment_attempts.started_at,
           assessment_attempts.submitted_at,
           assessment_attempts.result_payload
    from app.assessment_attempts
    where assessment_attempts.status = 'scored'::app.attempt_status
      and assessment_attempts.result_payload is null
    order by assessment_attempts.attempt_id
    for update
  loop
    select count(*)::integer,
           coalesce(sum(competency_results.raw_score), 0)::integer,
           coalesce(sum(competency_results.max_score), 0)::integer
    into v_result_count, v_raw_score, v_max_score
    from app.competency_results
    where competency_results.attempt_id = v_attempt.attempt_id;

    if v_result_count < 1
       or v_max_score < 1
       or v_attempt.overall_score is distinct from app.percentage_for(v_raw_score, v_max_score) then
      continue;
    end if;

    select jsonb_build_object(
      'attempt_id', v_attempt.attempt_id,
      'assessment_id', v_attempt.assessment_id,
      'status', v_attempt.status,
      'overall_score', v_attempt.overall_score,
      'started_at', v_attempt.started_at,
      'submitted_at', v_attempt.submitted_at,
      'competency_results', coalesce(results.items, '[]'::jsonb),
      'recommended_learning_path', '[]'::jsonb,
      'next_action', jsonb_build_object(
        'type', 'dashboard',
        'label', 'Return to Dashboard'
      )
    )
    into v_payload
    from app.assessment_attempts as attempts
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'competency_id', cr.competency_id,
        'competency_name', c.name,
        'raw_score', cr.raw_score,
        'max_score', cr.max_score,
        'percentage', cr.percentage,
        'mastery_band', cr.mastery_band
      ) order by cr.percentage, cr.competency_id) as items
      from app.competency_results as cr
      join app.competencies as c
        on c.competency_id = cr.competency_id
      where cr.attempt_id = attempts.attempt_id
    ) as results on true
    where attempts.attempt_id = v_attempt.attempt_id;

    update app.assessment_attempts
    set result_payload = v_payload
    where assessment_attempts.attempt_id = v_attempt.attempt_id
      and assessment_attempts.status = 'scored'::app.attempt_status
      and assessment_attempts.result_payload is null;

    get diagnostics v_rows = row_count;
    v_updated := v_updated + v_rows;
  end loop;

  return v_updated;
end;
$$;

create or replace function app.prevent_assessment_result_payload_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.result_payload is not null then
    if new.result_payload is distinct from old.result_payload then
      raise exception 'Assessment result payloads are immutable'
        using errcode = '55000';
    end if;
  elsif new.result_payload is not null
        and jsonb_typeof(new.result_payload) <> 'object' then
    raise exception 'Assessment result payload must be an object'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger assessment_attempts_result_payload_immutable
  before update of result_payload on app.assessment_attempts
  for each row
  execute function app.prevent_assessment_result_payload_changes();

comment on column app.assessment_attempts.result_payload is
  'Immutable deterministic report. Legacy rows are backfilled only from stored attempt and competency evidence; historical paths and question snapshots are not inferred.';
comment on function app.backfill_legacy_assessment_reports() is
  'Backfills scored attempts missing result_payload from stored deterministic evidence only. Inconsistent rows remain null; historical path and question snapshots remain unavailable.';
comment on function app.prevent_assessment_result_payload_changes() is
  'Allows the authoritative null-to-report write, then rejects report replacement or removal.';

revoke all on function app.backfill_legacy_assessment_reports()
  from public, anon, authenticated, service_role;
revoke all on function app.prevent_assessment_result_payload_changes()
  from public, anon, authenticated, service_role;

select app.backfill_legacy_assessment_reports();

commit;
