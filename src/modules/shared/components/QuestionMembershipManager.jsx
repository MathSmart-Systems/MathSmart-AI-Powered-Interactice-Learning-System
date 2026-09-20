"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Plus, RotateCcw, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ReorderControls } from "./ReorderControls";
import { ResultAnnouncer } from "./ResultAnnouncer";
import { moveItem, movedMessage } from "../utils/reorder.js";

const SEARCH_DEBOUNCE_MS = 300;

/** The ceiling both membership contracts share. */
export const MAX_QUESTIONS_PER_SET = 200;

/** Accessible alert banner for reporting a problem. */
function Notice({ children, action = null }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-3 border-l-[3px] border-destructive bg-destructive/5 px-4 py-3 text-sm leading-relaxed text-foreground"
    >
      <p className="flex min-w-0 gap-2">
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <span className="min-w-0 break-words">{children}</span>
      </p>
      {action}
    </div>
  );
}

/** One question, wherever it is shown. Prompts can be long, so they wrap. */
function QuestionSummary({ question, questionId }) {
  if (!question) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        This question could not be read. Its place in the order is kept.
        <span className="sr-only"> Question identifier {questionId}.</span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm leading-relaxed break-words text-foreground">{question.prompt}</p>
      <p className="text-sm text-muted-foreground">
        {question.question_type}
        {question.difficulty ? ` · ${question.difficulty}` : ""}
        {question.status && question.status !== "published" ? (
          <span className="text-destructive"> · {question.status}</span>
        ) : null}
      </p>
    </div>
  );
}

/**
 * Choosing a set of questions, and the order they are delivered in.
 *
 * Shared because the assessment and the activity membership are the same
 * contract: a whole-list replace where the position of each question is its
 * place in the array. The activity side had no editor at all, and building a
 * second one would have meant two places to fix the things this one had wrong.
 *
 * Three of those are worth naming.
 *
 * The chosen list is read with its questions, not only their identifiers. The
 * assessment editor built its lookup from the current page of the bank alone,
 * so a set longer than one page rendered mostly as "this question is not on the
 * current page" — while still asking the teacher to reorder it. Searching the
 * bank made almost all of it disappear.
 *
 * A membership read that fails, or comes back without a list, disables saving.
 * Treating a missing list as an empty one meant a save could replace a real
 * set with whatever happened to be on screen.
 *
 * Reordering announces itself, and the buttons are `aria-disabled` at the ends
 * rather than `disabled`, so moving an item to the top does not throw keyboard
 * focus back to the document body.
 *
 * @param {object} props
 * @param {string} props.subject - What is being filled, e.g. "activity".
 * @param {string} props.headingId
 * @param {() => Promise<object>} props.loadMembership - Resolves {ok, data:{question_ids, questions}}.
 * @param {(ids: string[]) => Promise<object>} props.saveMembership
 * @param {(params: object) => Promise<object>} props.loadQuestions - One page of the bank.
 * @param {() => void} props.onClose
 * @param {(saved: object) => void} props.onSaved
 */
