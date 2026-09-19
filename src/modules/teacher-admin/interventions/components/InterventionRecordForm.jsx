"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Send } from "lucide-react";

import {
  INTERVENTION_TEMPLATES,
  INTERVENTION_TYPES,
  isReopen,
  nextStatusOptions,
} from "../utils/intervention-helpers";

const TYPE_BUTTON_STYLE = {
  selected: "bg-primary text-primary-foreground border-primary shadow-xs",
  idle: "bg-card text-foreground border-input hover:bg-muted/40",
};

/**
 * Records a teacher remediation action on the open case.
 *
 * The teacher always decides. The form sends only the educator's choices
 * (type, notes, status) to the API, which enforces the lifecycle in the
 * database. No advisory AI text is sent or promised here.
 *
 * @param {object} props
 * @param {(payload: object) => Promise<object|null>} props.onSubmit
 *   Receives `{interventionType, educatorNotes, status, reopenReason}`.
 * @param {string|null|undefined} props.currentStatus
 * @param {boolean} [props.saving]
 * @param {string|null} [props.error]
 */
export function InterventionRecordForm({ onSubmit, currentStatus, saving = false, error = null }) {
  const [interventionType, setInterventionType] = useState(INTERVENTION_TYPES[1] ?? "One-on-One Remediation");
  const [educatorNotes, setEducatorNotes] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  const statusOptions = useMemo(() => nextStatusOptions(currentStatus), [currentStatus]);
  const reopening = isReopen(newStatus);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFieldErrors({});

    const errors = {};
    if (!educatorNotes.trim()) {
      errors.educatorNotes = "Add your remediation notes before recording this action.";
    }
    if (reopening && reopenReason.trim().length < 3) {
      errors.reopenReason = "A reopened case needs a short reason (at least 3 characters).";
    }
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    const saved = await onSubmit({
      interventionType,
      educatorNotes: educatorNotes.trim(),
      status: newStatus || null,
      reopenReason: reopening ? reopenReason.trim() : null,
    });

    if (saved) {
      setSubmitted(true);
      setEducatorNotes("");
      setNewStatus("");
      setReopenReason("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div>
        <h4 className="font-display text-base font-semibold text-foreground">Record teacher remediation action</h4>
        <p className="text-xs text-muted-foreground">
          Document the pedagogical strategy you will execute and the educator notes.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-xs font-bold text-foreground">Intervention strategy type</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {INTERVENTION_TYPES.map((type) => {
            const selected = interventionType === type;
            return (
              <button
                key={type}
                type="button"
                aria-pressed={selected}
                onClick={() => setInterventionType(type)}
                className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                  selected ? TYPE_BUTTON_STYLE.selected : TYPE_BUTTON_STYLE.idle
                }`}
              >
                {type}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label htmlFor="intervention-teacher-notes" className="text-xs font-bold text-foreground">
            Teacher remediation notes
          </label>
          <label className="sr-only" htmlFor="intervention-note-template">Notes template</label>
          <select
            id="intervention-note-template"
            value=""
            onChange={(event) => {
              if (!event.target.value) return;
              const template = INTERVENTION_TEMPLATES.find((item) => item.name === event.target.value);
              if (template) setEducatorNotes(template.notes);
            }}
            className="h-8 rounded-md border border-input bg-card px-2.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="" className="bg-card text-foreground">Apply a notes template…</option>
            {INTERVENTION_TEMPLATES.map((template) => (
              <option key={template.name} value={template.name} className="bg-card text-foreground">
                {template.name}
              </option>
            ))}
          </select>
        </div>
        <textarea
          id="intervention-teacher-notes"
          rows={3}
          required
          value={educatorNotes}
          onChange={(event) => setEducatorNotes(event.target.value)}
          placeholder="e.g. Conducted a 15-minute guided number-line session. The learner demonstrated sign-rule comprehension."
          aria-invalid={Boolean(fieldErrors.educatorNotes)}
          aria-describedby={fieldErrors.educatorNotes ? "intervention-teacher-notes-error" : undefined}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        {fieldErrors.educatorNotes ? (
          <p id="intervention-teacher-notes-error" className="mt-1 text-xs text-destructive" role="alert">
            {fieldErrors.educatorNotes}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="intervention-new-status" className="mb-1 block text-xs font-bold text-foreground">
          Case status
        </label>
        <select
          id="intervention-new-status"
          value={newStatus}
          onChange={(event) => {
            setNewStatus(event.target.value);
            setReopenReason("");
          }}
          className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:max-w-60"
        >
          <option value="">Keep current status</option>
          {statusOptions.map((status) => (
            <option key={status} value={status} className="bg-card text-foreground">
              {status === "In Progress" && currentStatus === "Resolved" ? "Reopen (In Progress)" : status}
            </option>
          ))}
        </select>
        {statusOptions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground" id="intervention-new-status-hint">
            This case has no further lifecycle transition.
          </p>
        ) : null}
      </div>

      {reopening ? (
        <div>
          <label htmlFor="intervention-reopen-reason" className="mb-1 block text-xs font-bold text-foreground">
            Reason for reopening
          </label>
          <textarea
            id="intervention-reopen-reason"
            rows={2}
            required
            value={reopenReason}
            onChange={(event) => setReopenReason(event.target.value)}
            aria-invalid={Boolean(fieldErrors.reopenReason)}
            aria-describedby={fieldErrors.reopenReason ? "intervention-reopen-reason-error" : undefined}
            className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {fieldErrors.reopenReason ? (
            <p id="intervention-reopen-reason-error" className="mt-1 text-xs text-destructive" role="alert">
              {fieldErrors.reopenReason}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {submitted ? (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
          <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-600" />
          Intervention recorded to the learner&apos;s case history.
        </p>
      ) : null}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-xs transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-60"
        >
          <Send aria-hidden="true" className="size-3.5" />
          {saving ? "Recording..." : "Record intervention"}
        </button>
      </div>
    </form>
  );
}