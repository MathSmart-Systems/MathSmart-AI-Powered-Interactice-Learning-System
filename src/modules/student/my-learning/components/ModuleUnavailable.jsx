import Link from "next/link";
import { BookX, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MY_LEARNING_ROUTE } from "../utils/my-learning-model";

/**
 * What the module reader shows when the lesson cannot be read.
 *
 * A missing lesson (unpublished, not that learner's grade, gone) is written in
 * the quiet voice and points back at the lessons list. A service that did not
 * answer is marked in the marking-pen red, because it is a software problem a
 * retry can actually fix.
 */
export function ModuleUnavailable({ kind, retryHref }) {
  const notFound = kind === "not_found";

  return (
    <div className="flex flex-col gap-8">
      <Link
        href={MY_LEARNING_ROUTE}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Back to My Learning
      </Link>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Grade 6 mathematics</p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          My Learning
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <section
        aria-labelledby="module-unavailable-heading"
        className={
          notFound
            ? "flex max-w-2xl flex-col gap-4 border-l-[3px] border-border bg-card px-6 py-6"
            : "flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
        }
      >
        <div
          className={
            notFound
              ? "flex items-center gap-2.5 text-foreground"
              : "flex items-center gap-2.5 text-destructive"
          }
        >
          {notFound ? (
            <BookX aria-hidden="true" className="size-4" />
          ) : (
            <TriangleAlert aria-hidden="true" className="size-4" />
          )}
          <h2 id="module-unavailable-heading" className="text-base font-semibold">
            {notFound ? "This lesson could not be found" : "This lesson could not be loaded"}
          </h2>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-foreground">
          {notFound
            ? "It may have been unpublished, or it may not be part of the Grade 6 lessons available to you. Return to My Learning to see the lessons that are."
            : "MathSmart could not reach the service that keeps this lesson. Nothing you have finished is lost. Try again in a moment, and tell your teacher if it keeps happening."}
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild className="h-11 px-5">
            {notFound ? (
              <Link href={MY_LEARNING_ROUTE}>Back to My Learning</Link>
            ) : (
              <a href={retryHref}>Try again</a>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
