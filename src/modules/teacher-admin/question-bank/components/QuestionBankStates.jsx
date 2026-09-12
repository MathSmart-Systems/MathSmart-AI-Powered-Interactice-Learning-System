"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

function RetryButton({ label = "Try again" }) {
  const router = useRouter();

  return (
    <Button type="button" className="h-11 px-5" onClick={() => router.refresh()}>
      <RotateCcw aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}

/**
 * The bank when the service did not answer. Marked in the marking-pen red like
 * the dashboard's own service error, because retrying is what fixes it.
 */
export function QuestionBankServiceError({ message = "The Question Bank could not be loaded." }) {
  return (
    <section
      aria-labelledby="question-bank-error-heading"
      className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
    >
      <div className="flex items-center gap-2.5 text-destructive">
        <TriangleAlert aria-hidden="true" className="size-4" />
        <h2 id="question-bank-error-heading" className="text-base font-semibold">
          The Question Bank could not be loaded
        </h2>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        {message}
      </p>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <RetryButton label="Try again" />
      </div>
    </section>
  );
}

/**
 * The list when there is nothing to show. The wording changes depending on
 * whether a teacher is looking at an empty bank or searching for a question
 * that does not match.
 */
export function QuestionBankEmpty({ hasSearch, onClearSearch }) {
  return hasSearch ? (
    <section
      aria-labelledby="question-bank-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-border bg-card px-6 py-6"
    >
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <SearchX aria-hidden="true" className="size-4" />
        <h2 id="question-bank-empty-heading" className="text-base font-semibold">
          No questions match your search
        </h2>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        Nothing in the bank has that text yet. Clear the search to see every question, or
        write a new one.
      </p>

      <div className="pt-1">
        <Button
          asChild
          variant="outline"
          className="h-11 px-5"
        >
          <Link href="/teacher/question-bank" onClick={onClearSearch}>
            Clear search
          </Link>
        </Button>
      </div>
    </section>
  ) : (
    <section
      aria-labelledby="question-bank-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
    >
      <h2 id="question-bank-empty-heading" className="text-base font-semibold text-primary">
        No questions yet
      </h2>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        This bank is where your activity and assessment questions live. Add the first one to
        build from.
      </p>
    </section>
  );
}