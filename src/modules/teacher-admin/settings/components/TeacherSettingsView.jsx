"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Palette, RefreshCw, Settings, ShieldAlert, Sliders, User } from "lucide-react";

import { Toast } from "@/modules/shared";

import {
  DEFAULT_DISPLAY_PREFERENCES,
  DEFAULT_INTERVENTION_ATTEMPTS,
  DEFAULT_PASSING_THRESHOLD,
  SETTINGS_TABS,
} from "../utils/constants.js";
import { validateSettingsDraft } from "../utils/validation.js";
import { emailChangeResult, readAccountEmail } from "../utils/email-change.js";
import { readGroqStatus, withClassroomSetting } from "../utils/groq-status.js";
import {
  applyTheme,
  fetchOwnProfile,
  fetchSettings,
  fetchSettingsAuditEvents,
  loadDisplayPreferences,
  loadTeacherAvatar,
  readSignedInAccount,
  saveDisplayPreferences,
  updateSettings,
} from "../services/settings-admin-service.js";
import { ClassroomRulesTab } from "./ClassroomRulesTab.jsx";
import { DisplayPreferencesTab } from "./DisplayPreferencesTab.jsx";
import { ProfileAccountTab } from "./ProfileAccountTab.jsx";

const TABS = [
  { id: SETTINGS_TABS.CLASSROOM, label: "Classroom Rules", icon: Sliders },
  { id: SETTINGS_TABS.PROFILE, label: "My Profile & Account", icon: User },
  { id: SETTINGS_TABS.DISPLAY, label: "Display & Preferences", icon: Palette },
];

const TAB_IDS = new Set(TABS.map((tab) => tab.id));

/**
 * What the address bar asks for on arrival: a tab, and the result of an email
 * confirmation link. The result is read once and then removed from the
 * address, so a reload does not announce it again.
 */
function readArrival() {
  if (typeof window === "undefined") return { tab: null, result: null };
  const url = new URL(window.location.href);
  const tab = url.searchParams.get("tab");
  const result = emailChangeResult(url.searchParams.get("email_change"));
  if (url.searchParams.has("email_change")) {
    url.searchParams.delete("email_change");
    window.history.replaceState(window.history.state, "", url);
  }
  return { tab: TAB_IDS.has(tab) ? tab : null, result };
}

function SettingsSkeleton() {
  return (
    <div className="mx-auto max-w-4xl space-y-8 pb-16" aria-busy="true" aria-label="Loading settings">
      <div className="space-y-2 animate-pulse motion-reduce:animate-none">
        <div className="h-6 w-36 rounded-full bg-muted" />
        <div className="h-10 w-64 rounded-lg bg-muted" />
        <div className="h-4 w-80 max-w-full rounded-md bg-muted" />
      </div>
      <div className="h-18 rounded-xl border border-border bg-card" />
      <div className="h-9 w-full max-w-md rounded-md bg-muted animate-pulse motion-reduce:animate-none" />
      <div className="h-80 rounded-xl border border-border bg-card" />
      <div className="h-64 rounded-xl border border-border bg-card" />
    </div>
  );
}

