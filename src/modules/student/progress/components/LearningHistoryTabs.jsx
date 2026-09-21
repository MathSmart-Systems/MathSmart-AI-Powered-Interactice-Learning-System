"use client";

import React, { useRef, useState } from "react";
import { BookOpen, FileCheck2, Sparkles } from "lucide-react";

import { FIELD_IDS, HISTORY_TABS, HISTORY_TAB_LIST, historyTabId } from "../utils/constants.js";

const TAB_ICONS = {
  [HISTORY_TABS.ASSESSMENTS]: FileCheck2,
  [HISTORY_TABS.MODULES]: BookOpen,
  [HISTORY_TABS.ACTIVITIES]: Sparkles,
};

const EMPTY_MESSAGES = {
  [HISTORY_TABS.ASSESSMENTS]:
    "No assessments recorded yet. Complete your diagnostic to begin tracking.",
  [HISTORY_TABS.MODULES]:
    "No learning modules completed yet. Explore your learning path to begin.",
  [HISTORY_TABS.ACTIVITIES]:
    "No practice activities completed yet. Start interactive practice to log attempts.",
};

/**
 * The three history tabs as a real tab widget.
 *
 * They were three plain buttons: the chosen one was marked by a background
 * colour and nothing else, so a learner using a screen reader was told only
 * that three buttons existed, and a learner who cannot separate those two
 * backgrounds was told nothing at all. `aria-selected` now carries the state, a
 * roving tabindex makes the group one stop, and the arrow keys move within it,
 * following the status tabs already accepted in the teacher workspace.
 */
function HistoryTabList({ value, onChange, counts }) {
  const tabsRef = useRef([]);

  function handleKeyDown(event) {
    const keys = { ArrowRight: 1, ArrowLeft: -1, Home: "first", End: "last" };
    const move = keys[event.key];
    if (move === undefined) {
      return;
    }

    event.preventDefault();
    const current = HISTORY_TAB_LIST.findIndex((tab) => tab.value === value);
    let next;
    if (move === "first") {
      next = 0;
    } else if (move === "last") {
      next = HISTORY_TAB_LIST.length - 1;
    } else {
      next = (current + move + HISTORY_TAB_LIST.length) % HISTORY_TAB_LIST.length;
    }

    onChange(HISTORY_TAB_LIST[next].value);
    tabsRef.current[next]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Learning history record type"
      className="flex items-center p-1 bg-muted rounded-xl border border-border"
      onKeyDown={handleKeyDown}
    >
      {HISTORY_TAB_LIST.map((tab, index) => {
        const isSelected = tab.value === value;
        // The count is printed even when it is zero. Hiding it made an empty
        // tab look uncounted rather than empty, which is a different claim.
        const total = counts[tab.value] ?? 0;

        return (
          <button
            key={tab.value}
            ref={(node) => {
              tabsRef.current[index] = node;
            }}
            id={historyTabId(tab.value)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={FIELD_IDS.HISTORY_PANEL}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(tab.value)}
            className={`px-3 py-1.5 rounded-lg text-xs transition-all cursor-pointer ${
              isSelected
                ? "bg-card text-foreground font-bold shadow-xs ring-1 ring-primary/40"
                : "text-muted-foreground font-medium hover:text-foreground"
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                  isSelected
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-secondary-foreground"
                }`}
              >
                {total}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HistoryRow({ item, tab }) {
  const Icon = TAB_ICONS[tab];

  return (
    <div className="p-4 rounded-xl border border-border bg-muted/50 flex items-start sm:items-center justify-between gap-3 transition-colors hover:border-border/80">
      <div className="flex items-start sm:items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-primary/12 text-primary flex items-center justify-center shrink-0">
          <Icon className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-foreground">{item.title}</h3>
          <p className="text-[11px] text-muted-foreground">
            {tab === HISTORY_TABS.MODULES ? (
              item.label || "Targeted module"
            ) : (
              <>
                {tab === HISTORY_TABS.ACTIVITIES ? `${item.label} • ` : ""}
                Score:{" "}
                <span className="font-semibold text-foreground">
                  {item.scoreFormatted}
                </span>
              </>
            )}
          </p>
        </div>
      </div>
      <span className="text-[11px] text-muted-foreground font-medium shrink-0">
        {item.dateFormatted}
      </span>
    </div>
  );
}

export function LearningHistoryTabs({ history }) {
  const [activeTab, setActiveTab] = useState(HISTORY_TABS.ASSESSMENTS);

  const lists = {
    [HISTORY_TABS.ASSESSMENTS]: history?.assessments || [],
    [HISTORY_TABS.MODULES]: history?.modules || [],
    [HISTORY_TABS.ACTIVITIES]: history?.activities || [],
  };

  const counts = {
    [HISTORY_TABS.ASSESSMENTS]: lists[HISTORY_TABS.ASSESSMENTS].length,
    [HISTORY_TABS.MODULES]: lists[HISTORY_TABS.MODULES].length,
    [HISTORY_TABS.ACTIVITIES]: lists[HISTORY_TABS.ACTIVITIES].length,
  };

  const items = lists[activeTab];

  return (
    <section
      aria-labelledby="progress-history-heading"
      className="bg-card rounded-2xl border border-border shadow-xs p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h2
            id="progress-history-heading"
            className="text-lg font-bold text-foreground font-display"
          >
            Recent Learning History
          </h2>
          {/*
            The counts beside each tab used to read as a lifetime total. They
            are not: the API returns only the most recent slice of activity, and
            the assessment rows are whatever attempt history each competency
            still carries. Saying so is cheaper than a learner concluding that
            work they remember doing was never recorded.
          */}
          <p className="text-xs text-muted-foreground mt-0.5 max-w-prose leading-relaxed">
            Your most recent records, newest first. This is a recent slice of
            your work, not everything you have ever done.
          </p>
        </div>

        <HistoryTabList value={activeTab} onChange={setActiveTab} counts={counts} />
      </div>

      {/*
        One panel, kept at a steady minimum height. Switching between a full tab
        and an empty one otherwise changed the height of the card under the
        reader's cursor and moved the rest of the page with it.
      */}
      <div
        id={FIELD_IDS.HISTORY_PANEL}
        role="tabpanel"
        aria-labelledby={historyTabId(activeTab)}
        tabIndex={-1}
        className="min-h-40 space-y-3"
      >
        {items.length === 0 ? (
          <div className="p-8 text-center text-xs text-muted-foreground bg-muted/40 rounded-xl">
            {EMPTY_MESSAGES[activeTab]}
          </div>
        ) : (
          items.map((item, idx) => (
            <HistoryRow key={item.id || idx} item={item} tab={activeTab} />
          ))
        )}
      </div>
    </section>
  );
}
