"use client";

import React, { useState } from "react";
import { BookOpen, FileCheck2, Sparkles } from "lucide-react";

import { FIELD_IDS, HISTORY_TABS } from "../utils/constants.js";

export function LearningHistoryTabs({ history }) {
  const [activeTab, setActiveTab] = useState(HISTORY_TABS.ASSESSMENTS);

  const assessments = history?.assessments || [];
  const modules = history?.modules || [];
  const activities = history?.activities || [];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs p-6 space-y-6">
      {/* Header and Tab Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 font-display">
            Learning History & Activity Audit
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Review individual attempts across diagnostic assessments, learning modules, and practice activities
          </p>
        </div>

        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
          <button
            id={FIELD_IDS.TAB_ASSESSMENTS_BTN}
            type="button"
            onClick={() => setActiveTab(HISTORY_TABS.ASSESSMENTS)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === HISTORY_TABS.ASSESSMENTS
                ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Assessments ({assessments.length})
          </button>

          <button
            id={FIELD_IDS.TAB_MODULES_BTN}
            type="button"
            onClick={() => setActiveTab(HISTORY_TABS.MODULES)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === HISTORY_TABS.MODULES
                ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Modules ({modules.length})
          </button>

          <button
            id={FIELD_IDS.TAB_ACTIVITIES_BTN}
            type="button"
            onClick={() => setActiveTab(HISTORY_TABS.ACTIVITIES)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === HISTORY_TABS.ACTIVITIES
                ? "bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-xs"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            }`}
          >
            Activities ({activities.length})
          </button>
        </div>
      </div>

      {/* Tab 1: Assessments */}
      {activeTab === HISTORY_TABS.ASSESSMENTS && (
        <div className="space-y-3">
          {assessments.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl">
              No assessments recorded yet. Complete your diagnostic to begin tracking.
            </div>
          ) : (
            assessments.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Score: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.scoreFormatted}</span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {item.dateFormatted}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 2: Modules */}
      {activeTab === HISTORY_TABS.MODULES && (
        <div className="space-y-3">
          {modules.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl">
              No learning modules completed yet. Explore your learning path to begin.
            </div>
          ) : (
            modules.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.label || "Targeted module"}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {item.dateFormatted}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab 3: Activities */}
      {activeTab === HISTORY_TABS.ACTIVITIES && (
        <div className="space-y-3">
          {activities.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-slate-800/30 rounded-xl">
              No practice activities completed yet. Start interactive practice to log attempts.
            </div>
          ) : (
            activities.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {item.label} • Score: <span className="font-semibold text-slate-700 dark:text-slate-300">{item.scoreFormatted}</span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  {item.dateFormatted}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
