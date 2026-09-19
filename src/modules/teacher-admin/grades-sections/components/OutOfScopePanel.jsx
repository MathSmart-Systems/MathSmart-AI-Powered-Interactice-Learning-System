"use client";

import { AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

import { MVP_GRADE_NAME } from "../utils/grade-scope";

import { DirectoryRow } from "./DirectoryRow";

/**
 * Records that predate the Grade 6-only rule.
 *
 * MathSmart teaches one grade, but a directory that has been in use may still
 * hold a grade at another level and the sections hung off it. Hiding them
 * would leave any learner in one of those sections unreachable, so they are
 * shown here instead: set apart from the working directory, named as outside
 * the curriculum, and retirable. Nothing here can be created or edited — the
 * only useful action left on a record outside the product is to retire it.
 */
export function OutOfScopePanel({
  grades,
  sections,
  allGrades,
  gradeNameFor,
  onRetireGrade,
  onRetireSection,
  workingGradeId,
  workingSectionId,
}) {
  const total = grades.length + sections.length;
  if (total === 0) return null;

  return (
    <section aria-labelledby="out-of-scope-heading">
      <Card className="border-border/70 bg-secondary/30">
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2
              id="out-of-scope-heading"
              className="flex items-center gap-2 font-display text-base font-semibold text-foreground"
            >
              <AlertTriangle aria-hidden="true" className="size-4 text-muted-foreground" />
              Outside the {MVP_GRADE_NAME} curriculum
            </h2>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {total === 1 ? "One record" : `${total} records`} in the directory{" "}
              {total === 1 ? "does" : "do"} not belong to {MVP_GRADE_NAME}. MathSmart has no
              curriculum behind them, so they cannot be edited here. Move any learners to a{" "}
              {MVP_GRADE_NAME} section first, then retire them.
            </p>
          </div>

          {grades.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Grades outside the curriculum
              </h3>
              <ul className="@container space-y-2">
                {grades.map((grade) => (
                  <DirectoryRow
                    key={grade.grade_id}
                    label={grade.name}
                    meta={`Level ${grade.level}`}
                    active={grade.is_active !== false}
                    onToggle={() => onRetireGrade(grade)}
                    working={workingGradeId === grade.grade_id}
                  />
                ))}
              </ul>
            </section>
          ) : null}

          {sections.length > 0 ? (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold tracking-wider text-muted-foreground uppercase">
                Sections outside the curriculum
              </h3>
              <ul className="@container space-y-2">
                {sections.map((section) => (
                  <DirectoryRow
                    key={section.section_id}
                    label={`${section.name} (${gradeNameFor(section, allGrades)})`}
                    meta="Not a Grade 6 section"
                    active={section.is_active !== false}
                    onToggle={() => onRetireSection(section)}
                    working={workingSectionId === section.section_id}
                  />
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
