"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleCheck,
  History,
  Lightbulb,
  Lock,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";

import { CONTENT_LOCKED, saveModuleProgress } from "../services/api";
import {
  completionRule,
  FINISHED,
  PASS_THE_ACTIVITY,
  practiceActivities,
  READ_IT_ALL,
} from "../utils/completion";
import { formatMinutes, readingLabel } from "../utils/format";
import { activityRoute, MY_LEARNING_ROUTE } from "../utils/my-learning-model";
import {
  isOnScreenEnough,
  progressPayload,
  READING_DWELL_MS,
  READING_QUIET_MS,
} from "../utils/reading";
import { pathItemStatus } from "../utils/status";

import { StatusIcon } from "./StatusIcon";

function readPercent(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : 0;
}

function readIds(value) {
  return Array.isArray(value) ? value.filter((id) => typeof id === "string") : [];
}

const RESUME_NOTE_ID = "resume-note";

/**
 * The line that says where a learner stopped last time.
 *
 * It used to sit inside the checklist item for the section; with the checklist
 * gone it sits at the top of the section itself, which is where the learner is
 * being sent. The words and the glyph are unchanged on purpose — a learner who
 * has seen "You left off here" before should meet the same phrase in the same
 * shape rather than have to learn a new one.
 */
function ResumeMarker() {
  return (
    <p
      id={RESUME_NOTE_ID}
      className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-primary"
    >
      <History aria-hidden="true" className="size-3.5" />
      You left off here
    </p>
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
 * The glyph beside each of the three things that can finish a lesson.
 *
 * Three different shapes for three different sentences, so the difference
 * between "you have finished this", "pass the activity" and "read it all"
 * survives a greyscale print and a learner who cannot separate the hues. The
 * words carry the meaning; the glyph only makes it quicker to find.
 */
const COMPLETION_ICON = {
  [FINISHED]: CircleCheck,
  [PASS_THE_ACTIVITY]: Target,
  [READ_IT_ALL]: BookOpen,
};

/**
 * The reader for one lesson.
 *
 * The server component supplies the lesson and the learner's own progress. What
 * this component owns is the recording of reading — and only the recording of
 * it. There used to be a checklist here: a learner ticked each part of the
 * lesson, the ticks drove the completion percentage, and the percentage closed
 * their path item. That made a Grade 6 learner the judge of their own mastery,
 * and four taps unlocked a term's work. `app.module_is_satisfied` now settles
 * completion from a passed activity, so the checklist had nothing left to
 * certify and has been taken away rather than left on screen to mislead.
 *
 * Reading is recorded by watching the lesson instead of asking about it. An
 * `IntersectionObserver` marks a section read once enough of it has held still
 * on screen for a couple of seconds, newly read sections are collected, and a
 * single save goes out when the reading settles. That is the mechanism this
 * component can defend: it records what a learner did rather than what they
 * claimed, it cannot be satisfied by a tap, and it asks nothing of a learner
 * who is trying to read. It is evidence of reading and no more, which is
 * exactly what reading progress is now worth.
 *
 * Nothing here navigates. There is no `router.push`, no `router.refresh` and no
 * server action, so a save never re-runs the route and never replaces the
 * lesson with a loading shape. Nothing is disabled, greyed out or moved while a
 * save is in flight either: the learner did not ask for the save and must not
 * be interrupted by it. The only things that move are the progress bar and its
 * label.
 */
export function ModuleReader({ module }) {
  const orderedRef = useRef(module.sections.map((section) => section.id));

  const [percent, setPercent] = useState(module.progress.percent ?? 0);
  const [readingComplete, setReadingComplete] = useState(
    module.progress.isComplete || module.allSectionsFinished,
  );
  const [saveError, setSaveError] = useState(null);
  const [lockedNow, setLockedNow] = useState(false);

  /**
   * What the server has confirmed, and what is still on its way there.
   *
   * These are refs rather than state because nothing on screen is drawn from
   * them: the percentage the learner sees is always the API's answer. Keeping
   * them out of state also keeps a section being read from re-rendering the
   * lesson a learner is in the middle of.
   */
  const knownFinishedRef = useRef(
    new Set(module.sections.filter((section) => section.done).map((section) => section.id)),
  );
  const pendingRef = useRef([]);
  const savingRef = useRef(false);
  const lockedRef = useRef(false);
  const flushTimerRef = useRef(null);

  const headerRef = useRef(null);
  const sectionNodes = useRef(new Map());
  const refCache = useRef(new Map());

  /**
   * A stable ref callback per section.
   *
   * React calls a ref callback with `null` and then the node again whenever its
   * identity changes, so building the callback inline would tear the whole map
   * down on every render and, with it, the observer's idea of what it is
   * watching. Caching one callback per section id keeps the identities stable
   * for the life of the reader.
   */
  const sectionRef = useCallback((sectionId) => {
    const cache = refCache.current;
    if (!cache.has(sectionId)) {
      cache.set(sectionId, (node) => {
        if (node) {
          sectionNodes.current.set(sectionId, node);
        } else {
          sectionNodes.current.delete(sectionId);
        }
      });
    }
    return cache.get(sectionId);
  }, []);

  /**
   * The section the learner was last looking at, if going back to it still
   * means anything.
   *
   * It is read once, from the server's own answer at the time the page was
   * rendered, and not from anything that moves while the learner reads — a
   * section read in this visit is not a place to be sent back to. A lesson
   * already read through has no "left off" at all, and an id naming a section
   * this lesson no longer has is ignored rather than guessed at.
   */
  const resumeSectionId = useMemo(() => {
    const lastId = module.progress.lastSectionId;
    if (!lastId || module.progress.isComplete || module.allSectionsFinished) {
      return null;
    }
    return module.sections.some((section) => section.id === lastId) ? lastId : null;
  }, [module]);

  const resumeProps = (sectionId) =>
    sectionId === resumeSectionId ? { tabIndex: -1, "aria-describedby": RESUME_NOTE_ID } : null;

  /**
   * Going back to that section, once, on arrival.
   *
   * Focus moves rather than only the scrollbar, because a learner reading with
   * the keyboard or a screen reader gains nothing from a page that has quietly
   * scrolled somewhere: they are told where they are, and their next Tab
   * carries on from there instead of from the top of the lesson. The target is
   * now the section itself rather than a checkbox inside it, which is why it
   * carries `tabIndex={-1}` — it is focusable to be landed on, not to be tabbed
   * through. `preventScroll` keeps the browser from making its own jump first,
   * and `block: "nearest"` then moves the page by the least it can — never to
   * the top, and not at all when the section is already on screen. A learner
   * who has asked for less motion gets the same move without the animation.
   */
  useEffect(() => {
    if (!resumeSectionId) {
      return;
    }
    const node = sectionNodes.current.get(resumeSectionId);
    if (!node) {
      return;
    }

    node.focus({ preventScroll: true });

    const stillness = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    node.scrollIntoView({
      block: "nearest",
      behavior: stillness?.matches ? "auto" : "smooth",
    });
  }, [resumeSectionId]);

  function applyServerProgress(data) {
    if (!data) {
      return;
    }
    knownFinishedRef.current = new Set(readIds(data.completed_section_ids));
    setPercent(readPercent(data.completion_percentage ?? data.completionPercentage));
    setReadingComplete(Boolean(data.is_complete ?? data.isComplete));
  }

  /**
   * One save, and never two at once.
   *
   * Nothing on screen is rolled back when a save fails, because nothing was
   * moved forward in anticipation of it: the percentage only ever shows what
   * the API confirmed. The sections that failed to save go back on the queue
   * instead, so the next batch carries them and an ordinary reader recovers
   * without noticing. `Try again` is there for a learner who stops reading at
   * the point the error appears.
   */
  async function persist(completedIds, lastId) {
    if (!module.id || savingRef.current) {
      return { ok: false };
    }
    savingRef.current = true;
    setSaveError(null);

    const result = await saveModuleProgress(module.id, {
      completedSectionIds: completedIds,
      lastSectionId: lastId,
    });

    savingRef.current = false;

    if (result.ok) {
      applyServerProgress(result.data);
      return result;
    }

    // 412 `content_locked` is the database refusing a write against a module
    // the learner's path has not opened. It is not a fault and a retry cannot
    // change it, so it is answered with an explanation and no "Try again"
    // button, and the reader stops recording rather than collecting sections
    // for a save that will be refused again.
    if (result.code === CONTENT_LOCKED) {
      lockedRef.current = true;
      pendingRef.current = [];
      setLockedNow(true);
      setSaveError(null);
      return result;
    }

    setSaveError(result.error || "Your reading could not be saved just now.");
    return result;
  }

  async function flushPending() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (lockedRef.current) {
      return;
    }
    if (savingRef.current) {
      // A save is already in flight. Waiting one more quiet window is cheaper
      // than queueing a second request against the same row.
      scheduleFlush();
      return;
    }

    const sending = pendingRef.current;
    const payload = progressPayload({
      orderedIds: orderedRef.current,
      confirmedIds: [...knownFinishedRef.current],
      justRead: sending,
    });

    pendingRef.current = [];

    if (!payload) {
      return;
    }

    const result = await persist(payload.completedSectionIds, payload.lastSectionId);

    if (!result.ok && result.code !== CONTENT_LOCKED) {
      pendingRef.current = [...sending, ...pendingRef.current];
    }
  }

  function scheduleFlush() {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
    }
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      flushPending();
    }, READING_QUIET_MS);
  }

  function markRead(ids) {
    if (lockedRef.current) {
      return;
    }
    const fresh = ids.filter(
      (id) => !knownFinishedRef.current.has(id) && !pendingRef.current.includes(id),
    );
    if (fresh.length === 0) {
      return;
    }
    pendingRef.current = [...pendingRef.current, ...fresh];
    scheduleFlush();
  }

  /**
   * The current versions of the two functions the observer needs.
   *
   * The observer is built once and outlives every render; these functions are
   * rebuilt with each one because they close over props and setters. Reaching
   * for them through a ref is what lets the observer stay put instead of being
   * torn down and rebuilt — which would restart every section's dwell timer —
   * each time a save comes back and the percentage moves.
   */
  const handlersRef = useRef({});
  useEffect(() => {
    handlersRef.current = { markRead, flushPending };
  });

  /**
   * Watching the lesson, so the learner does not have to report on it.
   *
   * Every section of the lesson is one element on screen, and a section counts
   * as read when enough of it has been on screen — see `isOnScreenEnough` for
   * what "enough" means for a short section and for one taller than the window
   * — without interruption for `READING_DWELL_MS`. A timer per element is what
   * makes the difference between reading and scrolling past: the observer fires
   * on both, and only reading leaves the section still there two seconds later.
   *
   * Sections the server has already confirmed are not watched at all, so
   * re-reading a finished lesson is free. An element stops being watched as
   * soon as every section it carries has been recorded.
   *
   * `objective` and `concept` exist for every module whether or not the teacher
   * wrote anything into them — `app.module_section_ids` always lists both — so
   * when there is nothing on screen for one of them its anchor falls back to
   * the lesson header. A section with no content cannot be read, and leaving it
   * unrecorded would hold a learner permanently below 100%.
   */
  useEffect(() => {
    if (lockedNow || typeof IntersectionObserver === "undefined") {
      return undefined;
    }

    const sectionsFor = new Map();
    for (const sectionId of orderedRef.current) {
      const node = sectionNodes.current.get(sectionId) ?? headerRef.current;
      if (!node) {
        continue;
      }
      const existing = sectionsFor.get(node);
      if (existing) {
        existing.push(sectionId);
      } else {
        sectionsFor.set(node, [sectionId]);
      }
    }

    const dwellTimers = new Map();

    function stopDwell(node) {
      const timer = dwellTimers.get(node);
      if (timer) {
        clearTimeout(timer);
        dwellTimers.delete(node);
      }
    }

    function unread(node) {
      return (sectionsFor.get(node) ?? []).filter(
        (id) => !knownFinishedRef.current.has(id) && !pendingRef.current.includes(id),
      );
    }

    let observer = null;

    function startDwell(node) {
      if (dwellTimers.has(node)) {
        return;
      }
      dwellTimers.set(
        node,
        setTimeout(function elapsed() {
          // A lesson left open in a background tab is not being read. The dwell
          // starts again when the tab comes back rather than being abandoned,
          // because the section is still on screen and the observer has no
          // reason to fire again.
          if (typeof document !== "undefined" && document.hidden) {
            dwellTimers.set(node, setTimeout(elapsed, READING_DWELL_MS));
            return;
          }
          dwellTimers.delete(node);
          const ids = unread(node);
          if (ids.length > 0) {
            handlersRef.current.markRead?.(ids);
          }
          if (unread(node).length === 0) {
            observer?.unobserve(node);
          }
        }, READING_DWELL_MS),
      );
    }

    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target;
          if (unread(node).length === 0) {
            stopDwell(node);
            observer?.unobserve(node);
            continue;
          }

          const enough =
            entry.isIntersecting &&
            isOnScreenEnough({
              visibleHeight: entry.intersectionRect.height,
              sectionHeight: entry.boundingClientRect.height,
              viewportHeight: entry.rootBounds?.height ?? window.innerHeight,
            });

          if (enough) {
            startDwell(node);
          } else {
            stopDwell(node);
          }
        }
      },
      // Several thresholds rather than one, so a section that scrolls into view
      // gradually is measured on the way in rather than only when it crosses a
      // single line.
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );

    for (const node of sectionsFor.keys()) {
      if (unread(node).length > 0) {
        observer.observe(node);
      }
    }

    return () => {
      observer.disconnect();
      for (const timer of dwellTimers.values()) {
        clearTimeout(timer);
      }
      dwellTimers.clear();
    };
  }, [lockedNow]);

  /**
   * Reading that has not been saved yet when the learner leaves.
   *
   * The quiet window is short, but a learner who reads the last worked example
   * and immediately taps through to the activity would otherwise lose it. Three
   * departures are covered because no one of them covers the others: leaving
   * the lesson for another route in the app unmounts this component without
   * firing anything, `pagehide` catches a real navigation away, and
   * `visibilitychange` catches a phone being locked or the app being switched
   * away from, which on mobile is often all that fires.
   */
  useEffect(() => {
    function flushIfLeaving() {
      if (pendingRef.current.length > 0) {
        handlersRef.current.flushPending?.();
      }
    }

    function flushIfHidden() {
      if (document.visibilityState === "hidden") {
        flushIfLeaving();
      }
    }

    window.addEventListener("pagehide", flushIfLeaving);
    document.addEventListener("visibilitychange", flushIfHidden);

    return () => {
      window.removeEventListener("pagehide", flushIfLeaving);
      document.removeEventListener("visibilitychange", flushIfHidden);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      flushIfLeaving();
    };
  }, []);

  const status = pathItemStatus(module.pathStatus);
  const minutes = formatMinutes(module.minutes);
  const practice = practiceActivities(module.activities);
  const finishing = completionRule({
    pathStatus: module.pathStatus,
    hasPracticeActivity: practice.length > 0,
    readingComplete,
  });
  const FinishingIcon = COMPLETION_ICON[finishing.kind] ?? BookOpen;
  const finished = finishing.kind === FINISHED;

  return (
    <div className="flex flex-col gap-10">
      <Link
        href={MY_LEARNING_ROUTE}
        className="inline-flex min-h-11 w-fit items-center gap-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to My Learning
      </Link>

      <header ref={headerRef} className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{module.competencyName}</p>
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-tight text-foreground sm:text-4xl">
          {module.title}
        </h1>
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="inline-flex items-center gap-1.5 text-foreground">
            {/* The glyph has to match the words. Every status used to be drawn
                with a tick, which told a learner halfway through a lesson that
                they had finished it. */}
            <StatusIcon status={module.pathStatus} className="size-4 text-primary" />
            {status.label}
          </span>
          {minutes ? <span className="text-muted-foreground">{minutes}</span> : null}
        </p>
        <span aria-hidden="true" className="mt-1 h-0.5 w-16 bg-primary" />
      </header>

      <section aria-labelledby="reading-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <SubHeading id="reading-heading" title="How far you have read" />
          <p className="text-sm font-medium text-foreground">{readingLabel(percent)}</p>
        </div>

        <div className="flex flex-col gap-4 border border-border bg-card px-5 py-5">
          {/*
            The bar is labelled as reading and nothing else, and its text
            alternative says the same words that are printed beside it. A
            learner who hears "78% read" is told how much of the page they have
            been through; they are not told they have finished anything, which
            is the mistake this screen used to make in both the label and the
            heading above it.
          */}
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={readingLabel(percent)}
            aria-label="How much of this lesson you have read"
            className="h-2 w-full overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full bg-primary transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>

          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            MathSmart saves this by itself as you read. There is nothing to tick.
            {module.sections.length === 0
              ? " This lesson has no content in it yet, so there is nothing to read."
              : null}
          </p>

          <div className="flex gap-3 border-l-[3px] border-primary bg-background px-4 py-3">
            <FinishingIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-sm font-semibold text-foreground">{finishing.title}</p>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
                {finishing.detail}
              </p>
              {finishing.kind === PASS_THE_ACTIVITY ? (
                // An in-page link rather than a link to the activity itself: a
                // learner halfway down a lesson is being shown where the thing
                // that finishes it lives, not being sent off to attempt it.
                <a
                  href="#practice-heading"
                  className="w-fit pt-0.5 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Find the practice activity below
                </a>
              ) : null}
            </div>
          </div>

          {/*
            A short line that keeps its own space whether or not it is saying
            anything, so the lesson does not shift by a line when a save fails
            and back again when it recovers. It stays empty for an ordinary
            save: the learner did not ask for one, the percentage above already
            reports it, and a live region that speaks every time a section
            scrolls by would make the lesson unreadable with a screen reader.
            Only something a learner has to act on is announced.
          */}
          <div aria-live="polite" className="min-h-5 text-sm" data-slot="save-feedback">
            {lockedNow ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-foreground">
                <Lock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="max-w-prose leading-relaxed">
                  This lesson is not open yet, so your reading was not saved. Finish the
                  lessons before it and come back — nothing you have already finished is
                  lost.
                </span>
                <Link
                  href={MY_LEARNING_ROUTE}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  Back to My Learning
                </Link>
              </p>
            ) : saveError ? (
              <p className="flex flex-wrap items-center gap-x-3 gap-y-2 text-destructive">
                <span>{saveError}</span>
                <button
                  type="button"
                  onClick={() => flushPending()}
                  className="inline-flex h-9 items-center rounded-md border border-border bg-background px-4 text-sm font-medium text-foreground shadow-xs outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  Try again
                </button>
              </p>
            ) : null}
          </div>
        </div>
      </section>

      {module.objective ? (
        <div
          ref={sectionRef("objective")}
          {...resumeProps("objective")}
          className="flex gap-3 border-l-[3px] border-primary bg-card px-5 py-4"
        >
          <Target aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="flex flex-col gap-1">
            {resumeSectionId === "objective" ? <ResumeMarker /> : null}
            <p className="text-sm font-semibold text-foreground">Learning objective</p>
            <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
              {module.objective}
            </p>
          </div>
        </div>
      ) : null}

      {module.explanation ? (
        <section
          ref={sectionRef("concept")}
          {...resumeProps("concept")}
          aria-labelledby="big-idea-heading"
          className="flex flex-col gap-4"
        >
          {resumeSectionId === "concept" ? <ResumeMarker /> : null}
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
            {module.rules.map((rule, index) => {
              const sectionId = `rule_${index + 1}`;
              return (
                <li
                  key={`${rule.title}-${index}`}
                  ref={sectionRef(sectionId)}
                  {...resumeProps(sectionId)}
                  className="flex flex-col gap-3 border border-border bg-card px-5 py-5"
                >
                  {resumeSectionId === sectionId ? <ResumeMarker /> : null}
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
              );
            })}
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
            {module.workedExamples.map((example, index) => {
              const sectionId = `example_${index + 1}`;
              return (
                <article
                  key={index}
                  ref={sectionRef(sectionId)}
                  {...resumeProps(sectionId)}
                  className="flex gap-4 border-t border-border pt-5 first:border-t-0 first:pt-0"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-input font-display text-sm font-semibold text-foreground"
                  >
                    {index + 1}
                  </span>
                  <div className="flex min-w-0 flex-1 flex-col gap-3">
                    {resumeSectionId === sectionId ? <ResumeMarker /> : null}
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
              );
            })}
          </div>
        </section>
      ) : null}

      {/*
        The practice activity is no longer behind a lock that reads "Opens when
        you finish this lesson". Since completion means passing that activity,
        that sentence described a door locked with its own key on the far side:
        a learner could read the whole lesson and never be allowed to do the one
        thing that would finish it. The activity is offered from the moment the
        lesson is open, and the call to action is loudest while the lesson is
        still unfinished, because that is when it is telling a learner something
        they need.
      */}
      <section aria-labelledby="practice-heading" className="flex flex-col gap-4">
        {practice.length > 0 ? (
          <div className="on-shell relative overflow-hidden border border-shell-border bg-shell text-shell-foreground">
            <div aria-hidden="true" className="grid-paper absolute inset-0 opacity-70" />
            <div className="relative flex flex-col gap-5 px-6 py-7 sm:px-8 sm:py-9">
              <p className="flex items-center gap-2 text-sm font-medium text-shell-accent">
                {finished ? (
                  <CircleCheck aria-hidden="true" className="size-4" />
                ) : (
                  <Target aria-hidden="true" className="size-4" />
                )}
                {finished ? "Lesson finished" : "What finishes this lesson"}
              </p>
              <div className="flex flex-col gap-2">
                <h2
                  id="practice-heading"
                  className="max-w-[24ch] font-display text-3xl leading-tight font-semibold tracking-tight text-white"
                >
                  {finished ? "You passed this lesson's activity" : "Pass the practice activity"}
                </h2>
                <p className="max-w-prose text-sm leading-relaxed text-shell-foreground">
                  {finished
                    ? "This lesson is finished and the next one is open. You can practise again whenever you want to."
                    : "Reading this lesson saves how far you have got, and that is worth keeping — but this lesson counts as finished once you answer enough of the practice activity correctly. Your score is what tells your teacher you are ready for the next lesson."}
                </p>
              </div>
              <div className="flex flex-col gap-3 pt-1 sm:flex-row sm:flex-wrap">
                {practice.map((activity) => (
                  <Button
                    key={activity.id}
                    asChild
                    className="h-12 w-full bg-background px-6 text-base font-semibold text-shell hover:bg-white sm:w-auto"
                  >
                    <Link href={activityRoute(activity.id)}>
                      {finished ? "Practise again · " : "Practice · "}
                      {activity.title}
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
            <p className="border-l-[3px] border-border bg-card px-5 py-4 text-sm leading-relaxed text-muted-foreground">
              No practice activity is linked to this lesson yet, so reading all of it is
              what finishes it. Your teacher adds an activity from the teacher workspace
              when one is ready.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
