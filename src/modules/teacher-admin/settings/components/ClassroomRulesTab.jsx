"use client";

import React from "react";
import {
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Info,
  Loader2,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TriangleAlert,
} from "lucide-react";

import {
  FIELD_IDS,
  MAX_INTERVENTION_ATTEMPTS,
  MAX_PASSING_THRESHOLD,
  MIN_INTERVENTION_ATTEMPTS,
  MIN_PASSING_THRESHOLD,
} from "../utils/constants.js";

function formatSettingKey(key) {
  switch (key) {
    case "thresholds.activity_pass_percentage":
      return "Default Activity Pass Threshold";
    case "intervention.unsuccessful_attempts":
      return "Intervention Alert Trigger";
    case "features.groq_advisory":
    case "features.groq_enabled":
    case "features.groq_feedback_enabled":
      return "AI Student Hints";
    default:
      return key.replace(/^[a-z_]+\./, "").replace(/_/g, " ");
  }
}

function formatAuditTime(isoString) {
  if (!isoString) return "Recently";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "Recently";
    return new Intl.DateTimeFormat("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(d);
  } catch {
    return "Recently";
  }
}

export function ClassroomRulesTab({
  passingThreshold,
  setPassingThreshold,
  autoInterventionAttempts,
  setAutoInterventionAttempts,
  groqFeatureEnabled,
  setGroqFeatureEnabled,
  groqEnvEnabled,
  groqModel,
  fieldErrors,
  setFieldErrors,
  saving,
  saveError,
  saveSuccess,
  notice,
  setNotice,
  onSubmit,
  onRestoreDefaults,
  isAuditLogOpen,
  onToggleAuditLog,
  auditEvents,
  auditLoading,
  auditError,
  onRefreshAuditEvents,
}) {
  return (
    <div className="space-y-8 animate-in fade-in duration-200">
      {/* Quick Visual Guide */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-start gap-3 transition-colors">
          <Target className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground block">Activities Baseline</span>
            <span className="text-xs text-muted-foreground leading-snug block">
              Pre-fills new activities with <strong>{passingThreshold}% pass threshold</strong>.
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-start gap-3 transition-colors">
          <TriangleAlert className="size-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground block">Interventions Desk</span>
            <span className="text-xs text-muted-foreground leading-snug block">
              Alerts you when a student fails <strong>{autoInterventionAttempts} times</strong>.
            </span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card shadow-xs flex items-start gap-3 transition-colors">
          <Sparkles className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-0.5">
            <span className="text-xs font-semibold text-foreground block">AI Assistant</span>
            <span className="text-xs text-muted-foreground leading-snug block">
              Helps students with friendly hints when they get stuck.
            </span>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-medium flex items-center gap-2"
        >
          <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
          <span>{saveError}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="p-4 rounded-lg bg-muted/60 border border-border text-foreground text-xs font-medium flex items-center justify-between animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <Info className="size-4 text-primary shrink-0" aria-hidden="true" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-primary hover:underline text-xs font-medium cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-2 animate-in fade-in duration-200"
        >
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Changes saved successfully! Your classroom settings are now active.</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Section 1: Passing Scores & Interventions */}
        <div className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-6 transition-colors">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <Sliders className="size-5 text-primary" aria-hidden="true" />
            <div>
              <h2 className="text-xl font-semibold text-foreground font-display tracking-tight">
                Classroom Rules & Passing Criteria
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set how students pass math activities and when you should be alerted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Setting 1: Passing Score Slider */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor={FIELD_IDS.PASSING_THRESHOLD}
                    className="text-xs font-semibold text-foreground block"
                  >
                    Default Activity Pass Threshold
                  </label>
                  <span className="text-xs text-muted-foreground">Default for newly created activities (DepEd: 75%)</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-foreground font-mono-math">
                    {passingThreshold}%
                  </span>
                </div>
              </div>

              <input
                id={FIELD_IDS.PASSING_THRESHOLD}
                type="range"
                min={MIN_PASSING_THRESHOLD}
                max={MAX_PASSING_THRESHOLD}
                value={passingThreshold}
                disabled={saving}
                onChange={(e) => {
                  setPassingThreshold(Number(e.target.value));
                  if (fieldErrors.passingThreshold) {
                    setFieldErrors((prev) => ({ ...prev, passingThreshold: undefined }));
                  }
                }}
                className="w-full accent-primary cursor-pointer h-2 bg-secondary border border-border/60 rounded-lg disabled:opacity-50"
                aria-invalid={Boolean(fieldErrors.passingThreshold)}
              />

              <div className="pt-2 border-t border-border space-y-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  How newly authored activities are evaluated:
                </span>
                <div className="grid grid-cols-2 gap-2 text-center text-xs">
                  <div className="p-2 rounded bg-muted/60 border border-border text-muted-foreground">
                    Below {passingThreshold}%<br />
                    <span className="font-semibold text-destructive">Needs Practice</span>
                  </div>
                  <div className="p-2 rounded bg-primary/10 border border-primary/20 text-primary">
                    {passingThreshold}%–100%<br />
                    <span className="font-semibold">Passing Zone / Mastered</span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-snug">
                Pre-fills the passing threshold when authoring new practice activities. Changing this value does not retroactively change existing activities or past student attempts.
              </p>
              {fieldErrors.passingThreshold && (
                <p className="text-xs text-destructive font-medium">
                  {fieldErrors.passingThreshold}
                </p>
              )}
            </div>

            {/* Setting 2: Intervention Trigger Slider */}
            <div className="p-4 rounded-lg bg-muted/30 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor={FIELD_IDS.INTERVENTION_ATTEMPTS}
                    className="text-xs font-semibold text-foreground block"
                  >
                    Auto-Intervention Alert Trigger
                  </label>
                  <span className="text-xs text-muted-foreground">Unsuccessful tries before teacher alert</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-foreground font-mono-math">
                    {autoInterventionAttempts} {autoInterventionAttempts === 1 ? "Try" : "Tries"}
                  </span>
                </div>
              </div>

              <input
                id={FIELD_IDS.INTERVENTION_ATTEMPTS}
                type="range"
                min={MIN_INTERVENTION_ATTEMPTS}
                max={MAX_INTERVENTION_ATTEMPTS}
                value={autoInterventionAttempts}
                disabled={saving}
                onChange={(e) => {
                  setAutoInterventionAttempts(Number(e.target.value));
                  if (fieldErrors.autoInterventionAttempts) {
                    setFieldErrors((prev) => ({ ...prev, autoInterventionAttempts: undefined }));
                  }
                }}
                className="w-full accent-primary cursor-pointer h-2 bg-secondary border border-border/60 rounded-lg disabled:opacity-50"
                aria-invalid={Boolean(fieldErrors.autoInterventionAttempts)}
              />

              <div className="pt-2 border-t border-border space-y-1.5">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                  Alert urgency level:
                </span>
                <div className="flex justify-between text-xs px-1 text-muted-foreground">
                  <span className={autoInterventionAttempts === 1 ? "text-destructive font-semibold" : ""}>
                    1 (Immediate)
                  </span>
                  <span className={autoInterventionAttempts === 2 ? "text-primary font-semibold" : ""}>
                    2 (Recommended)
                  </span>
                  <span className={autoInterventionAttempts >= 4 ? "text-foreground font-semibold" : ""}>
                    5 (Relaxed)
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground leading-snug">
                When a student fails an activity <strong>{autoInterventionAttempts} {autoInterventionAttempts === 1 ? "time" : "times"} in a row</strong>, they are automatically placed on your <strong>Interventions Desk</strong> for teacher guidance.
              </p>
              {fieldErrors.autoInterventionAttempts && (
                <p className="text-xs text-destructive font-medium">
                  {fieldErrors.autoInterventionAttempts}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: AI Teaching Assistant */}
        <div className="bg-card p-6 sm:p-8 rounded-xl border border-border shadow-xs space-y-5 transition-colors">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Bot className="size-5 text-primary" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-semibold text-foreground font-display tracking-tight">
                  AI Teaching Assistant (Groq)
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Controls automated hints and encouragement for students.
                </p>
              </div>
            </div>
            <span
              className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                groqEnvEnabled
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {groqEnvEnabled ? "● AI Connected" : "○ AI Off"}
            </span>
          </div>

          <div className="p-3.5 rounded-lg bg-muted/40 border border-border flex items-start gap-2.5">
            <ShieldCheck className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">100% Guaranteed Math Accuracy:</strong> The AI is <u>never</u> allowed to grade answers or calculate student scores. All math is scored by strict computer formulas. The AI only writes helpful, encouraging words.
            </div>
          </div>

          <label
            htmlFor={FIELD_IDS.GROQ_TOGGLE}
            className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/40 transition-colors cursor-pointer"
          >
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">
                  Show AI Hints & Feedback to Students
                </span>
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    groqFeatureEnabled
                      ? "bg-primary/10 text-primary border border-primary/20"
                      : "bg-muted text-muted-foreground border border-border"
                  }`}
                >
                  {groqFeatureEnabled ? "Turned ON" : "Turned OFF"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {groqFeatureEnabled
                  ? "When a student answers wrong, the AI gives them gentle hints to help them learn without giving away the answer."
                  : "AI hints are paused. Students will only see standard pre-written textbook tips."}
              </p>
            </div>
            <input
              id={FIELD_IDS.GROQ_TOGGLE}
              type="checkbox"
              checked={groqFeatureEnabled}
              disabled={saving}
              onChange={(e) => setGroqFeatureEnabled(e.target.checked)}
              className="rounded accent-primary border-border size-5 cursor-pointer shrink-0 disabled:opacity-50"
            />
          </label>

          <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Configured AI Model:</span>
            <span className="font-mono-math text-xs font-semibold text-foreground bg-muted/60 px-2.5 py-1 rounded-md border border-border">
              {groqModel || "Server environment (.env)"}
            </span>
          </div>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-xs text-muted-foreground">
            Applies as the default for newly created activities.
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              id={FIELD_IDS.RESTORE_DEFAULTS_BUTTON}
              type="button"
              disabled={saving}
              onClick={onRestoreDefaults}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg border border-border bg-card hover:bg-muted text-foreground text-xs font-medium transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset sliders and options to DepEd Grade 6 ARAL standard baseline"
            >
              <RotateCcw className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span>Restore DepEd Defaults</span>
            </button>
            <button
              id={FIELD_IDS.SAVE_BUTTON}
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-medium transition-colors shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </button>
          </div>
        </div>
      </form>

      {/* Section 4: Recent Changes History */}
      <div className="bg-card rounded-xl border border-border shadow-xs overflow-hidden transition-colors">
        <button
          id={FIELD_IDS.AUDIT_LOG_TOGGLE}
          type="button"
          onClick={onToggleAuditLog}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
              <History className="size-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-foreground">
                  Recent Changes History
                </h2>
                <span className="text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  Audit Trail
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                See recent adjustments made to your classroom passing criteria and settings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span className="text-xs font-medium hidden sm:inline">
              {isAuditLogOpen ? "Hide History" : "View History"}
            </span>
            {isAuditLogOpen ? (
              <ChevronUp className="size-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4" aria-hidden="true" />
            )}
          </div>
        </button>

        {isAuditLogOpen && (
          <div className="border-t border-border p-5 space-y-4 bg-muted/20">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Logged updates for this school:</span>
              <button
                type="button"
                onClick={onRefreshAuditEvents}
                disabled={auditLoading}
                className="inline-flex items-center gap-1 text-primary hover:underline font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`size-3 ${auditLoading ? "animate-spin" : ""}`} aria-hidden="true" />
                <span>Refresh</span>
              </button>
            </div>

            {auditLoading && (
              <div className="py-6 flex items-center justify-center gap-2 text-muted-foreground text-xs">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
                <span>Loading update history...</span>
              </div>
            )}

            {auditError && (
              <div className="p-3.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center justify-between">
                <span>{auditError}</span>
                <button
                  type="button"
                  onClick={onRefreshAuditEvents}
                  className="font-medium underline ml-2 cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            )}

            {!auditLoading && !auditError && auditEvents && auditEvents.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground bg-card rounded-lg border border-border p-4">
                No settings changes recorded yet. Future updates will be logged here with time and author details.
              </div>
            )}

            {!auditLoading && !auditError && auditEvents && auditEvents.length > 0 && (
              <div className="space-y-2.5">
                {auditEvents.map((evt) => {
                  const updatedKeys = evt.details?.updated_keys || [];
                  return (
                    <div
                      key={evt.id}
                      className="p-3.5 rounded-lg bg-card border border-border shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            {evt.actor_role === "teacher_admin"
                              ? "Teacher (Administrator)"
                              : evt.actor_role || "Teacher"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">•</span>
                          <span className="text-xs text-muted-foreground">
                            {formatAuditTime(evt.occurred_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-muted-foreground text-xs">Updated:</span>
                          {updatedKeys.length > 0 ? (
                            updatedKeys.map((k) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium text-xs border border-primary/20"
                              >
                                {formatSettingKey(k)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-xs">
                              Settings Updated
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs font-mono-math text-muted-foreground self-start sm:self-center">
                        {evt.id ? evt.id.slice(0, 8) : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
