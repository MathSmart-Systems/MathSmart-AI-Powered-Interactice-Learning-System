"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Palette,
  RefreshCw,
  Settings,
  ShieldAlert,
  Sliders,
  Tv,
  User,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_GROQ_FEATURE_ENABLED,
  DEFAULT_INTERVENTION_ATTEMPTS,
  DEFAULT_PASSING_THRESHOLD,
  FIELD_IDS,
  SETTINGS_TABS,
} from "../utils/constants.js";
import { validateSettingsDraft } from "../utils/validation.js";
import {
  applyTheme,
  fetchOwnProfile,
  fetchSettings,
  fetchSettingsAuditEvents,
  loadDisplayPreferences,
  saveDisplayPreferences,
  updateSettings,
} from "../services/settings-admin-service.js";
import { ClassroomRulesTab } from "./ClassroomRulesTab.jsx";
import { DisplayPreferencesTab } from "./DisplayPreferencesTab.jsx";
import { ProfileAccountTab } from "./ProfileAccountTab.jsx";

export function TeacherSettingsView() {
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS.CLASSROOM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchError, setFetchError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [notice, setNotice] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Display Preferences
  const [preferences, setPreferences] = useState(DEFAULT_DISPLAY_PREFERENCES);

  // Teacher Profile Context
  const [userEmail, setUserEmail] = useState(null);
  const [profile, setProfile] = useState(null);

  // Form State (Classroom Rules)
  const [passingThreshold, setPassingThreshold] = useState(DEFAULT_PASSING_THRESHOLD);
  const [autoInterventionAttempts, setAutoInterventionAttempts] = useState(
    DEFAULT_INTERVENTION_ATTEMPTS
  );
  const [groqFeatureEnabled, setGroqFeatureEnabled] = useState(DEFAULT_GROQ_FEATURE_ENABLED);
  const [groqEnvEnabled, setGroqEnvEnabled] = useState(true);
  const [groqModel, setGroqModel] = useState(null);

  // Recent Changes History (Audit Log)
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  const isProjectorMode = Boolean(preferences.projectorMode);

  const handlePreferencesChange = (newPrefs) => {
    setPreferences(newPrefs);
    saveDisplayPreferences(newPrefs);
    if (newPrefs?.theme) {
      applyTheme(newPrefs.theme);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (preferences.theme === "system") {
        applyTheme("system");
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [preferences.theme]);

  const toggleProjectorMode = () => {
    handlePreferencesChange({
      ...preferences,
      projectorMode: !preferences.projectorMode,
    });
  };

  const loadAuditEvents = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    const res = await fetchSettingsAuditEvents({ pageSize: 5 });
    setAuditLoading(false);
    if (res.ok) {
      setAuditEvents(Array.isArray(res.data) ? res.data : []);
    } else {
      setAuditError(res.error || "Unable to load recent changes history.");
    }
  }, []);

  const handleToggleAuditLog = () => {
    const next = !isAuditLogOpen;
    setIsAuditLogOpen(next);
    if (next && auditEvents === null) {
      loadAuditEvents();
    }
  };

  const handleRestoreDefaults = () => {
    setPassingThreshold(DEFAULT_PASSING_THRESHOLD);
    setAutoInterventionAttempts(DEFAULT_INTERVENTION_ATTEMPTS);
    setGroqFeatureEnabled(DEFAULT_GROQ_FEATURE_ENABLED);
    setFieldErrors({});
    setSaveError(null);
    setNotice(
      "Restored DepEd baseline defaults (75% passing score, 2 failed attempts alert). Click 'Save Changes' below to apply."
    );
  };

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

    const [settingsRes, profileRes] = await Promise.all([
      fetchSettings(),
      fetchOwnProfile(),
    ]);

    if (profileRes.ok && profileRes.data) {
      setProfile(profileRes.data);
    }

    if (!settingsRes.ok) {
      setFetchError(settingsRes.error || "Unable to load settings. Please try again.");
      setLoading(false);
      return;
    }

    const data = settingsRes.data || {};
    if (data.thresholds?.activity_pass_percentage !== undefined) {
      setPassingThreshold(Number(data.thresholds.activity_pass_percentage));
    }
    if (data.intervention?.unsuccessful_attempts !== undefined) {
      setAutoInterventionAttempts(Number(data.intervention.unsuccessful_attempts));
    }
    if (data.features?.groq_advisory !== undefined) {
      setGroqFeatureEnabled(Boolean(data.features.groq_advisory));
    } else if (data.features?.groq_enabled !== undefined) {
      setGroqFeatureEnabled(Boolean(data.features.groq_enabled));
    } else if (data.features?.groq_feedback_enabled !== undefined) {
      setGroqFeatureEnabled(Boolean(data.features.groq_feedback_enabled));
    }
    if (data.groq) {
      setGroqEnvEnabled(Boolean(data.groq.environment_enabled ?? true));
      setGroqModel(data.groq.model ?? null);
    }

    setPreferences(loadDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES));
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

      const [settingsRes, profileRes] = await Promise.all([
        fetchSettings(),
        fetchOwnProfile(),
      ]);

      if (!active) return;

      if (profileRes.ok && profileRes.data) {
        setProfile(profileRes.data);
      }

      if (!settingsRes.ok) {
        setFetchError(settingsRes.error || "Unable to load settings. Please try again.");
        setLoading(false);
        return;
      }

      const data = settingsRes.data || {};
      if (data.thresholds?.activity_pass_percentage !== undefined) {
        setPassingThreshold(Number(data.thresholds.activity_pass_percentage));
      }
      if (data.intervention?.unsuccessful_attempts !== undefined) {
        setAutoInterventionAttempts(Number(data.intervention.unsuccessful_attempts));
      }
      if (data.features?.groq_advisory !== undefined) {
        setGroqFeatureEnabled(Boolean(data.features.groq_advisory));
      } else if (data.features?.groq_enabled !== undefined) {
        setGroqFeatureEnabled(Boolean(data.features.groq_enabled));
      } else if (data.features?.groq_feedback_enabled !== undefined) {
        setGroqFeatureEnabled(Boolean(data.features.groq_feedback_enabled));
      }
      if (data.groq) {
        setGroqEnvEnabled(Boolean(data.groq.environment_enabled ?? true));
        setGroqModel(data.groq.model ?? null);
      }

      const currentPrefs = loadDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES);
      setPreferences(currentPrefs);
      applyTheme(currentPrefs.theme);
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
    setNotice(null);

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
      "features.groq_advisory": Boolean(groqFeatureEnabled),
      "features.groq_enabled": Boolean(groqFeatureEnabled),
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
    if (isAuditLogOpen) {
      loadAuditEvents();
    }
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
        <div className="h-12 bg-slate-100 rounded-xl border border-slate-200" />
        <div className="h-24 bg-slate-100 rounded-2xl border border-slate-200" />
        <div className="h-56 bg-slate-100 rounded-2xl border border-slate-200" />
      </div>
    );
  }

  const teacherName = profile?.full_name || "Teacher Account";
  const teacherSchool = profile?.school_name;
  const teacherDivision = profile?.division_name;
  const institutionalDetails = [
    teacherSchool,
    teacherDivision ? `(${teacherDivision})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`mx-auto pb-16 transition-all duration-200 ${
        isProjectorMode ? "max-w-5xl space-y-10 text-base" : "max-w-4xl space-y-8 text-sm"
      }`}
    >
      {/* 1. Header with Classroom Mode Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-semibold mb-2">
            <Settings className="w-3.5 h-3.5 text-indigo-600" />
            <span>Classroom Controls</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Teacher Settings
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Easily adjust passing scores, student alerts, teacher profile, and display preferences.
          </p>
        </div>

        <div className="shrink-0 flex items-center gap-2">
          <button
            id={FIELD_IDS.PROJECTOR_MODE_TOGGLE}
            type="button"
            onClick={toggleProjectorMode}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
              isProjectorMode
                ? "bg-indigo-600 text-white border-indigo-700 shadow-sm hover:bg-indigo-700"
                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-2xs"
            }`}
            title="Enlarge display for classroom TVs, projectors, or smart screens"
          >
            <Tv className="w-4 h-4" />
            <span>{isProjectorMode ? "Big Screen: ON" : "Big Screen / TV Mode"}</span>
          </button>
        </div>
      </div>

      {/* Global Fetch Error */}
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

      {/* 2. Educator Profile Summary Strip */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900">
                {teacherName}
              </span>
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                Active
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Grade 6 Mathematics{institutionalDetails ? ` • ${institutionalDetails}` : ""}
            </p>
          </div>
        </div>
        <div className="text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/60 shrink-0">
          Role: <strong className="text-slate-800">Teacher / Administrator</strong>
        </div>
      </div>

      {/* 3. Settings Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2 sm:gap-4 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab(SETTINGS_TABS.CLASSROOM)}
          className={`pb-3 pt-1 px-2 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
            activeTab === SETTINGS_TABS.CLASSROOM
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Sliders className="w-4 h-4" />
          <span>Classroom Rules</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab(SETTINGS_TABS.PROFILE)}
          className={`pb-3 pt-1 px-2 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
            activeTab === SETTINGS_TABS.PROFILE
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <User className="w-4 h-4" />
          <span>My Profile & Account</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab(SETTINGS_TABS.DISPLAY)}
          className={`pb-3 pt-1 px-2 font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer shrink-0 ${
            activeTab === SETTINGS_TABS.DISPLAY
              ? "border-indigo-600 text-indigo-700"
              : "border-transparent text-slate-500 hover:text-slate-900"
          }`}
        >
          <Palette className="w-4 h-4" />
          <span>Display & Preferences</span>
        </button>
      </div>

      {/* 4. Tab Content */}
      {activeTab === SETTINGS_TABS.CLASSROOM && (
        <ClassroomRulesTab
          passingThreshold={passingThreshold}
          setPassingThreshold={setPassingThreshold}
          autoInterventionAttempts={autoInterventionAttempts}
          setAutoInterventionAttempts={setAutoInterventionAttempts}
          groqFeatureEnabled={groqFeatureEnabled}
          setGroqFeatureEnabled={setGroqFeatureEnabled}
          groqEnvEnabled={groqEnvEnabled}
          groqModel={groqModel}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          saving={saving}
          saveError={saveError}
          saveSuccess={saveSuccess}
          notice={notice}
          setNotice={setNotice}
          onSubmit={handleSubmit}
          onRestoreDefaults={handleRestoreDefaults}
          isAuditLogOpen={isAuditLogOpen}
          onToggleAuditLog={handleToggleAuditLog}
          auditEvents={auditEvents}
          auditLoading={auditLoading}
          auditError={auditError}
          onRefreshAuditEvents={loadAuditEvents}
        />
      )}

      {activeTab === SETTINGS_TABS.PROFILE && (
        <ProfileAccountTab
          profile={profile}
          onProfileUpdated={(updated) => setProfile(updated)}
          userEmail={userEmail}
        />
      )}

      {activeTab === SETTINGS_TABS.DISPLAY && (
        <DisplayPreferencesTab
          preferences={preferences}
          onPreferencesChange={handlePreferencesChange}
        />
      )}
    </div>
  );
}
