"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";

import { DIFFICULTY_OPTIONS, QUESTION_TYPES, SELECT_CLASS } from "../constants";
import { questionBankUrl } from "../utils/urls.js";

/**
 * Competency, type and difficulty, narrowed by the API.
 *
 * Native selects rather than a popover: they cannot be clipped by a card, they
 * cannot open a second scrollbar inside the list, they flip against the
 * viewport edge by themselves, and on a phone they are the platform's own
 * picker. Changing one is a navigation, because every filter lives in the
 * address — which is what lets the server filter before it takes a page.
 */
export function QuestionFilters({ filters, competencies, competenciesAvailable }) {
  const router = useRouter();
  const baseId = useId();

  /** Applies one changed filter, returning to the first page. */
  function apply(change) {
    router.push(questionBankUrl({ ...filters, ...change, page: 1 }));
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${baseId}-competency`}>Competency</Label>
        <select
          id={`${baseId}-competency`}
          className={SELECT_CLASS}
          value={filters.competencyId}
          disabled={!competenciesAvailable}
          onChange={(event) => apply({ competencyId: event.target.value })}
        >
          <option value="">All competencies</option>
          {competencies.map((competency) => (
            <option key={competency.id} value={competency.id}>
              {competency.label}
            </option>
          ))}
        </select>
        {competenciesAvailable ? null : (
          <p className="text-sm text-muted-foreground">
            Competencies could not be loaded, so this filter is unavailable. Reload the page to
            try again.
          </p>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${baseId}-type`}>Question type</Label>
        <select
          id={`${baseId}-type`}
          className={SELECT_CLASS}
          value={filters.questionType}
          onChange={(event) => apply({ questionType: event.target.value })}
        >
          <option value="">All types</option>
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <Label htmlFor={`${baseId}-difficulty`}>Difficulty</Label>
        <select
          id={`${baseId}-difficulty`}
          className={SELECT_CLASS}
          value={filters.difficulty}
          onChange={(event) => apply({ difficulty: event.target.value })}
        >
          <option value="">All difficulties</option>
          {DIFFICULTY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