export function TeacherSettingsView() {
  const [activeTab, setActiveTab] = useState(SETTINGS_TABS.CLASSROOM);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [toast, setToast] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [preferences, setPreferences] = useState(() =>
    loadDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES),
  );

  const [account, setAccount] = useState({ current: null, pending: null });
  const [profile, setProfile] = useState(null);
  const [avatar, setAvatar] = useState(() => loadTeacherAvatar());

  // Classroom rules form
  const [passingThreshold, setPassingThreshold] = useState(DEFAULT_PASSING_THRESHOLD);
  const [autoInterventionAttempts, setAutoInterventionAttempts] = useState(
    DEFAULT_INTERVENTION_ATTEMPTS,
  );
  const [saving, setSaving] = useState(false);

  // Groq: read from the server, saved on its own
  const [groq, setGroq] = useState(() => readGroqStatus(null));
  const [savingGroq, setSavingGroq] = useState(false);

  // Recent changes
  const [isAuditLogOpen, setIsAuditLogOpen] = useState(false);
  const [auditEvents, setAuditEvents] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  const isProjectorMode = Boolean(preferences.projectorMode);
  const dismissToast = useCallback(() => setToast(null), []);
  // Read once per mount. Development runs effects twice, and the second run
  // would find the address already cleaned.
  const arrivalRef = useRef(null);

  useEffect(() => {
    const onAvatarChange = () => setAvatar(loadTeacherAvatar());
    window.addEventListener("mathsmart:teacher-avatar-change", onAvatarChange);
    return () => window.removeEventListener("mathsmart:teacher-avatar-change", onAvatarChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (preferences.theme === "system") applyTheme("system");
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [preferences.theme]);

  const handlePreferencesChange = (next) => {
    setPreferences(next);
    saveDisplayPreferences(next);
    if (next?.theme) applyTheme(next.theme);
  };

  const readAccount = useCallback((user) => {
    if (user) setAccount(readAccountEmail(user));
  }, []);

  /** One load, used on arrival and by "Try again". */
  const load = useCallback(async () => {
    const [user, settingsRes, profileRes] = await Promise.all([
      readSignedInAccount(),
      fetchSettings(),
      fetchOwnProfile(),
    ]);
    return { user, settingsRes, profileRes };
  }, []);

  const apply = useCallback(
    ({ user, settingsRes, profileRes }) => {
      readAccount(user);
      if (profileRes.ok && profileRes.data) setProfile(profileRes.data);

      if (!settingsRes.ok) {
        setFetchError(settingsRes.error || "Settings could not be loaded.");
        return;
      }
      const data = settingsRes.data || {};
      if (data.thresholds?.activity_pass_percentage !== undefined) {
        setPassingThreshold(Number(data.thresholds.activity_pass_percentage));
      }
      if (data.intervention?.unsuccessful_attempts !== undefined) {
        setAutoInterventionAttempts(Number(data.intervention.unsuccessful_attempts));
      }
      setGroq(readGroqStatus(data));
    },
    [readAccount],
  );

  useEffect(() => {
    let active = true;
    arrivalRef.current ??= readArrival();
    const arrival = arrivalRef.current;

    load().then((result) => {
      if (!active) return;
      apply(result);
      const currentPrefs = loadDisplayPreferences(DEFAULT_DISPLAY_PREFERENCES);
      setPreferences(currentPrefs);
      applyTheme(currentPrefs.theme);
      if (arrival.tab) setActiveTab(arrival.tab);
      if (arrival.result) setToast(arrival.result);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [load, apply]);

  const retry = async () => {
    setFetchError(null);
    apply(await load());
  };

  const loadAuditEvents = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    const res = await fetchSettingsAuditEvents({ pageSize: 5 });
    setAuditLoading(false);
    if (res.ok) setAuditEvents(Array.isArray(res.data) ? res.data : []);
    else setAuditError("Recent changes could not be loaded.");
  }, []);

  const handleToggleAuditLog = () => {
    const next = !isAuditLogOpen;
    setIsAuditLogOpen(next);
    if (next && auditEvents === null) loadAuditEvents();
  };

  const handleRestoreDefaults = () => {
    setPassingThreshold(DEFAULT_PASSING_THRESHOLD);
    setAutoInterventionAttempts(DEFAULT_INTERVENTION_ATTEMPTS);
    setFieldErrors({});
    setToast({
      tone: "success",
      message: "DepEd defaults restored in the form: 75% and 2 tries. Select Save changes to apply them.",
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validation = validateSettingsDraft({ passingThreshold, autoInterventionAttempts });
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }

    setFieldErrors({});
    setSaving(true);
    const result = await updateSettings({
      "thresholds.activity_pass_percentage": Number(passingThreshold),
      "intervention.unsuccessful_attempts": Number(autoInterventionAttempts),
    });
    setSaving(false);

    if (!result.ok) {
      if (result.fields) setFieldErrors(result.fields);
      setToast({ tone: "error", message: "Classroom rules could not be saved. Try again." });
      return;
    }

    const changed = Array.isArray(result.data?.updated) ? result.data.updated.length : 0;
    setToast({
      tone: "success",
      message: changed > 0 ? "Classroom rules saved." : "No changes to save.",
    });
    if (isAuditLogOpen && changed > 0) loadAuditEvents();
  };

  /** The Groq switch saves by itself and puts itself back if the save fails. */
  const handleGroqChange = async (enabled) => {
    const before = groq;
    setSavingGroq(true);
    setGroq(withClassroomSetting(before, enabled));

    const result = await updateSettings({ "features.groq_advisory": enabled });
    setSavingGroq(false);

    if (!result.ok) {
      setGroq(before);
      setToast({ tone: "error", message: "AI suggestions could not be changed. The setting is as it was." });
      return;
    }
    setToast({
      tone: "success",
      message: enabled ? "AI suggestions turned on." : "AI suggestions turned off.",
    });
    if (isAuditLogOpen) loadAuditEvents();
  };

  if (loading) return <SettingsSkeleton />;

  const teacherName = profile?.full_name || "Teacher account";
  const institutionalDetails = [
    profile?.school_name,
    profile?.division_name ? `(${profile.division_name})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={`mx-auto pb-16 ${
        isProjectorMode ? "max-w-5xl space-y-10 text-base" : "max-w-4xl space-y-8 text-sm"
      }`}
    >
      <header className="space-y-2">
        <p className="inline-flex w-fit items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Settings className="size-3.5" aria-hidden="true" />
          <span>Classroom Controls</span>
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Teacher Settings
        </h1>
        <span aria-hidden="true" className="mt-1 block h-0.5 w-16 bg-primary" />
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Passing scores, intervention alerts, AI suggestions, your account and display options.
        </p>
      </header>

      {fetchError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-xs font-medium text-destructive"
        >
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={retry}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
          >
            <RefreshCw className="size-3.5" aria-hidden="true" />
            <span>Try again</span>
          </button>
        </div>
      )}

      <div className="flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-primary/20 bg-primary/10 text-primary">
            {avatar ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={avatar} alt="" className="size-full object-cover" />
            ) : (
              <User className="size-5" aria-hidden="true" />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xs font-bold text-foreground">{teacherName}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Grade 6 Mathematics{institutionalDetails ? ` • ${institutionalDetails}` : ""}
            </p>
          </div>
        </div>
        <p className="shrink-0 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
          Role: <strong className="font-semibold text-foreground">Teacher / Administrator</strong>
        </p>
      </div>

      <nav aria-label="Settings sections" className="flex gap-2 overflow-x-auto border-b border-border sm:gap-4">
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => setActiveTab(id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-2 pb-3 pt-1 text-xs transition-colors sm:text-sm ${
                active
                  ? "border-primary font-semibold text-primary"
                  : "border-transparent font-medium text-muted-foreground hover:border-border hover:text-foreground"
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      {activeTab === SETTINGS_TABS.CLASSROOM && (
        <ClassroomRulesTab
          passingThreshold={passingThreshold}
          setPassingThreshold={setPassingThreshold}
          autoInterventionAttempts={autoInterventionAttempts}
          setAutoInterventionAttempts={setAutoInterventionAttempts}
          groq={groq}
          savingGroq={savingGroq}
          onGroqChange={handleGroqChange}
          fieldErrors={fieldErrors}
          setFieldErrors={setFieldErrors}
          saving={saving}
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
          account={account}
          onAccountRead={readAccount}
          onToast={setToast}
        />
      )}

      {activeTab === SETTINGS_TABS.DISPLAY && (
        <DisplayPreferencesTab
          preferences={preferences}
          onPreferencesChange={handlePreferencesChange}
        />
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  );
}
