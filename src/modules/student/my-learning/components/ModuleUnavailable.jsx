import Link from "next/link";
import { BookX, Lock, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";

import { MY_LEARNING_ROUTE } from "../utils/my-learning-model";

/**
 * The three things that can stand between a learner and a lesson, and the tone
 * each one deserves.
 *
 * A missing lesson (unpublished, not that learner's grade, gone) and a lesson
 * the learner's path has not opened yet are both written in the quiet voice and
 * point back at the lessons list: neither is anybody's mistake, and neither is
 * fixed by trying again. Only a service that did not answer is marked in the
 * marking-pen red, because that one is a software problem a retry can actually
 * fix. The locked wording says what to do next in short sentences a Grade 6
 * reader can follow, and never uses the word "forbidden", "denied" or "error"
 * for something that is simply not their turn yet.
 */
const KINDS = {
  not_found: {
    Icon: BookX,
    heading: "This lesson could not be found",
    body:
      "It may have been unpublished, or it may not be part of the Grade 6 lessons available to you. Return to My Learning to see the lessons that are.",
  },
  locked: {
    Icon: Lock,
    heading: "This lesson is not open yet",
    body:
      "Your learning path opens one lesson at a time, in order. Finish the lessons before this one and this lesson will open by itself. Go back to My Learning to see which lesson is ready for you now.",
  },
  error: {
    Icon: TriangleAlert,
    heading: "This lesson could not be loaded",
    body:
      "MathSmart could not reach the service that keeps this lesson. Nothing you have finished is lost. Try again in a moment, and tell your teacher if it keeps happening.",
  },
};

/**
 * What the module reader shows when the lesson cannot be read.
 *
 * `retryHref` is read only by the service-error kind, because it is the only
 * one of the three a second attempt can change.
 */
export function ModuleUnavailable({ kind, retryHref }) {
  const { Icon, heading, body } = KINDS[kind] ?? KINDS.error;
  const isProblem = kind !== "not_found" && kind !== "locked";

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
          isProblem
            ? "flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
            : "flex max-w-2xl flex-col gap-4 border-l-[3px] border-border bg-card px-6 py-6"
        }
      >
        <div
          className={
            isProblem
              ? "flex items-center gap-2.5 text-destructive"
              : "flex items-center gap-2.5 text-foreground"
          }
        >
          <Icon aria-hidden="true" className="size-4" />
          <h2 id="module-unavailable-heading" className="text-base font-semibold">
            {heading}
          </h2>
        </div>

        <p className="max-w-prose text-sm leading-relaxed text-foreground">{body}</p>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button asChild className="h-11 px-5">
            {isProblem ? (
              <a href={retryHref}>Try again</a>
            ) : (
              <Link href={MY_LEARNING_ROUTE}>Back to My Learning</Link>
            )}
          </Button>
        </div>
      </section>
    </div>
  );
}
