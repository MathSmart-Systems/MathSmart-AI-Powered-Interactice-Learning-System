"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleCheck,
  Lightbulb,
  Lock,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { saveModuleProgress } from "../services/api";
import { completionSentence, formatMinutes, progressLabel } from "../utils/format";
import { activityRoute, MY_LEARNING_ROUTE } from "../utils/my-learning-model";
import { pathItemStatus } from "../utils/status";

function readPercent(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
}

function readIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
}

function SectionToggle({ section, saving, onChange }) {
  return (
    <label
      className={`flex cursor-pointer items-center gap-3 border border-border bg-card px-4 py-3 ${
        saving ? "opacity-70" : ""
      }`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={section.done}
        disabled={saving}
        onChange={() => onChange(section.id)}
      />
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center border border-input bg-background transition-colors peer-checked:border-primary peer-checked:bg-primary"
      >
        {section.done ? <Check className="size-3.5 text-primary-foreground" /> : null}
      </span>
      <span className="text-sm text-foreground">{section.label}</span>
    </label>
  );
}

function SubHeading({ id, title, description }) {
  return (
    <div className="flex flex-col gap-1">
      <h2
        id={id}
        className="font-display text-xl font-semibold tracking-tight text-foreground"
      >
        {title}
      </h2>
      {description ? (
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The reader for one lesson.
 *
 * The server component supplies the lesson and the learner's own progress; this
 * component owns the one interaction of the workflow — ticking each finished
 * section. Every tick saves to the API, and the completion percentage shown is
 * always the API's answer, never a client-side count. Ticks are disabled while
 * a save is in flight so the checklist and the server never disagree, and a
 * failed save reverts the tick and offers a retry.
 */
export function ModuleReader({ module }) {
  const orderedRef = useRef(module.sections.map((section) => section.id));
  const firstRunRef = useRef(true);

  const [sections, setSections] = useState(() =>
    module.sections.map((section) => ({ ...section })),
  );
  const [percent, setPercent] = useState(module.progress.percent ?? 0);
  const [isComplete, setIsComplete] = useState(
    module.progress.isComplete || module.allSectionsFinished,
  );
  const [knownFinished, setKnownFinished] = useState(
    () => new Set(module.sections.filter((section) => section.done).map((section) => section.id)),
  );
  const knownFinishedRef = useRef(knownFinished);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [savedMessage, setSavedMessage] = useState(false);
  const failedLastIdRef = useRef(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (firstRunRef.current) {
      firstRunRef.current = false;
      return undefined;
    }
    if (!savedMessage) {
      return undefined;
    }
    const timer = setTimeout(() => setSavedMessage(false), 3000);
    return () => clearTimeout(timer);
  }, [savedMessage]);

  function applyServerProgress(data) {
    if (!data) {
      return;
    }
    const confirmed = new Set(readIds(data.completed_section_ids));
    setKnownFinished(confirmed);
    knownFinishedRef.current = confirmed;
    setSections((prev) => prev.map((section) => ({ ...section, done: confirmed.has(section.id) })));
    setPercent(readPercent(data.completion_percentage ?? data.completionPercentage));
    setIsComplete(Boolean(data.is_complete ?? data.isComplete));
  }

  async function persist(completedIds, lastId, revertTo) {
    if (!module.id || savingRef.current) {
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSavedMessage(false);

    const result = await saveModuleProgress(module.id, {
      completedSectionIds: completedIds,
      lastSectionId: lastId,
    });

    savingRef.current = false;
    setSaving(false);

    if (result.ok) {
      applyServerProgress(result.data);
      setSavedMessage(true);
    } else {
      knownFinishedRef.current = revertTo;
      setKnownFinished(revertTo);
      setSections((prev) =>
        prev.map((section) => ({ ...section, done: revertTo.has(section.id) })),
      );
      failedLastIdRef.current = lastId;
      setSaveError(result.error || "Your progress could not be saved just now.");
    }
  }

  function toggleSection(sectionId) {
    if (savingRef.current) {
      return;
    }
    const before = new Set(knownFinishedRef.current);
    const next = new Set(before);
    if (next.has(sectionId)) {
      next.delete(sectionId);
    } else {
      next.add(sectionId);
    }

    knownFinishedRef.current = next;
    setKnownFinished(next);
    setSections((prev) =>
      prev.map((section) => (section.id === sectionId ? { ...section, done: next.has(sectionId) } : section)),
    );

    const completedIds = orderedRef.current.filter((id) => next.has(id));
    persist(completedIds, sectionId, before);
  }

  function retrySave() {
    if (savingRef.current) {
      return;
    }
    const completedIds = orderedRef.current.filter((id) => knownFinishedRef.current.has(id));
    const lastId = failedLastIdRef.current ?? orderedRef.current[0] ?? null;
    persist(completedIds, lastId, knownFinishedRef.current);
  }

  const status = pathItemStatus(module.pathStatus);
  const minutes = formatMinutes(module.minutes);
  const progressText = progressLabel({ percent, isComplete });
  const linkedActivities = module.activities.filter((activity) => activity.id);
  const hasActivities = module.activities.length > 0;

  return (
    <div className="flex flex-col gap-10">
      <Link
        href={MY_LEARNING_ROUTE}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to My Learning
      </Link>

      <header className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{module.competencyName}</p>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
          {module.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <CircleCheck aria-hidden="true" className="size-4 text-primary" />
            {status.label}
          </span>
          {minutes ? <span className="text-muted-foreground">{minutes}</span> : null}
          <span className="text-muted-foreground">{completionSentence({ percent, isComplete })}</span>
        </p>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <section aria-labelledby="progress-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <SubHeading id="progress-heading" title="Your progress" />
          <p className="text-sm font-medium text-foreground">{progressText}</p>
        </div>

        <div className="flex flex-col gap-5 border border-border bg-card px-5 py-5">
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Your progress in this lesson"
            className="h-2 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Mark each part when you finish it, and your progress saves as you go.
          </p>

          {module.sections.length === 0 ? (
            <p className="border-l-[3px] border-border bg-background px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              There is nothing to mark in this lesson yet because it has no content.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {sections.map((section) => (
                <SectionToggle
                  key={section.id}
                  section={section}
                  saving={saving}
                  onChange={toggleSection}
                />
              ))}
            </div>
          )}

          {isComplete ? (
            <p className="inline-flex w-fit items-center gap-2 border border-primary/40 bg-primary/5 px-3 py-1.5 text-sm font-medium text-foreground">
              <CircleCheck aria-hidden="true" className="size-4 text-primary" />
              Lesson complete
            </p>
          ) : null}

          <div aria-live="polite" className="min-h-5 text-sm" data-slot="save-feedback">
            {saving ? (
              <p className="text-muted-foreground">Saving your progress…</p>
            ) : saveError ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-destructive">
                <span>{saveError}</span>
                <button
                  type="button"
                  onClick={retrySave}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground shadow-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Try again
                </button>
              </p>
            ) : savedMessage ? (
              <p className="text-foreground">Progress saved.</p>
            ) : null}
          </div>
        </div>
      </section>

      {module.objective ? (
        <div className="flex gap-3 border-l-[3px] border-primary bg-card px-5 py-4">
          <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-semibold text-foreground">Learning objective</p>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {module.objective}
            </p>
          </div>
        </div>
      ) : null}

      {module.explanation ? (
        <section aria-labelledby="big-idea-heading" className="flex flex-col gap-4">
          <SubHeading id="big-idea-heading" title="The big idea" />
          <p className="max-w-prose text-sm leading-relaxed text-foreground">
            {module.explanation}
          </p>
        </section>
      ) : null}

      {module.ruleCount > 0 ? (
        <section aria-labelledby="rules-heading" className="flex flex-col gap-4">
          <SubHeading
            id="rules-heading"
            title="Core rules"
            description="The short rules that make this lesson work, one to remember at a time."
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {module.rules.map((rule, index) => (
              <li key={`${rule.title}-${index}`} className="flex flex-col gap-3 border border-border bg-card px-5 py-5">
                <h3 className="font-medium text-foreground">{rule.title || `Rule ${index + 1}`}</h3>
                {rule.formula ? (
                  <code className="w-fit rounded-md bg-secondary px-2.5 py-1 font-mono text-sm text-foreground">
                    {rule.formula}
                  </code>
                ) : null}
                {rule.explanation ? (
                  <p className="text-sm leading-relaxed text-foreground">{rule.explanation}</p>
                ) : null}
                {rule.visual ? (
                  <div className="relative overflow-hidden border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground">
                    <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-40" />
                    <span className="relative">{rule.visual}</span>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {module.exampleCount > 0 ? (
        <section aria-labelledby="examples-heading" className="flex flex-col gap-4">
          <SubHeading
            id="examples-heading"
            title="Worked examples"
            description="See the rules doing their job on real problems, step by step."
          />
          <div className="flex flex-col gap-5 border border-border bg-card px-5 py-5 sm:px-6 sm:py-6">
            {module.workedExamples.map((example, index) => (
              <article
                key={index}
                className="flex gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-input font-display text-sm font-semibold text-foreground"
                >
                  {index + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-3">
                  <p className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                    {example.problem}
                  </p>

                  {example.steps.length > 0 ? (
                    <ol className="flex flex-col gap-1.5 text-sm leading-relaxed text-foreground">
                      {example.steps.map((step, stepIndex) => (
                        <li key={stepIndex} className="flex gap-2.5">
                          <span className="shrink-0 font-medium text-primary">{stepIndex + 1}.</span>
                          <span>{step}</span>
                        </li>
                      ))}
                    </ol>
                  ) : null}

                  <div className="flex flex-col gap-1 rounded-md border border-border bg-background px-4 py-3">
                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      Solution
                    </p>
                    <p className="font-mono text-sm text-foreground">{example.solution}</p>
                  </div>

                  {example.tip ? (
                    <p className="flex gap-2 text-sm leading-relaxed text-muted-foreground">
                      <Lightbulb aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>{example.tip}</span>
                    </p>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section aria-labelledby="practice-heading" className="flex flex-col gap-4">
        {isComplete && hasActivities ? (
          <div className="on-shell relative overflow-hidden border border-shell-border bg-shell text-shell-foreground">
            <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-70" />
            <div className="relative flex flex-col gap-5 px-6 py-7 sm:px-8 sm:py-9">
              <p className="flex items-center gap-2 text-sm font-medium text-shell-accent">
                <CircleCheck aria-hidden="true" className="size-4" />
                Lesson complete
              </p>
              <div className="flex flex-col gap-2">
                <h2
                  id="practice-heading"
                  className="max-w-[24ch] font-display text-3xl leading-tight font-semibold tracking-tight text-white"
                >
                  Now put it into practice
                </h2>
                <p className="max-w-prose text-sm leading-relaxed text-shell-foreground">
                  You finished every part of the lesson. The activity below lets you use what
                  you just learned, and your score tells your teacher you are ready for the
                  next step.
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
                {linkedActivities.map((activity) => (
                  <Button
                    key={activity.id}
                    asChild
                    className="h-12 w-full bg-background px-6 text-base font-semibold text-shell hover:bg-white sm:w-auto"
                  >
                    <Link href={activityRoute(activity.id)}>
                      Practice · {activity.title}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            <SubHeading id="practice-heading" title="Practice what you learned" />
            {hasActivities ? (
              <div className="flex flex-col border border-border bg-card">
                {module.activities.map((activity, index) => (
                  <div
                    key={activity.id ?? `activity-${index}`}
                    className="flex items-center gap-3 border-t border-border px-5 py-4 first:border-t-0"
                  >
                    <Lock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <p className="text-sm font-medium text-foreground">{activity.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Opens when you finish this lesson
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
                No practice activity is linked to this lesson yet. Your teacher adds one from
                the teacher workspace when it is ready.
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}