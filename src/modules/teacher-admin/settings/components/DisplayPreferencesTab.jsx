"use client";

import React, { useState } from "react";
import {
  Check,
  CheckCircle2,
  Laptop,
  Moon,
  Palette,
  Sun,
  Table,
  Tv,
  Volume2,
  VolumeX,
} from "lucide-react";

import { FIELD_IDS } from "../utils/constants.js";

export function DisplayPreferencesTab({
  preferences,
  onPreferencesChange,
}) {
  const [savedBanner, setSavedBanner] = useState(false);

  const updatePref = (key, value) => {
    const next = { ...preferences, [key]: value };
    onPreferencesChange(next);
    setSavedBanner(true);
    setTimeout(() => {
      setSavedBanner(false);
    }, 2500);
  };

  const isProjectorMode = Boolean(preferences.projectorMode);
  const theme = preferences.theme || "light";
  const soundEffects = Boolean(preferences.soundEffects ?? true);
  const density = preferences.density || "comfortable";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {savedBanner && (
        <div
          role="status"
          className="p-3.5 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-medium flex items-center gap-2 animate-in fade-in duration-150"
        >
          <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />
          <span>Display preferences updated and saved for this browser!</span>
        </div>
      )}

      {/* 1. Classroom / TV Projector Mode */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Classroom / Projector Mode
              </h2>
              <p className="text-xs text-muted-foreground">
                Enlarge controls for classroom smart TVs and overhead projectors.
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-medium px-2.5 py-1 rounded-full uppercase tracking-wider ${
              isProjectorMode
                ? "bg-primary/10 text-primary font-semibold"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isProjectorMode ? "● Mode Active" : "○ Standard Mode"}
          </span>
        </div>

        <label
          htmlFor={FIELD_IDS.PROJECTOR_PREFERENCE_CHECKBOX}
          className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="space-y-0.5 pr-4">
            <span className="text-xs font-semibold text-foreground block">
              Enable Big Screen / High Visibility
            </span>
            <p className="text-[11px] text-muted-foreground">
              Scales up typography, slider thumbs, and badge contrast so students and observers in the back of the classroom can easily see the board.
            </p>
          </div>
          <input
            id={FIELD_IDS.PROJECTOR_PREFERENCE_CHECKBOX}
            type="checkbox"
            checked={isProjectorMode}
            onChange={(e) => updatePref("projectorMode", e.target.checked)}
            className="rounded border-border text-primary accent-primary focus:ring-ring w-5 h-5 cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* 2. Color Theme */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Palette className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-foreground">Color Appearance</h2>
            <p className="text-xs text-muted-foreground">
              Choose your preferred visual theme for lesson prep and grading.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Light Theme */}
          <button
            id={FIELD_IDS.THEME_LIGHT_BTN}
            type="button"
            onClick={() => updatePref("theme", "light")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              theme === "light"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40 bg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-muted text-foreground flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              {theme === "light" && (
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-semibold text-foreground block">Light Theme</span>
              <span className="text-[11px] text-muted-foreground">Default high-clarity daylight theme</span>
            </div>
          </button>

          {/* Dark Theme */}
          <button
            id={FIELD_IDS.THEME_DARK_BTN}
            type="button"
            onClick={() => updatePref("theme", "dark")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              theme === "dark"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40 bg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-muted text-foreground flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </div>
              {theme === "dark" && (
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-semibold text-foreground block">
                Dark Theme
              </span>
              <span className="text-[11px] text-muted-foreground">
                Easy on the eyes for evening work
              </span>
            </div>
          </button>

          {/* System Theme */}
          <button
            id={FIELD_IDS.THEME_SYSTEM_BTN}
            type="button"
            onClick={() => updatePref("theme", "system")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              theme === "system"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40 bg-card"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-muted text-foreground flex items-center justify-center">
                <Laptop className="w-4 h-4" />
              </div>
              {theme === "system" && (
                <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-semibold text-foreground block">Match Computer</span>
              <span className="text-[11px] text-muted-foreground">Adapts to your operating system</span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Audio & Sound Effects */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          {soundEffects ? (
            <Volume2 className="w-5 h-5 text-primary" />
          ) : (
            <VolumeX className="w-5 h-5 text-muted-foreground" />
          )}
          <div>
            <h2 className="text-base font-semibold text-foreground">Audio & Chimes</h2>
            <p className="text-xs text-muted-foreground">
              Interactive audio feedback during classroom practice.
            </p>
          </div>
        </div>

        <label
          htmlFor={FIELD_IDS.SOUND_EFFECTS_TOGGLE}
          className="flex items-center justify-between p-4 rounded-xl border border-border hover:bg-muted/40 transition-colors cursor-pointer"
        >
          <div className="space-y-0.5 pr-4">
            <span className="text-xs font-semibold text-foreground block">
              Activity Completion Sounds
            </span>
            <p className="text-[11px] text-muted-foreground">
              Play gentle audio chimes and celebratory sounds when students finish an activity or master a competency.
            </p>
          </div>
          <input
            id={FIELD_IDS.SOUND_EFFECTS_TOGGLE}
            type="checkbox"
            checked={soundEffects}
            onChange={(e) => updatePref("soundEffects", e.target.checked)}
            className="rounded border-border text-primary accent-primary focus:ring-ring w-5 h-5 cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* 4. Table Density */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-border/60 pb-3">
          <Table className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Student List Layout Density
            </h2>
            <p className="text-xs text-muted-foreground">
              Control spacing for student rosters and grade reports.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            id={FIELD_IDS.DENSITY_COMFORTABLE_BTN}
            type="button"
            onClick={() => updatePref("density", "comfortable")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              density === "comfortable"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40 bg-card"
            }`}
          >
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground block">Comfortable View</span>
              <p className="text-[11px] text-muted-foreground">Larger row height and generous touch padding</p>
            </div>
            {density === "comfortable" && (
              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 ml-3">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>

          <button
            id={FIELD_IDS.DENSITY_COMPACT_BTN}
            type="button"
            onClick={() => updatePref("density", "compact")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
              density === "compact"
                ? "border-primary bg-primary/5 ring-1 ring-primary"
                : "border-border hover:bg-muted/40 bg-card"
            }`}
          >
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground block">Compact View</span>
              <p className="text-[11px] text-muted-foreground">Fit more student rows on screen simultaneously</p>
            </div>
            {density === "compact" && (
              <div className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 ml-3">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
