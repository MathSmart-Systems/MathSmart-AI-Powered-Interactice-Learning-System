"use client";

import React from "react";
import {
  Bell,
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
      return "Passing Score Target";
    case "intervention.unsuccessful_attempts":
      return "Intervention Alert Trigger";
    case "features.groq_enabled":
    case "features.groq_feedback_enabled":
      return "AI Student Hints";
    case "notifications.daily_digest":
      return "Morning Alert Digest";
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
  dailyAlertsEnabled,
  setDailyAlertsEnabled,
  groqEnvEnabled,
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
        <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-2.5">
          <Target className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-indigo-950 block">Activities Screen</span>
            <span className="text-[11px] text-slate-600">
              Uses your <strong>Passing Score</strong> for daily math activities.
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-rose-50/60 border border-rose-100 flex items-start gap-2.5">
          <TriangleAlert className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-rose-950 block">Interventions Desk</span>
            <span className="text-[11px] text-slate-600">
              Alerts you when a student fails <strong>{autoInterventionAttempts} times</strong>.
            </span>
          </div>
        </div>

        <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold text-emerald-950 block">AI Assistant</span>
            <span className="text-[11px] text-slate-600">
              Helps students with friendly hints when they get stuck.
            </span>
          </div>
        </div>
      </div>

      {/* Notifications / Alerts */}
      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
        </div>
      )}

      {notice && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-semibold flex items-center justify-between animate-in fade-in duration-200"
        >
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice(null)}
            className="text-blue-700 hover:text-blue-900 text-xs font-bold underline cursor-pointer ml-3"
          >
            Dismiss
          </button>
        </div>
      )}

      {saveSuccess && (
        <div
          role="status"
          className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-200"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Changes saved successfully! Your classroom settings are now active.</span>
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {/* Section 1: Passing Scores & Interventions */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Classroom Rules & Passing Criteria
              </h2>
              <p className="text-xs text-slate-500">
                Set how students pass math activities and when you should be alerted.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Setting 1: Passing Score Slider */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor={FIELD_IDS.PASSING_THRESHOLD}
                    className="text-xs font-bold text-slate-900 block"
                  >
                    Default Activity Passing Score
                  </label>
                  <span className="text-[11px] text-slate-500">Classroom baseline (DepEd standard: 75%)</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-indigo-600 font-mono">
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
                className="w-full accent-indigo-600 cursor-pointer h-2 bg-slate-200 rounded-lg disabled:opacity-50"
                aria-invalid={Boolean(fieldErrors.passingThreshold)}
              />

              <div className="pt-2 border-t border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  How classroom scores are graded:
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-center text-[10px] font-bold">
                  <div className="p-1 rounded bg-rose-100 text-rose-800">
                    Below {passingThreshold}%<br />Needs Help
                  </div>
                  <div className="p-1 rounded bg-emerald-100 text-emerald-800 ring-2 ring-indigo-500/30">
                    {passingThreshold}%–100%<br />Passing Zone / Mastered
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-snug">
                Sets the baseline passing score for your classroom. Individual activities can still override this with their own custom threshold when created.
              </p>
              {fieldErrors.passingThreshold && (
                <p className="text-[11px] text-rose-600 font-semibold">
                  {fieldErrors.passingThreshold}
                </p>
              )}
            </div>

            {/* Setting 2: Intervention Trigger Slider */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <label
                    htmlFor={FIELD_IDS.INTERVENTION_ATTEMPTS}
                    className="text-xs font-bold text-slate-900 block"
                  >
                    Auto-Intervention Alert Trigger
                  </label>
                  <span className="text-[11px] text-slate-500">Unsuccessful tries before teacher alert</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-rose-600 font-mono">
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
                className="w-full accent-rose-600 cursor-pointer h-2 bg-slate-200 rounded-lg disabled:opacity-50"
                aria-invalid={Boolean(fieldErrors.autoInterventionAttempts)}
              />

              <div className="pt-2 border-t border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  Alert urgency level:
                </span>
                <div className="flex justify-between text-[11px] font-bold px-1 text-slate-500">
                  <span className={autoInterventionAttempts === 1 ? "text-rose-700 font-extrabold" : ""}>
                    1 (Immediate)
                  </span>
                  <span className={autoInterventionAttempts === 2 ? "text-indigo-700 font-extrabold" : ""}>
                    2 (Recommended)
                  </span>
                  <span className={autoInterventionAttempts >= 4 ? "text-slate-700 font-extrabold" : ""}>
                    5 (Relaxed)
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-snug">
                When a student fails an activity <strong>{autoInterventionAttempts} {autoInterventionAttempts === 1 ? "time" : "times"} in a row</strong>, they are automatically placed on your <strong>Interventions Desk</strong> for teacher guidance.
              </p>
              {fieldErrors.autoInterventionAttempts && (
                <p className="text-[11px] text-rose-600 font-semibold">
                  {fieldErrors.autoInterventionAttempts}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: AI Teaching Assistant */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-indigo-600" />
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  AI Teaching Assistant (Groq)
                </h2>
                <p className="text-xs text-slate-500">
                  Controls automated hints and encouragement for students.
                </p>
              </div>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                groqEnvEnabled
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              {groqEnvEnabled ? "● AI Connected" : "○ AI Off"}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/70 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-950 leading-relaxed">
              <strong>100% Guaranteed Math Accuracy:</strong> The AI is <u>never</u> allowed to grade answers or calculate student scores. All math is scored by strict computer formulas. The AI only writes helpful, encouraging words.
            </div>
          </div>

          <label
            htmlFor={FIELD_IDS.GROQ_TOGGLE}
            className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="space-y-0.5 pr-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-900">
                  Show AI Hints & Feedback to Students
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                    groqFeatureEnabled
                      ? "bg-indigo-100 text-indigo-800"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {groqFeatureEnabled ? "Turned ON" : "Turned OFF"}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
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
              className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer shrink-0 disabled:opacity-50"
            />
          </label>
        </div>

        {/* Section 3: Daily Alerts */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Bell className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Teacher Notifications
              </h2>
              <p className="text-xs text-slate-500">
                Stay updated on students who need help.
              </p>
            </div>
          </div>

          <label
            htmlFor={FIELD_IDS.DAILY_ALERTS}
            className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50/80 transition-colors cursor-pointer"
          >
            <div className="space-y-0.5 pr-4">
              <span className="text-xs font-bold text-slate-900 block">
                Daily Morning Summary Email
              </span>
              <p className="text-[11px] text-slate-500">
                Get an email every morning listing any students who struggled with activities yesterday.
              </p>
            </div>
            <input
              id={FIELD_IDS.DAILY_ALERTS}
              type="checkbox"
              checked={dailyAlertsEnabled}
              disabled={saving}
              onChange={(e) => setDailyAlertsEnabled(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer shrink-0 disabled:opacity-50"
            />
          </label>
        </div>

        {/* Action Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <p className="text-xs text-slate-500">
            Changes take effect immediately across all classroom activities.
          </p>
          <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
            <button
              id={FIELD_IDS.RESTORE_DEFAULTS_BUTTON}
              type="button"
              disabled={saving}
              onClick={onRestoreDefaults}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Reset sliders and options to DepEd Grade 6 ARAL standard baseline"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restore DepEd Defaults</span>
            </button>
            <button
              id={FIELD_IDS.SAVE_BUTTON}
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold transition-all shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
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
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden transition-all">
        <button
          id={FIELD_IDS.AUDIT_LOG_TOGGLE}
          type="button"
          onClick={onToggleAuditLog}
          className="w-full p-5 flex items-center justify-between text-left hover:bg-slate-50/70 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <History className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900">
                  Recent Changes History
                </h2>
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                  Audit Trail
                </span>
              </div>
              <p className="text-xs text-slate-500">
                See recent adjustments made to your classroom passing criteria and settings.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-slate-400">
            <span className="text-xs font-semibold text-slate-600 hidden sm:inline">
              {isAuditLogOpen ? "Hide History" : "View History"}
            </span>
            {isAuditLogOpen ? (
              <ChevronUp className="w-4 h-4 text-slate-600" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-600" />
            )}
          </div>
        </button>

        {isAuditLogOpen && (
          <div className="border-t border-slate-100 p-5 space-y-4 bg-slate-50/40">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Logged updates for this school:</span>
              <button
                type="button"
                onClick={onRefreshAuditEvents}
                disabled={auditLoading}
                className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 font-bold transition-colors cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${auditLoading ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {auditLoading && (
              <div className="py-6 flex items-center justify-center gap-2 text-slate-500 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Loading update history...</span>
              </div>
            )}

            {auditError && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between">
                <span>{auditError}</span>
                <button
                  type="button"
                  onClick={onRefreshAuditEvents}
                  className="font-bold underline ml-2 cursor-pointer"
                >
                  Try Again
                </button>
              </div>
            )}

            {!auditLoading && !auditError && auditEvents && auditEvents.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200/60 p-4">
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
                      className="p-3.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
                            {evt.actor_role === "teacher_admin"
                              ? "Teacher (Administrator)"
                              : evt.actor_role || "Teacher"}
                          </span>
                          <span className="text-[10px] text-slate-400">•</span>
                          <span className="text-[11px] text-slate-500">
                            {formatAuditTime(evt.occurred_at)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-slate-500 text-[11px]">Updated:</span>
                          {updatedKeys.length > 0 ? (
                            updatedKeys.map((k) => (
                              <span
                                key={k}
                                className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-100"
                              >
                                {formatSettingKey(k)}
                              </span>
                            ))
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px]">
                              Settings Updated
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-slate-400 self-start sm:self-center">
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
