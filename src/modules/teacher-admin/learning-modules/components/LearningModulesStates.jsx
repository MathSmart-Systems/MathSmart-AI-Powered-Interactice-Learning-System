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
 * The library when the service did not answer. Marked in the marking-pen red
 * like the dashboard's own service error, because retrying is what fixes it.
 */
export function LearningModulesServiceError({ message = "The Learning Modules could not be loaded." }) {
  return (
    <section
      aria-labelledby="learning-modules-error-heading"
      className="flex max-w-2xl flex-col gap-4 border-l-[3px] border-destructive bg-destructive/5 px-6 py-6"
    >
      <div className="flex items-center gap-2.5 text-destructive">
        <TriangleAlert aria-hidden="true" className="size-4" />
        <h2 id="learning-modules-error-heading" className="text-base font-semibold">
          The Learning Modules could not be loaded
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
 * whether a teacher is looking at an empty library or searching for a module
 * that does not match.
 */
export function LearningModulesEmpty({ hasSearch }) {
  return hasSearch ? (
    <section
      aria-labelledby="learning-modules-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-border bg-card px-6 py-6"
    >
      <div className="flex items-center gap-2.5 text-muted-foreground">
        <SearchX aria-hidden="true" className="size-4" />
        <h2 id="learning-modules-empty-heading" className="text-base font-semibold">
          No modules match your search
        </h2>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        Nothing in the library has that text yet. Clear the search to see every module, or
        write a new one.
      </p>

      <div className="pt-1">
        <Button asChild variant="outline" className="h-11 px-5">
          <Link href="/teacher/learning-modules">Clear search</Link>
        </Button>
      </div>
    </section>
  ) : (
    <section
      aria-labelledby="learning-modules-empty-heading"
      className="flex flex-col gap-4 border-l-[3px] border-primary bg-card px-6 py-6"
    >
      <h2 id="learning-modules-empty-heading" className="text-base font-semibold text-primary">
        No modules yet
      </h2>

      <p className="max-w-prose text-sm leading-relaxed text-foreground">
        This library is where the learning path is authored. Add the first module to build
        from.
      </p>
    </section>
  );
}