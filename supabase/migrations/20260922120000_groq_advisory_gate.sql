-- Whether the classroom setting allows Groq advice. One boolean, for anyone.
--
-- Every advisory call asks this first, and some of those calls are made on a
-- learner's behalf: a hint in an activity, feedback after a diagnostic. A
-- learner cannot read `app.system_settings` — the table is Teacher/Administrator
-- only, and it should stay that way — so the API used to answer the question by
-- reaching past its own gateway for an unscoped pooled connection. That
-- bypassed the actor context every other query runs under, and any error on
-- that path quietly read as "off".
--
-- What the gate needs is one yes or no, so this returns one yes or no. It
-- takes no argument, reveals no other setting, no author and no timestamp,
-- and answers the same thing to every active caller.
--
-- `features.groq_advisory` is the setting. The two older keys are still read,
-- after it, so a database that only ever stored one of them keeps the value it
-- has; nothing writes them any more. With nothing stored the answer is false:
-- a fresh deployment starts with Groq off until a Teacher/Administrator turns
-- it on. A suspended or archived account is refused here as it is everywhere.

create or replace function app.groq_advisory_enabled()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_value jsonb;
begin
  if not app.is_active_account() then
    return false;
  end if;

  select system_settings.setting_value
  into v_value
  from app.system_settings
  where system_settings.setting_key in (
    'features.groq_advisory',
    'features.groq_enabled',
    'features.groq_feedback_enabled'
  )
  order by case system_settings.setting_key
    when 'features.groq_advisory' then 1
    when 'features.groq_enabled' then 2
    else 3
  end
  limit 1;

  return coalesce(jsonb_typeof(v_value) = 'boolean' and v_value = 'true'::jsonb, false);
end;
$$;

comment on function app.groq_advisory_enabled() is
  'True only when the stored classroom setting allows optional Groq advice. One boolean for any active caller; never another setting, an author or a timestamp. False when nothing is stored.';

revoke all on function app.groq_advisory_enabled() from public;
revoke all on function app.groq_advisory_enabled() from anon;
grant execute on function app.groq_advisory_enabled() to authenticated, service_role;
