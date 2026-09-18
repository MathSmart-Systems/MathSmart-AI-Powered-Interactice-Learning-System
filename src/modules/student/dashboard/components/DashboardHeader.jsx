import React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Sparkles } from "lucide-react";

import { greetingFor } from "../utils/format";
import { STUDENT_ROUTE } from "../utils/dashboard-model";

/**
 * Welcome banner conforming to the MathSmart UI/UX reference.
 * Displays learner greeting, ARAL indicator, Grade 6 mathematics scope,
 * and quick diagnostic status card with action links.
 */
export function DashboardHeader({ learner, diagnostic }) {
  const name = learner.firstName;
  const isCompleted = diagnostic.label === "Completed";

  return (
    <header className="bg-card rounded-2xl p-6 sm:p-8 border border-border shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
          <Sparkles className="size-3.5" aria-hidden="true" />
          <span>ARAL Targeted Mathematics Learning</span>
        </div>
        <div>
          <p className="text-xs text-muted-foreground font-medium mb-0.5">Grade 6 mathematics</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground font-display tracking-tight">
            {greetingFor()}
            {name ? `, ${name}` : ""}!
          </h1>
        </div>
        <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">
          You are currently working on your Grade 6 mathematics competencies. Your targeted learning path is adjusted to your individual strengths and learning gaps.
        </p>
      </div>

      {/* Quick Diagnostic Card */}
      <div className="bg-muted/40 p-4 rounded-xl border border-border w-full md:w-auto min-w-[240px] shrink-0">
        <div className="text-xs text-muted-foreground font-medium">Diagnostic Assessment</div>
        <div className="flex items-center justify-between mt-1">
          <p className="text-sm font-bold text-foreground">
            <span className="text-muted-foreground font-normal">Diagnostic status </span>
            <span className="font-semibold">{diagnostic.label}</span>
          </p>
          {isCompleted ? (
            <span className="inline-flex items-center text-xs text-primary font-medium ml-2 shrink-0">
              <CheckCircle2 className="size-3.5 mr-1" aria-hidden="true" />
              Active
            </span>
          ) : (
            <span className="inline-flex items-center text-xs text-muted-foreground font-medium ml-2 shrink-0">
              <Clock className="size-3.5 mr-1" aria-hidden="true" />
              Pending
            </span>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-xs leading-normal">
          {diagnostic.summary}
        </p>
        <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/60">
          <Link
            id="view-diagnostic-results-btn"
            href={STUDENT_ROUTE.PROGRESS}
            className="text-xs font-semibold text-primary hover:underline cursor-pointer"
          >
            View Gap Analysis
          </Link>
          <span className="text-border" aria-hidden="true">|</span>
          <Link
            id="retake-diagnostic-btn"
            href={STUDENT_ROUTE.ASSESSMENTS}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Assessments
          </Link>
        </div>
      </div>
    </header>
  );
}
