"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { RotateCcw, SearchX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import { questionBankUrl } from "../utils/urls.js";

/** Refreshes the current route after a Question Bank read failure. */
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

      <p className="max-w-prose text-sm leading-relaxed text-foreground">{message}</p>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <RetryButton label="Try again" />
      </div>
    </section>
  );
}

/** What an empty publication state means when nothing is filtering it. */
const EMPTY_BY_STATUS = Object.freeze({
  published: {
    heading: "No published questions yet",
    body: "Publish a draft and it appears here, ready to attach to an activity or an assessment.",
  },
  draft: {
    heading: "No drafts yet",
    body: "Use “New question” to start writing one. A draft is only visible to you until you publish it.",
  },
  archived: {
    heading: "No archived questions yet",
    body: "Archive a question and it appears here, kept with its history and ready to restore.",
  },
});

/**
 * The list when there is nothing to show.
 *
 * The wording depends on whether a filter is narrowing the bank or the state
 * itself is genuinely empty. It used to say "No questions yet. Add the first
 * one" whenever the page came back empty, which it also did for an
 * out-of-range page number on a bank holding dozens of questions.
 */
export function QuestionBankEmpty({ status, hasFilter }) {
  const empty = EMPTY_BY_STATUS[status] ?? EMPTY_BY_STATUS.draft;

  return hasFilter ? (
    <section
      aria-labelledby="question-bank-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-border bg-card px-6 py-6"
    >
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <SearchX aria-hidden="true" className="size-4" />
        <h2 id="question-bank-empty-heading" className="text-base font-semibold">
          No questions match these filters
        </h2>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        Nothing in this state matches what you searched for. Clear the filters to see every
        question in it, or write a new one.
      </p>

      <div className="pt-1">
        <Button asChild variant="outline" className="h-11 px-5">
          <Link href={questionBankUrl({ status })}>Clear filters</Link>
        </Button>
      </div>
    </section>
  ) : (
    <section
      aria-labelledby="question-bank-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
    >
      <h2 id="question-bank-empty-heading" className="text-base font-semibold text-primary">
        {empty.heading}
      </h2>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">{empty.body}</p>
    </section>
  );
}
