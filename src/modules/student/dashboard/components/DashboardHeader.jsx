import React from "react";
import { CheckCircle2, Circle, CircleDashed } from "lucide-react";

import { greetingFor } from "../utils/format";

const DIAGNOSTIC_ICON = {
  completed: CheckCircle2,
  in_progress: CircleDashed,
};

/**
 * Who this is for, and where their diagnostic stands.
 *
 * A heading and one line, not a card. The version this replaced wrapped the
 * greeting in a padded card with a badge, a paragraph promising a path
 * "adjusted to your individual strengths" — shown to learners who had not yet
 * taken the diagnostic it would be adjusted from — and a status box whose
 * links led to the same pages the rest of the dashboard already links to.
 *
 * The diagnostic status is read from the raw value, not compared against a
 * display label, and it is always written out: the icon never carries it alone.
 */
export function DashboardHeader({ learner, diagnostic }) {
  const name = learner.firstName;
  const Icon = DIAGNOSTIC_ICON[diagnostic.value] ?? Circle;

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">
          Grade 6 mathematics
          {learner.sectionName ? ` · ${learner.sectionName}` : ""}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          {greetingFor()}
          {name ? `, ${name}` : ""}!
        </h1>
      </div>

      <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
        <Icon
          aria-hidden="true"
          className={`size-4 ${diagnostic.isComplete ? "text-primary" : "text-muted-foreground"}`}
        />
        <span className="text-muted-foreground">Diagnostic:</span>
        <span className="font-medium text-foreground">{diagnostic.label}</span>
      </p>
    </header>
  );
}
