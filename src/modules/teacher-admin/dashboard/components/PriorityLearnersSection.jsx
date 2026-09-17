"use client";

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { FIELD_IDS, TEACHER_ROUTES } from "../utils/constants.js";

function formatStatus(status) {
  return status
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function PriorityLearnersSection({ learners }) {
  const hasLearners = Array.isArray(learners) && learners.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card shadow-xs p-6 sm:p-8 space-y-6 transition-colors">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive shrink-0" aria-hidden="true" />
            <h2 className="text-xl font-semibold text-foreground font-display tracking-tight">
              Students Requiring Attention
            </h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Learners flagged by low mastery, diagnostic baseline gaps, or active intervention triggers.
          </p>
        </div>

        <Link
          id={FIELD_IDS.OPEN_INTERVENTIONS_LINK}
          href={TEACHER_ROUTES.INTERVENTIONS}
          className="text-xs font-medium text-primary hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>Open Dedicated Intervention Hub</span>
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {!hasLearners ? (
        <div className="p-6 rounded-lg border border-dashed border-border text-center space-y-2">
          <CheckCircle2 className="size-6 text-primary mx-auto" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">
            No Students Currently Require Urgent Intervention
          </p>
          <p className="text-xs text-muted-foreground">
            All learners in this cohort are actively progressing within target mastery bands.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {learners.map((learner) => (
            <div
              key={learner.studentId || learner.learnerId}
              className="p-5 rounded-lg border border-border bg-card hover:border-muted-foreground/30 flex flex-col justify-between space-y-4 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="size-10 rounded-full bg-primary/10 border border-primary/20 text-primary font-bold text-xs flex items-center justify-center shrink-0">
                      {learner.initials}
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-foreground">
                        {learner.fullName}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {learner.sectionName} ({learner.learnerId})
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Badge variant="outline" className="text-xs font-normal">
                      {formatStatus(learner.monitoringStatus)}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        learner.activeInterventionCount > 0
                          ? "border-destructive/30 text-destructive bg-destructive/5 font-medium"
                          : "text-muted-foreground font-normal"
                      }
                    >
                      {learner.activeInterventionCount} active
                    </Badge>
                  </div>
                </div>

                <div className="bg-muted/40 p-3.5 rounded-md border border-border space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">
                      Diagnostic Baseline:
                    </span>
                    <span className="font-semibold text-foreground font-mono-math">
                      {learner.diagnosticFormatted}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-medium text-muted-foreground">
                      Current Mastery:
                    </span>
                    <span className="font-semibold font-mono-math text-foreground">
                      {learner.overallMasteryFormatted}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-border">
                    <span className="font-medium text-muted-foreground">
                      Status / Attempts:
                    </span>
                    <span className="font-medium text-destructive inline-flex items-center gap-1">
                      <ShieldAlert className="size-3 shrink-0" aria-hidden="true" />
                      <span>{learner.attemptSummary}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <Link
                  id={`${FIELD_IDS.VIEW_STUDENT_BTN_PREFIX}${learner.studentId}`}
                  href={`${TEACHER_ROUTES.STUDENTS}?student_id=${learner.studentId}`}
                  className="flex-1 py-2 px-3 rounded-lg border border-border bg-card hover:bg-muted text-xs font-medium text-foreground text-center transition-colors cursor-pointer"
                >
                  View Student
                </Link>
                <Link
                  id={`${FIELD_IDS.RECORD_INTERVENTION_BTN_PREFIX}${learner.studentId}`}
                  href={`${TEACHER_ROUTES.INTERVENTIONS}?student_id=${learner.studentId}`}
                  className="flex-1 py-2 px-3 rounded-lg bg-primary hover:bg-primary/90 text-xs font-medium text-primary-foreground text-center transition-colors cursor-pointer shadow-xs"
                >
                  Record Intervention
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