export function QuestionMembershipManager({
  subject,
  headingId,
  loadMembership,
  saveMembership,
  loadQuestions,
  onClose,
  onSaved,
}) {
  const [questionIds, setQuestionIds] = useState([]);
  const [byId, setById] = useState(() => new Map());
  const [isLoadingMembership, setIsLoadingMembership] = useState(true);
  const [membershipError, setMembershipError] = useState(null);
  const [membershipReload, setMembershipReload] = useState(0);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [bank, setBank] = useState([]);
  const [bankPage, setBankPage] = useState(1);
  const [bankMeta, setBankMeta] = useState(null);
  const [isLoadingBank, setIsLoadingBank] = useState(true);
  const [bankError, setBankError] = useState(null);

  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  /** Remembers every question this dialog has seen, whichever list it came from. */
  const remember = useCallback((questions) => {
    if (!Array.isArray(questions) || questions.length === 0) {
      return;
    }
    setById((previous) => {
      const next = new Map(previous);
      for (const question of questions) {
        if (question?.question_id) {
          next.set(question.question_id, question);
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoadingMembership(true);
      const result = await loadMembership();
      if (!active) {
        return;
      }

      if (!result.ok) {
        setMembershipError(result.error);
      } else if (!Array.isArray(result.data?.question_ids)) {
        // A reply the client cannot read is not an empty list. Defaulting to
        // one here is how a save could quietly replace a real set.
        setMembershipError(
          `The current question list could not be read from this ${subject}.`,
        );
      } else {
        setQuestionIds(result.data.question_ids);
        remember(result.data.questions);
        setMembershipError(null);
      }
      setIsLoadingMembership(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [loadMembership, remember, subject, membershipReload]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppliedSearch(search);
      setBankPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoadingBank(true);
      const result = await loadQuestions({ search: appliedSearch, page: bankPage });
      if (!active) {
        return;
      }
      if (result.ok) {
        const questions = Array.isArray(result.data) ? result.data : [];
        setBank(questions);
        remember(questions);
        setBankMeta(result.meta);
        setBankError(null);
      } else {
        setBankError(result.error);
      }
      setIsLoadingBank(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, bankPage, loadQuestions, remember]);

  function move(index, offset) {
    const next = moveItem(questionIds, index, offset);
    if (next === questionIds) {
      return;
    }
    setQuestionIds(next);
    setSaveError(null);
    const question = byId.get(questionIds[index]);
    setAnnouncement(
      movedMessage(question?.prompt ?? `Question ${index + 1}`, index + offset + 1, next.length),
    );
  }

  function add(questionId) {
    setSaveError(null);
    setQuestionIds((previous) => {
      if (previous.length >= MAX_QUESTIONS_PER_SET || previous.includes(questionId)) {
        return previous;
      }
      return [...previous, questionId];
    });
  }

  function remove(questionId) {
    setSaveError(null);
    setQuestionIds((previous) => previous.filter((id) => id !== questionId));
  }

  async function handleSave() {
    if (questionIds.length === 0) {
      setSaveError(`Add at least one question before saving this ${subject}.`);
      return;
    }
    if (questionIds.length > MAX_QUESTIONS_PER_SET) {
      setSaveError(`A ${subject} can hold at most ${MAX_QUESTIONS_PER_SET} questions.`);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const result = await saveMembership(questionIds);
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }
    setSaveError(result.error);
  }

  const atCap = questionIds.length >= MAX_QUESTIONS_PER_SET;

  return (
    <>
      <DialogBody className="flex flex-col gap-6">
        {membershipError ? (
          <Notice
            action={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => setMembershipReload((index) => index + 1)}
              >
                <RotateCcw aria-hidden="true" className="size-4" />
                Try again
              </Button>
            }
          >
            {membershipError} Saving is turned off until it can be read, because a save
            replaces the whole list.
          </Notice>
        ) : null}
        {saveError ? <Notice>{saveError}</Notice> : null}

        <section aria-labelledby={headingId} className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              id={headingId}
              className="font-display text-base font-semibold tracking-tight text-foreground"
            >
              In this {subject}
            </h3>
            <p className="text-sm text-muted-foreground">
              {questionIds.length} of {MAX_QUESTIONS_PER_SET} chosen
            </p>
          </div>

          {isLoadingMembership ? (
            <p role="status" className="text-sm text-muted-foreground">
              Reading the current question list…
            </p>
          ) : questionIds.length === 0 ? (
            <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              No questions yet. Add them from the question bank below. Learners answer them in
              the order shown here.
            </p>
          ) : (
            <ol className="divide-y divide-border border border-border bg-card">
              {questionIds.map((questionId, index) => {
                const question = byId.get(questionId);
                const name = question?.prompt ?? `question ${index + 1}`;

                return (
                  <li
                    key={questionId}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:gap-3"
                  >
                    <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
                      {index + 1}
                    </span>

                    <div className="min-w-0 flex-1">
                      <QuestionSummary question={question} questionId={questionId} />
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      <ReorderControls
                        itemName={name}
                        index={index}
                        total={questionIds.length}
                        onMove={(offset) => move(index, offset)}
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => remove(questionId)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                        Remove
                        <span className="sr-only"> {name}</span>
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <section
          aria-labelledby={`${headingId}-bank`}
          className="flex min-w-0 flex-col gap-3"
        >
          <h3
            id={`${headingId}-bank`}
            className="font-display text-base font-semibold tracking-tight text-foreground"
          >
            Question bank
          </h3>

          <p className="text-sm leading-relaxed text-muted-foreground">
            Answer keys, explanations and hints are authored in the Question Bank and are never
            shown back, here or anywhere else.
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor={`${headingId}-search`}>Search questions</Label>
            <Input
              id={`${headingId}-search`}
              type="search"
              value={search}
              placeholder="Search by prompt"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {bankError ? (
            <Notice>{bankError}</Notice>
          ) : isLoadingBank ? (
            <p role="status" className="text-sm text-muted-foreground">
              Loading questions…
            </p>
          ) : bank.length === 0 ? (
            <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              {appliedSearch
                ? "No question in the bank matches this search."
                : "No questions are in the bank yet."}
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border bg-card">
              {bank.map((question) => {
                const chosen = questionIds.includes(question.question_id);
                return (
                  <li
                    key={question.question_id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                  >
                    <QuestionSummary question={question} questionId={question.question_id} />
                    <Button
                      type="button"
                      variant={chosen ? "ghost" : "outline"}
                      size="sm"
                      className="shrink-0 gap-1.5 self-start"
                      aria-disabled={chosen || atCap}
                      onClick={() => {
                        if (!chosen && !atCap) {
                          add(question.question_id);
                        }
                      }}
                    >
                      {chosen ? (
                        <Check aria-hidden="true" className="size-4" />
                      ) : (
                        <Plus aria-hidden="true" className="size-4" />
                      )}
                      {chosen ? "Added" : "Add"}
                      <span className="sr-only"> {question.prompt}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          {atCap ? (
            <p role="status" className="text-sm text-muted-foreground">
              This {subject} holds the maximum of {MAX_QUESTIONS_PER_SET} questions. Remove one
              before adding another.
            </p>
          ) : null}

          {bankMeta && bankMeta.totalPages > 1 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bankPage <= 1 || isLoadingBank}
                onClick={() => setBankPage((page) => Math.max(1, page - 1))}
              >
                Previous
                <span className="sr-only"> page of the question bank</span>
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {bankPage} of {bankMeta.totalPages}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={bankPage >= bankMeta.totalPages || isLoadingBank}
                onClick={() =>
                  setBankPage((page) => Math.min(bankMeta.totalPages, page + 1))
                }
              >
                Next
                <span className="sr-only"> page of the question bank</span>
              </Button>
            </div>
          ) : null}
        </section>

        <ResultAnnouncer message={announcement} />
      </DialogBody>

      <DialogFooter>
        <Button type="button" variant="outline" className="h-11 px-5" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          className="h-11 px-5"
          disabled={isSaving || isLoadingMembership || Boolean(membershipError)}
          onClick={handleSave}
        >
          {isSaving ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
          {isSaving ? "Saving…" : "Save question list"}
        </Button>
      </DialogFooter>
    </>
  );
}
