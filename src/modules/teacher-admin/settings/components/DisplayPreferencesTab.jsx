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
          className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in duration-150"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Display preferences updated and saved for this browser!</span>
        </div>
      )}

      {/* 1. Classroom / TV Projector Mode */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Tv className="w-5 h-5 text-indigo-600" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Classroom / Projector Mode
              </h2>
              <p className="text-xs text-slate-500">
                Enlarge controls for classroom smart TVs and overhead projectors.
              </p>
            </div>
          </div>
          <span
            className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider ${
              isProjectorMode
                ? "bg-indigo-100 text-indigo-800 font-bold"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            {isProjectorMode ? "● Mode Active" : "○ Standard Mode"}
          </span>
        </div>

        <label
          htmlFor={FIELD_IDS.PROJECTOR_PREFERENCE_CHECKBOX}
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 transition-colors cursor-pointer"
        >
          <div className="space-y-0.5 pr-4">
            <span className="text-xs font-bold text-slate-900 block">
              Enable Big Screen / High Visibility
            </span>
            <p className="text-[11px] text-slate-500">
              Scales up typography, slider thumbs, and badge contrast so students and observers in the back of the classroom can easily see the board.
            </p>
          </div>
          <input
            id={FIELD_IDS.PROJECTOR_PREFERENCE_CHECKBOX}
            type="checkbox"
            checked={isProjectorMode}
            onChange={(e) => updatePref("projectorMode", e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* 2. Color Theme */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Palette className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">Color Appearance</h2>
            <p className="text-xs text-slate-500">
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
                ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                <Sun className="w-4 h-4" />
              </div>
              {theme === "light" && (
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">Light Theme</span>
              <span className="text-[11px] text-slate-500">Default high-clarity daylight theme</span>
            </div>
          </button>

          {/* Dark Theme */}
          <button
            id={FIELD_IDS.THEME_DARK_BTN}
            type="button"
            onClick={() => updatePref("theme", "dark")}
            className={`p-4 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-3 ${
              theme === "dark"
                ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Moon className="w-4 h-4" />
              </div>
              {theme === "dark" && (
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">
                Dark Theme
              </span>
              <span className="text-[11px] text-slate-500">
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
                ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white"
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
                <Laptop className="w-4 h-4" />
              </div>
              {theme === "system" && (
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center">
                  <Check className="w-3 h-3" />
                </div>
              )}
            </div>
            <div>
              <span className="text-xs font-bold text-slate-900 block">Match Computer</span>
              <span className="text-[11px] text-slate-500">Adapts to your operating system</span>
            </div>
          </button>
        </div>
      </div>

      {/* 3. Audio & Sound Effects */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          {soundEffects ? (
            <Volume2 className="w-5 h-5 text-indigo-600" />
          ) : (
            <VolumeX className="w-5 h-5 text-slate-400" />
          )}
          <div>
            <h2 className="text-base font-bold text-slate-900">Audio & Chimes</h2>
            <p className="text-xs text-slate-500">
              Interactive audio feedback during classroom practice.
            </p>
          </div>
        </div>

        <label
          htmlFor={FIELD_IDS.SOUND_EFFECTS_TOGGLE}
          className="flex items-center justify-between p-4 rounded-xl border border-slate-200 hover:bg-slate-50/80 hover:border-slate-300 transition-colors cursor-pointer"
        >
          <div className="space-y-0.5 pr-4">
            <span className="text-xs font-bold text-slate-900 block">
              Activity Completion Sounds
            </span>
            <p className="text-[11px] text-slate-500">
              Play gentle audio chimes and celebratory sounds when students finish an activity or master a competency.
            </p>
          </div>
          <input
            id={FIELD_IDS.SOUND_EFFECTS_TOGGLE}
            type="checkbox"
            checked={soundEffects}
            onChange={(e) => updatePref("soundEffects", e.target.checked)}
            className="rounded text-indigo-600 focus:ring-indigo-500 w-5 h-5 cursor-pointer shrink-0"
          />
        </label>
      </div>

      {/* 4. Table Density */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <Table className="w-5 h-5 text-indigo-600" />
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Student List Layout Density
            </h2>
            <p className="text-xs text-slate-500">
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
                ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white"
            }`}
          >
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-900 block">Comfortable View</span>
              <p className="text-[11px] text-slate-500">Larger row height and generous touch padding</p>
            </div>
            {density === "comfortable" && (
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 ml-3">
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
                ? "border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 bg-white"
            }`}
          >
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-900 block">Compact View</span>
              <p className="text-[11px] text-slate-500">Fit more student rows on screen simultaneously</p>
            </div>
            {density === "compact" && (
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0 ml-3">
                <Check className="w-3 h-3" />
              </div>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
