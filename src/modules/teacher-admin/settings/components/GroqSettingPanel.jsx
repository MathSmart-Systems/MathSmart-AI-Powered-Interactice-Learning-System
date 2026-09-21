"use client";

import { Bot, Loader2, LockKeyhole } from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";
import { GROQ_STATUS, GROQ_STATUS_TEXT } from "../utils/groq-status.js";

function StatusRow({ label, value, testId }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 py-2 sm:block sm:py-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold text-foreground sm:mt-1" data-testid={testId}>
        {value}
      </dd>
    </div>
  );
}

/**
 * The optional Groq features, and the one switch a teacher controls.
 *
 * Two separate things decide whether Groq answers: the server, which a
 * deployment sets up and nobody changes from here, and the classroom setting,
 * which this switch changes. Both are shown, separately, so "why is it off?"
 * has an answer on screen. The switch saves on its own, straight away, with
 * its own pending state; it is not part of the classroom rules form.
 *
 * Nothing here shows or accepts the API key. The model name appears only as a
 * read-only fact about the server, never beside generated text.
 *
 * @param {object} props
 * @param {ReturnType<import("../utils/groq-status.js").readGroqStatus>} props.groq
 * @param {boolean} props.saving
 * @param {(enabled: boolean) => void} props.onChange
 */
export function GroqSettingPanel({ groq, saving, onChange }) {
  const text = GROQ_STATUS_TEXT[groq.status] ?? GROQ_STATUS_TEXT[GROQ_STATUS.UNAVAILABLE];

  return (
    <section
      aria-labelledby="groq-setting-heading"
      className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-5"
    >
      <div className="flex items-center gap-2 border-b border-border pb-3">
        <Bot className="size-5 text-primary" aria-hidden="true" />
        <div>
          <h2 id="groq-setting-heading" className="font-display text-xl font-semibold tracking-tight text-foreground">
            AI suggestions (Groq)
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Optional wording help: hints, feedback, teaching notes and report summaries. Scores,
            mastery, reports and interventions never depend on it.
          </p>
        </div>
      </div>

      <dl className="grid divide-y divide-border rounded-lg border border-border bg-muted/30 px-4 py-1 sm:grid-cols-3 sm:gap-4 sm:divide-y-0 sm:py-3">
        <StatusRow
          label="Server"
          value={groq.serverConfigured ? "Configured" : "Not configured"}
          testId="groq-server"
        />
        <StatusRow
          label="Classroom setting"
          value={groq.classroomEnabled ? "On" : "Off"}
          testId="groq-classroom"
        />
        <StatusRow label="AI suggestions" value={text.label} testId="groq-status" />
      </dl>

      <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-4">
        <div className="min-w-0 space-y-0.5">
          <label htmlFor={FIELD_IDS.GROQ_TOGGLE} className="block text-sm font-semibold text-foreground">
            Allow AI suggestions
          </label>
          <p id={`${FIELD_IDS.GROQ_TOGGLE}-detail`} className="text-xs text-muted-foreground">
            {text.detail}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Loader2
            aria-hidden="true"
            className={`size-4 text-muted-foreground animate-spin motion-reduce:animate-none ${saving ? "" : "invisible"}`}
          />
          <button
            id={FIELD_IDS.GROQ_TOGGLE}
            type="button"
            role="switch"
            aria-checked={groq.classroomEnabled}
            aria-describedby={`${FIELD_IDS.GROQ_TOGGLE}-detail`}
            aria-busy={saving}
            disabled={saving}
            onClick={() => onChange(!groq.classroomEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-wait disabled:opacity-70 motion-reduce:transition-none ${
              groq.classroomEnabled ? "border-primary bg-primary" : "border-border bg-muted"
            }`}
          >
            <span className="sr-only">{groq.classroomEnabled ? "On" : "Off"}</span>
            <span
              aria-hidden="true"
              className={`inline-block size-4.5 rounded-full bg-card shadow-xs transition-transform motion-reduce:transition-none ${
                groq.classroomEnabled ? "translate-x-5.5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 border-t border-border pt-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-center gap-1.5">
          <LockKeyhole className="size-3.5 shrink-0" aria-hidden="true" />
          The Groq API key is kept on the server. It cannot be viewed or edited here.
        </p>
        {groq.model ? (
          <p>
            Model (set on the server):{" "}
            <span className="font-medium text-foreground" data-testid="groq-model">
              {groq.model}
            </span>
          </p>
        ) : null}
      </div>
    </section>
  );
}
