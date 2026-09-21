"use client";

import { LoaderCircle, RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCaseSuggestion } from "../hooks/useCaseSuggestion";
import { provenanceLabel, storedPlan, strategyNote } from "../utils/intervention-helpers";

/**
 * One line of the plan, with the control that takes it into the notes.
 *
 * The button is what makes the plan a set of choices rather than a paragraph:
 * a teacher reads three strategies, wants the second, and takes that one.
 */
function PlanLine({ label, text, onTake }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 py-2">
      <div className="min-w-0 flex-1 basis-64">
        {label ? (
          <span className="block text-[11px] font-semibold text-muted-foreground">{label}</span>
        ) : null}
        <p className="text-sm leading-relaxed text-foreground">{text}</p>
      </div>
      {onTake ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onTake}
          aria-label={`Use this in my notes: ${text}`}
        >
          Use this
        </Button>
      ) : null}
    </li>
  );
}

/**
 * The advisory surface for one intervention case.
 *
 * Four rules shape this panel.
 *
 * Nothing is generated until a teacher asks: opening a case makes no advisory
 * request, so no learner's evidence goes anywhere because somebody read their
 * file.
 *
 * Nothing is applied: a stored plan changes no score, no severity, no status
 * and no note. The only routes from advice into the record run through "Use
 * this" and "Use in notes", which put editable text in the teacher's own notes
 * field for them to change and sign.
 *
 * Nothing is a wall of text. The plan arrives as structure — a gap, at most
 * three strategies, a scaffold, a next check — and each line is rendered as a
 * line with its own control.
 *
 * And nothing here reports its own failures. Asking again and being refused
 * must leave the previous suggestion exactly where it was, so a failure is
 * handed to `onFailure` for the page to show somewhere else. The plan the
 * teacher was reading stays on screen, and Regenerate stays where they last
 * saw it rather than being replaced by an error and a second button that does
 * the same thing.
 *
 * A closed case takes no new suggestions, so it is offered none.
 *
 * @param {object} props
 * @param {object|null} props.detail - The case detail object
 * @param {(detail: object) => void} [props.onDetailChange] - Receives the refreshed case
 * @param {(text: string) => void} [props.onUseAsNote] - Copies the whole plan into the notes
 * @param {(text: string) => void} [props.onTakeLine] - Copies one line into the notes
 * @param {(message: string) => void} [props.onFailure] - Reports a failure to the page
 */
export function AIInsightPanel({ detail, onDetailChange, onUseAsNote, onTakeLine, onFailure }) {
  const plan = storedPlan(detail);
  const closed = detail?.status === "Resolved";
  const suggestion = useCaseSuggestion(detail?.id, onDetailChange, {
    caseClosed: closed,
    onFailure,
  });

  const provenance = provenanceLabel(plan);
  const take = (line) => (onTakeLine ? () => onTakeLine(strategyNote(line)) : undefined);

  return (
    <section
      aria-labelledby="case-advisory-heading"
      className="space-y-3 rounded-xl border border-border bg-secondary/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
          <h4 id="case-advisory-heading" className="text-sm font-semibold text-foreground">
            Suggested support plan
            <span className="ml-2 text-xs font-normal text-muted-foreground">advisory</span>
          </h4>
        </div>

        {!closed ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={suggestion.generate}
            disabled={suggestion.busy}
            aria-label={
              plan ? "Ask for a new suggestion" : "Suggest support strategies for this case"
            }
          >
            {suggestion.generating ? (
              <LoaderCircle
                aria-hidden="true"
                className="size-3.5 animate-spin motion-reduce:animate-none"
              />
            ) : (
              <RefreshCw aria-hidden="true" className="size-3.5" />
            )}
            {plan ? "Regenerate" : "Suggest support strategies"}
          </Button>
        ) : null}
      </div>

      <p className="max-w-prose text-xs leading-relaxed text-muted-foreground">
        Written by a language model from the evidence above. It decides nothing — not the score,
        not the severity, not the status — and it reaches the record only if you write it into
        your own notes.
      </p>

      {/* One live region, so a teacher waiting on an answer hears the answer
          rather than several fragments. Failures are deliberately not in here:
          they belong somewhere that does not take the plan's place. */}
      <div aria-live="polite" className="space-y-3">
        {suggestion.generating ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle
              aria-hidden="true"
              className="size-4 animate-spin motion-reduce:animate-none"
            />
            Asking for a suggestion…
          </p>
        ) : null}

        {plan ? (
          <>
            <p className="max-w-prose text-sm leading-relaxed text-foreground">{plan.gap}</p>

            <ul className="divide-y divide-border border-y border-border">
              {plan.strategies.map((line) => (
                <PlanLine key={line} text={line} onTake={take(line)} />
              ))}
              {plan.scaffold ? (
                <PlanLine
                  label="Make it visible"
                  text={plan.scaffold}
                  onTake={take(plan.scaffold)}
                />
              ) : null}
              {plan.nextCheck ? <PlanLine label="Check it worked" text={plan.nextCheck} /> : null}
            </ul>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {onUseAsNote ? (
                <Button type="button" size="sm" variant="outline" onClick={onUseAsNote}>
                  Use in notes
                </Button>
              ) : null}
              {provenance ? (
                <span className="text-[11px] text-muted-foreground">{provenance}</span>
              ) : null}
            </div>
          </>
        ) : null}

        {!plan && !suggestion.generating ? (
          <p className="text-xs text-muted-foreground">
            {closed
              ? "This case was closed without a suggestion."
              : "No suggestion has been asked for on this case."}
          </p>
        ) : null}
      </div>
    </section>
  );
}
