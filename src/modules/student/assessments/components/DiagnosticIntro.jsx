"use client";

import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Sparkles,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function DiagnosticIntro({
  assessment,
  total = 0,
  timeLimitSeconds = 60 * 60,
  domains = [],
  starting = false,
  onBegin,
}) {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
          MathSmart adaptive learning
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          Let&apos;s find out exactly where to start.
        </h1>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <Card>
        <CardHeader className="gap-3">
          <Badge variant="outline" className="w-fit">
            {assessment?.reassessment_eligible
              ? "Authorized reassessment"
              : "Entry diagnostic"}
          </Badge>
          <CardTitle className="text-xl font-semibold">
            {assessment?.title ?? `${total} question mathematics diagnostic`}
          </CardTitle>
          <CardDescription className="max-w-prose leading-relaxed">
            {assessment?.reassessment_eligible
              ? assessment.reassessment_reason ??
                "Your teacher has authorized another diagnostic attempt."
              : "Your answers map your competency gaps and unlock a personalized module path. This is placement, not a graded exam."}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-8">
          <dl className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: BookOpen, term: `${total} questions`, detail: "Mixed answer formats" },
              {
                icon: Timer,
                term: `~${Math.round(timeLimitSeconds / 60)} minutes`,
                detail: "Timed, single sitting",
              },
              {
                icon: BarChart3,
                term: "Competency mapped",
                detail: "Personalized results",
              },
            ].map(({ icon: Icon, term, detail }) => (
              <div
                key={term}
                className="flex items-center gap-3 border border-border bg-background px-4 py-3"
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-primary" />
                <div className="min-w-0">
                  <dt className="truncate text-sm font-medium text-foreground">
                    {term}
                  </dt>
                  <dd className="truncate text-xs text-muted-foreground">{detail}</dd>
                </div>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-4">
            <h2 className="text-sm font-semibold text-foreground">
              Before you begin
            </h2>
            <ol className="flex flex-col gap-4">
              {[
                "Read every question fully. Some items look familiar but ask for something different.",
                `Answer all ${total}. A blank item counts as incorrect and can misplace your path.`,
                "There is no penalty for a wrong answer.",
                "The timer keeps running once you start. At 00:00 your work submits automatically.",
              ].map((line, position) => (
                <li key={line} className="flex gap-4">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground">
                    {position + 1}
                  </span>
                  <p className="max-w-prose text-sm leading-relaxed text-foreground">
                    {line}
                  </p>
                </li>
              ))}
            </ol>
          </div>

          {domains.length > 0 && (
            <div className="flex flex-wrap gap-2 border-t border-border pt-6">
              {domains.map((domain) => (
                <Badge key={domain} variant="secondary" className="font-normal">
                  {domain}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>

        <CardFooter className="flex flex-col items-stretch gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your results save to your learner profile the moment you submit.
          </p>
          <Button
            size="lg"
            onClick={onBegin}
            className="group"
            disabled={starting}
          >
            {starting
              ? "Starting…"
              : assessment?.reassessment_eligible
                ? "Start reassessment"
                : "Begin assessment"}
            {!starting && (
              <ArrowRight
                aria-hidden="true"
                className="transition-transform duration-300 ease-out group-hover:translate-x-1"
              />
            )}
          </Button>
        </CardFooter>
      </Card>
    </section>
  );
}
