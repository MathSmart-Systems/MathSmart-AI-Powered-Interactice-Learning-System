"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Bot,
  CheckCircle2,
  GraduationCap,
  Info,
  Loader2,
  RefreshCw,
  Settings,
  Shapes,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TriangleAlert,
  User,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

import {
  DEFAULT_INTERVENTION_ATTEMPTS,
  DEFAULT_PASSING_THRESHOLD,
  FIELD_IDS,
  MAX_INTERVENTION_ATTEMPTS,
  MAX_PASSING_THRESHOLD,
  MIN_INTERVENTION_ATTEMPTS,
  MIN_PASSING_THRESHOLD,
} from "../utils/constants.js";
import { validateSettingsDraft } from "../utils/validation.js";
import { fetchSettings, updateSettings } from "../services/settings-admin-service.js";

export function TeacherSettingsView() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});

  // Teacher Profile Context
  const [userEmail, setUserEmail] = useState(null);

  // Form State
  const [passingThreshold, setPassingThreshold] = useState(DEFAULT_PASSING_THRESHOLD);
  const [autoInterventionAttempts, setAutoInterventionAttempts] = useState(
    DEFAULT_INTERVENTION_ATTEMPTS
  );
  const [groqFeatureEnabled, setGroqFeatureEnabled] = useState(true);
  const [dailyAlertsEnabled, setDailyAlertsEnabled] = useState(true);

  // Server-Read Groq State
  const [groqModel, setGroqModel] = useState("groq/compound-mini");
  const [groqEnvEnabled, setGroqEnvEnabled] = useState(true);

  const loadSettings = useCallback(async (showLoading = false) => {
    if (showLoading) {
      setLoading(true);
    }
    setFetchError(null);

    try {
      const supabase = createClient();
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.email) {
        setUserEmail(authData.user.email);
      }
    } catch {
      // Safe fallback
    }

    const result = await fetchSettings();
    if (!result.ok) {
      setFetchError(result.error || "Unable to load settings. Please try again.");
      setLoading(false);
      return;
    }

    const data = result.data || {};
    if (data.thresholds?.activity_pass_percentage !== undefined) {
      setPassingThreshold(Number(data.thresholds.activity_pass_percentage));
    }
    if (data.intervention?.unsuccessful_attempts !== undefined) {
      setAutoInterventionAttempts(Number(data.intervention.unsuccessful_attempts));
    }
    if (data.features?.groq_enabled !== undefined) {
      setGroqFeatureEnabled(Boolean(data.features.groq_enabled));
    } else if (data.features?.groq_feedback_enabled !== undefined) {
      setGroqFeatureEnabled(Boolean(data.features.groq_feedback_enabled));
    }
    if (data.notifications?.daily_digest !== undefined) {
      setDailyAlertsEnabled(Boolean(data.notifications.daily_digest));
    }

    if (data.groq) {
      if (data.groq.model) {
        setGroqModel(data.groq.model);
      }
      setGroqEnvEnabled(Boolean(data.groq.environment_enabled ?? true));
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const supabase = createClient();
        const { data: authData } = await supabase.auth.getUser();
        if (active && authData?.user?.email) {
          setUserEmail(authData.user.email);
        }
      } catch {
        // Safe fallback
      }

      const result = await fetchSettings();
      if (!active) {
        return;
      }
      if (!result.ok) {
        setFetchError(result.error || "Unable to load settings. Please try again.");
        setLoading(false);
        return;
      }

      const data = result.data || {};
      if (data.thresholds?.activity_pass_percentage !== undefined) {
        setPassingThreshold(Number(data.thresholds.activity_pass_percentage));
      }
      if (data.intervention?.unsuccessful_attempts !== undefined) {
        setAutoInterventionAttempts(Number(data.intervention.unsuccessful_attempts));
      }
      if (data.features?.groq_enabled !== undefined) {
        setGroqFeatureEnabled(Boolean(data.features.groq_enabled));
      } else if (data.features?.groq_feedback_enabled !== undefined) {
        setGroqFeatureEnabled(Boolean(data.features.groq_feedback_enabled));
      }
      if (data.notifications?.daily_digest !== undefined) {
        setDailyAlertsEnabled(Boolean(data.notifications.daily_digest));
      }

      if (data.groq) {
        if (data.groq.model) {
          setGroqModel(data.groq.model);
        }
        setGroqEnvEnabled(Boolean(data.groq.environment_enabled ?? true));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(false);

    const validation = validateSettingsDraft({
      passingThreshold,
      autoInterventionAttempts,
    });

    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);

    const payload = {
      "thresholds.activity_pass_percentage": Number(passingThreshold),
      "intervention.unsuccessful_attempts": Number(autoInterventionAttempts),
      "features.groq_enabled": Boolean(groqFeatureEnabled),
      "notifications.daily_digest": Boolean(dailyAlertsEnabled),
    };

    const result = await updateSettings(payload);
    setSaving(false);

    if (!result.ok) {
      setSaveError(result.error || "Failed to save settings. Please try again.");
      if (result.fields) {
        setFieldErrors(result.fields);
      }
      return;
    }

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 4000);
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto pb-16 animate-pulse" aria-busy="true">
        <div className="space-y-2">
          <div className="h-6 w-36 bg-slate-200 rounded-full" />
          <div className="h-8 w-64 bg-slate-200 rounded-lg" />
          <div className="h-4 w-80 bg-slate-200 rounded-md" />
        </div>
        <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200" />
        <div className="h-56 bg-slate-100 rounded-2xl border border-slate-200" />
        <div className="h-48 bg-slate-100 rounded-2xl border border-slate-200" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl mx-auto pb-16">
      {/* 1. Clear Page Header */}
      <div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
          <Settings className="w-3.5 h-3.5 text-indigo-600" />
          <span>Classroom Controls</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Teacher Settings
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Easily adjust passing scores, student alerts, and AI helper settings for your Grade 6 classes.
        </p>
      </div>

      {/* Error Notices */}
      {fetchError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadSettings(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {saveError && (
        <div
          role="alert"
          className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium flex items-center gap-2"
        >
          <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{saveError}</span>
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

      {/* 2. Educator Profile Strip (Simple, Clean, Non-Technical) */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                {userEmail || "Teacher Account"}
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Grade 6 Mathematics • San Jose Elementary School (DepEd Rizal)
            </p>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 shrink-0">
          Role: <strong className="text-slate-800">Teacher / Administrator</strong>
        </div>
      </div>

      {/* 3. Quick Visual Guide: Where These Settings Go */}
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

      <form onSubmit={handleSubmit} className="space-y-6">
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
                    Passing Score for Activities
                  </label>
                  <span className="text-[11px] text-slate-500">Minimum score needed to pass</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-indigo-600 font-mono">
                    {passingThreshold}%
                  </span>
                </div>
              </div>

              {/* Slider */}
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

              {/* Simple Visual Score Guide */}
              <div className="pt-2 border-t border-slate-200 space-y-1">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                  How scores are graded:
                </span>
                <div className="grid grid-cols-3 gap-1.5 text-center text-[10px] font-bold">
                  <div className="p-1 rounded bg-rose-100 text-rose-800">
                    Below 50%<br />Needs Help
                  </div>
                  <div className="p-1 rounded bg-amber-100 text-amber-900 ring-2 ring-indigo-500/30">
                    {passingThreshold}%–79%<br />Passing Zone
                  </div>
                  <div className="p-1 rounded bg-emerald-100 text-emerald-800">
                    80%–100%<br />Mastered
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 leading-snug">
                Students scoring <strong>{passingThreshold}% or higher</strong> pass the activity. You can also customize individual activity targets inside the Activities screen.
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
                    When to Alert Teacher
                  </label>
                  <span className="text-[11px] text-slate-500">Failed attempts before alert</span>
                </div>
                <div className="text-right">
                  <span className="text-xl font-extrabold text-rose-600 font-mono">
                    {autoInterventionAttempts} {autoInterventionAttempts === 1 ? "Try" : "Tries"}
                  </span>
                </div>
              </div>

              {/* Slider */}
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

              {/* Visual Guide */}
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
                If a student fails <strong>{autoInterventionAttempts} times</strong> in a row on any math topic, they will immediately appear on your <strong>Intervention Desk</strong>.
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

          {/* Simple Educator Safety Promise */}
          <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200/70 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
            <div className="text-[11px] text-emerald-950 leading-relaxed">
              <strong>100% Guaranteed Math Accuracy:</strong> The AI is <u>never</u> allowed to grade answers or calculate student scores. All math is scored by strict computer formulas. The AI only writes helpful, encouraging words.
            </div>
          </div>

          {/* Clean Toggle Switch */}
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

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-500">
            Changes take effect immediately across all classroom activities.
          </p>
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
      </form>
    </div>
  );
}
