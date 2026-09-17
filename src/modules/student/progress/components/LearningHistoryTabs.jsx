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
    <div className="bg-card rounded-2xl border border-border shadow-xs p-6 space-y-6">
      {/* Header and Tab Buttons */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2 className="text-lg font-bold text-foreground font-display">
            Learning History &amp; Activity Audit
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Review individual attempts across diagnostic assessments, learning
            modules, and practice activities
          </p>
        </div>

        <div className="flex items-center p-1 bg-muted rounded-xl border border-border">
          <button
            id={FIELD_IDS.TAB_ASSESSMENTS_BTN}
            type="button"
            onClick={() => setActiveTab(HISTORY_TABS.ASSESSMENTS)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeTab === HISTORY_TABS.ASSESSMENTS
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
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
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
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
                ? "bg-card text-primary shadow-xs"
                : "text-muted-foreground hover:text-foreground"
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
            <div className="p-8 text-center text-xs text-muted-foreground bg-muted/40 rounded-xl">
              No assessments recorded yet. Complete your diagnostic to begin
              tracking.
            </div>
          ) : (
            assessments.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-border bg-muted/50 flex items-center justify-between transition-colors hover:border-border/80"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <FileCheck2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      Score:{" "}
                      <span className="font-semibold text-foreground">
                        {item.scoreFormatted}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
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
            <div className="p-8 text-center text-xs text-muted-foreground bg-muted/40 rounded-xl">
              No learning modules completed yet. Explore your learning path to
              begin.
            </div>
          ) : (
            modules.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-border bg-muted/50 flex items-center justify-between transition-colors hover:border-border/80"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {item.label || "Targeted module"}
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
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
            <div className="p-8 text-center text-xs text-muted-foreground bg-muted/40 rounded-xl">
              No practice activities completed yet. Start interactive practice
              to log attempts.
            </div>
          ) : (
            activities.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-4 rounded-xl border border-border bg-muted/50 flex items-center justify-between transition-colors hover:border-border/80"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-foreground">
                      {item.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground">
                      {item.label} • Score:{" "}
                      <span className="font-semibold text-foreground">
                        {item.scoreFormatted}
                      </span>
                    </p>
                  </div>
                </div>
                <span className="text-[11px] text-muted-foreground font-medium">
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
