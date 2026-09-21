"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, CircleHelp, LoaderCircle, Sparkles, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getAnswerExplanation, loadAttemptReview } from "../services/diagnostic-service";
import { LETTERS } from "../utils/format";

import { FeedbackMarkdown } from "./FeedbackMarkdown";

/**
 * Which questions a learner got right, once the paper is closed.
 *
 * The report used to say only "Answer recorded" or "Unanswered" beside each
 * question, which tells a child nothing they did not already know. It also
 * rebuilt the list from whatever the player still held in memory, so opening a
 * report from the history list days later showed nothing at all. Both are
 * fixed by reading the server's own record of the attempt.
 *
 * What is deliberately missing is the correct answer. The column holding it is
 * not granted to the API connection, so this cannot show it even by accident —
 * and should not: seeing which question was wrong is reviewing a paper, and
 * being handed the answer before a retake is something else.
 */

/** How one answer reads, whichever shape the learner's response arrived in. */
function answerText(value) {
  if (value === null || value === undefined || value === "") return null;
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function VerdictBadge({ isCorrect, answered }) {
  if (!answered) {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-border text-xs font-normal">
        <CircleHelp aria-hidden="true" className="size-3" />
        Left blank
      </Badge>
    );
  }

  // Icon and word together. Correctness is the one thing on this screen a
  // learner must not have to perceive colour to read.
  return isCorrect ? (
    <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-xs font-normal">
      <CheckCircle2 aria-hidden="true" className="size-3 text-primary" />
      Correct
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="shrink-0 gap-1 border-destructive/40 text-xs font-normal"
    >
      <XCircle aria-hidden="true" className="size-3 text-destructive" />
      Not correct
    </Badge>
  );
}

/**
 * One reviewed question, with an optional explanation the learner asks for.
 *
 * The explanation is requested per question rather than for the whole paper:
 * asking for every wrong answer at once would send more evidence than the
 * learner wanted help with, and most of it would go unread.
 */
function ReviewedQuestion({ item }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [asked, setAsked] = useState(false);
  const explanationId = useId();

  const submitted = answerText(item.submitted_answer);
  const answered = submitted !== null;
  const choices = Array.isArray(item.choices) ? item.choices : [];

  async function explain() {
    setAsked(true);
    setLoading(true);
    const result = await getAnswerExplanation({
      questionText: item.text,
      submittedAnswer: item.submitted_answer,
      isCorrect: item.is_correct,
      competencyId: item.competency_id,
    });
    setLoading(false);
    setExplanation(result?.explanation ?? null);
  }

  return (
    <li className="border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Q{item.position}
            {item.competency_name ? ` · ${item.competency_name}` : ""}
          </p>
          <p className="max-w-prose text-base leading-snug text-foreground">{item.text}</p>
        </div>
        <VerdictBadge isCorrect={item.is_correct} answered={answered} />
      </div>

      {choices.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {choices.map((choice, choiceIndex) => {
            const key = choice?.key ?? choice?.id ?? String(choiceIndex);
            const label = choice?.label ?? choice?.text ?? String(choice ?? "");
            const picked = submitted !== null && String(submitted) === String(key);

            return (
              <li
                key={key}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm ${
                  picked
                    ? "border-primary/40 bg-primary/5 text-foreground"
                    : "border-border text-muted-foreground"
                }`}
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {LETTERS[choiceIndex] ?? choiceIndex + 1}
                </span>
                <span className="leading-relaxed">{label}</span>
                {picked ? (
                  <span className="ml-auto shrink-0 text-xs font-medium text-primary">
                    Your answer
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : answered ? (
        <p className="mt-4 rounded-md border border-primary/40 bg-primary/5 px-3 py-3 text-sm text-foreground">
          <span className="text-xs font-medium text-primary">Your answer</span>
          <span className="mt-1 block leading-relaxed">{submitted}</span>
        </p>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">
          You left this one blank during the assessment.
        </p>
      )}

      {/* Offered only where it can help. There is nothing to explain about a
          question the learner already answered correctly. */}
      {item.is_correct === false ? (
        <div className="mt-4 flex flex-col gap-2">
          {!asked ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="self-start gap-1.5"
              onClick={explain}
            >
              <Sparkles aria-hidden="true" className="size-4" />
              Explain this one
            </Button>
          ) : null}

          {loading ? (
            <p
              className="flex items-center gap-2 text-xs text-muted-foreground"
              role="status"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Writing an explanation…
            </p>
          ) : null}

          {asked && !loading && explanation ? (
            <div
              id={explanationId}
              className="rounded-md border border-border bg-secondary/40 px-4 py-3"
            >
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Sparkles aria-hidden="true" className="size-3.5" />
                AI help · advisory only, your score is unchanged
              </p>
              <FeedbackMarkdown content={explanation} />
            </div>
          ) : null}

          {asked && !loading && !explanation ? (
            <p className="text-xs text-muted-foreground">
              The optional AI explanation is not available right now. Your result and the
              verdict above are unaffected — ask your teacher about this question.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/** The list itself, which the dialog body scrolls. */
function ReviewList({ attemptId, open }) {
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const requested = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setItems(await loadAttemptReview(attemptId));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [attemptId]);

  // Fetched when the learner opens the section rather than with the report, so
  // a reader who never opens it never pays for it. `requested` keeps a second
  // open from refetching what is already on screen — and keeps the section's
  // height stable, which is what stops the page moving under the reader.
  useEffect(() => {
    if (!open || !attemptId || requested.current) return;
    requested.current = true;
    load();
  }, [attemptId, load, open]);

  return (
    <div className="flex flex-col gap-4">
      {/* A reserved line rather than a growing one: the list below keeps its
          place while this fills and empties. */}
      <div className="flex min-h-5 items-center">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Loading your answers…
          </p>
        ) : null}
      </div>

      {failed ? (
        <div role="alert" className="border border-border bg-card p-5">
          <p className="font-medium text-foreground">Your answers could not be loaded</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your score and competency results above are complete and unaffected.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={load}>
            Try again
          </Button>
        </div>
      ) : null}

      {!failed && items !== null && items.length === 0 && !loading ? (
        <p className="border border-border bg-card p-5 text-sm text-muted-foreground">
          There is nothing to review for this attempt yet.
        </p>
      ) : null}

      {items !== null && items.length > 0 ? (
        <ol className="flex flex-col gap-4">
          {items.map((item) => (
            <ReviewedQuestion key={item.question_id} item={item} />
          ))}
        </ol>
      ) : null}
    </div>
  );
}

/**
 * The review, as a dialog rather than a panel further down the report.
 *
 * It began as a section appended below the competency table, where it was
 * easy to press the button and not notice anything had happened — the new
 * content opened off-screen, beneath everything already being read. A dialog
 * puts it where the learner is looking and gives them one obvious way back.
 *
 * The scroll owner is `DialogBody` alone, which is the contract the rest of
 * the workspace keeps: the surface itself stays `overflow-hidden` so the
 * header and the close control never scroll away from a long paper.
 */
export function AnswerReview({ attemptId, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Answer review</DialogTitle>
          <DialogDescription>
            Every question, what you answered, and whether it was right. The correct
            answers are not shown here.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {open ? <ReviewList attemptId={attemptId} open={open} /> : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
