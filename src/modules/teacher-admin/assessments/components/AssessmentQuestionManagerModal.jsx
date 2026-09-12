"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, Loader2, Plus, Trash2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  getAssessment,
  listQuestions,
  replaceAssessmentQuestions,
} from "../services/assessment-admin-service.js";
import {
  MAX_QUESTIONS_PER_ASSESSMENT,
  validateQuestionMembership,
} from "../utils/validation.js";

const SEARCH_DEBOUNCE_MS = 300;

function Notice({ tone = "problem", children }) {
  const border = tone === "problem" ? "border-destructive" : "border-primary";
  const tint = tone === "problem" ? "bg-destructive/5" : "bg-card";

  return (
    <p
      role={tone === "problem" ? "alert" : undefined}
      className={`flex gap-2 border-l-[3px] ${border} ${tint} px-4 py-3 text-sm leading-relaxed text-foreground`}
    >
      {tone === "problem" ? (
        <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
      ) : null}
      {children}
    </p>
  );
}

/** One question, wherever it is shown. Prompts can be long, so they wrap. */
function QuestionSummary({ question, questionId }) {
  if (!question) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        This question is not on the current page of the question bank. Its order is kept.
        <span className="sr-only"> Question identifier {questionId}.</span>
      </p>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-sm leading-relaxed text-foreground">{question.prompt}</p>
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
 * Choosing an assessment's questions, and the order they are delivered in.
 *
 * The membership is read from the API when this opens, because the save
 * replaces the whole list: saving without knowing the existing order would
 * erase it. Reordering is by button, not by dragging — a keyboard reaches a
 * button, and the previous copy promised a drag that was never implemented.
 */
function QuestionManager({ assessment, onClose, onSaved }) {
  const [questionIds, setQuestionIds] = useState([]);
  const [isLoadingMembership, setIsLoadingMembership] = useState(true);
  const [membershipError, setMembershipError] = useState(null);

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [bank, setBank] = useState([]);
  const [isLoadingBank, setIsLoadingBank] = useState(true);
  const [bankError, setBankError] = useState(null);

  const [saveError, setSaveError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  const assessmentId = assessment.assessment_id;

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoadingMembership(true);
      const result = await getAssessment(assessmentId);
      if (!active) {
        return;
      }
      if (result.ok) {
        setQuestionIds(result.data.question_ids ?? []);
        setMembershipError(null);
      } else {
        setMembershipError(result.error);
      }
      setIsLoadingMembership(false);
    }

    load();
    return () => {
      active = false;
    };
  }, [assessmentId]);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let active = true;

    async function load() {
      setIsLoadingBank(true);
      const result = await listQuestions({ search: appliedSearch });
      if (!active) {
        return;
      }
      if (result.ok) {
        setBank(result.data);
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
  }, [appliedSearch]);

  const byId = new Map(bank.map((question) => [question.question_id, question]));

  const move = useCallback((index, direction) => {
    setQuestionIds((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  function add(questionId) {
    setSaveError(null);
    setQuestionIds((previous) =>
      previous.includes(questionId) ? previous : [...previous, questionId]
    );
  }

  function remove(questionId) {
    setSaveError(null);
    setQuestionIds((previous) => previous.filter((id) => id !== questionId));
  }

  async function handleSave() {
    const check = validateQuestionMembership(questionIds);
    if (!check.isValid) {
      setSaveError(check.reason);
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    const result = await replaceAssessmentQuestions(assessmentId, questionIds);
    setIsSaving(false);

    if (result.ok) {
      onSaved(result.data);
      return;
    }
    setSaveError(result.error);
  }

  return (
    <>
      <DialogBody className="flex flex-col gap-6">
        {membershipError ? (
          <Notice>
            {membershipError} The current question list could not be read, so saving now
            would replace it with whatever is shown here. Close this and try again.
          </Notice>
        ) : null}
        {saveError ? <Notice>{saveError}</Notice> : null}

        <section aria-labelledby="assessment-membership-heading" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              id="assessment-membership-heading"
              className="font-display text-base font-semibold tracking-tight text-foreground"
            >
              In this assessment
            </h3>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {questionIds.length} of {MAX_QUESTIONS_PER_ASSESSMENT} chosen
            </p>
          </div>

          {isLoadingMembership ? (
            <p className="text-sm text-muted-foreground">Reading the current question list…</p>
          ) : questionIds.length === 0 ? (
            <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              No questions yet. Add them from the question bank below. Learners answer them
              in the order shown here.
            </p>
          ) : (
            <ol className="divide-y divide-border border border-border bg-card">
              {questionIds.map((questionId, index) => (
                <li key={questionId} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 w-6 shrink-0 text-sm font-semibold text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <QuestionSummary question={byId.get(questionId)} questionId={questionId} />
                  </div>

                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      aria-label={`Move question ${index + 1} earlier`}
                    >
                      <ArrowUp aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={index === questionIds.length - 1}
                      onClick={() => move(index, 1)}
                      aria-label={`Move question ${index + 1} later`}
                    >
                      <ArrowDown aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => remove(questionId)}
                      aria-label={`Remove question ${index + 1} from this assessment`}
                    >
                      <Trash2 aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby="question-bank-heading" className="flex flex-col gap-3">
          <h3
            id="question-bank-heading"
            className="font-display text-base font-semibold tracking-tight text-foreground"
          >
            Question bank
          </h3>

          <div className="flex flex-col gap-2">
            <Label htmlFor="question-bank-search">Search questions</Label>
            <Input
              id="question-bank-search"
              type="search"
              value={search}
              placeholder="Search by prompt"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {bankError ? (
            <Notice>{bankError}</Notice>
          ) : isLoadingBank ? (
            <p className="text-sm text-muted-foreground">Loading questions…</p>
          ) : bank.length === 0 ? (
            <p className="border-l-[3px] border-border bg-card px-4 py-3 text-sm leading-relaxed text-muted-foreground">
              No question in the bank matches this search.
            </p>
          ) : (
            <ul className="divide-y divide-border border border-border bg-card">
              {bank.map((question) => {
                const chosen = questionIds.includes(question.question_id);
                return (
                  <li
                    key={question.question_id}
                    className="flex items-start justify-between gap-3 px-4 py-3"
                  >
                    <QuestionSummary question={question} questionId={question.question_id} />
                    <Button
                      type="button"
                      variant={chosen ? "ghost" : "outline"}
                      size="sm"
                      className="shrink-0"
                      disabled={chosen}
                      onClick={() => add(question.question_id)}
                    >
                      {chosen ? <Check aria-hidden="true" /> : <Plus aria-hidden="true" />}
                      {chosen ? "Added" : "Add"}
                      <span className="sr-only"> {question.prompt}</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
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
          {isSaving ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
          Save question list
        </Button>
      </DialogFooter>
    </>
  );
}

export function AssessmentQuestionManagerModal({ open, onOpenChange, onSaved, assessment }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Questions</DialogTitle>
          <DialogDescription>
            {assessment?.title
              ? `Choose the questions in ${assessment.title}, and the order learners answer them in.`
              : "Choose the questions in this assessment, and the order learners answer them in."}
          </DialogDescription>
        </DialogHeader>

        {assessment ? (
          <QuestionManager
            key={assessment.assessment_id}
            assessment={assessment}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
