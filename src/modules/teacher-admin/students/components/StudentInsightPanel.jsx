"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Toast } from "@/modules/shared";

import { fetchTeacherInsight } from "../services/students-ai";
import { settleInsight } from "../utils/insight-evidence";

const IDLE = { loading: false, insight: null, reason: null, failure: null, forEvidence: null };

function NotePart({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-semibold text-muted-foreground">{label}</h3>
      {children}
    </div>
  );
}

/** The note as four short parts, each only when the server sent it. */
function TeachingNote({ note }) {
  return (
    <div className="flex flex-col gap-3 text-sm leading-relaxed text-foreground">
      <NotePart label="Learning gap">
        <p>{note.gap}</p>
      </NotePart>
      {note.evidence.length > 0 ? (
        <NotePart label="Evidence">
          <ul className="list-disc space-y-0.5 pl-5 marker:text-muted-foreground">
            {note.evidence.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </NotePart>
      ) : null}
      {note.actions.length > 0 ? (
        <NotePart label="Suggested actions">
          <ol className="list-decimal space-y-0.5 pl-5 marker:text-muted-foreground">
            {note.actions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ol>
        </NotePart>
      ) : null}
      {note.nextCheck ? (
        <NotePart label="Next check">
          <p>{note.nextCheck}</p>
        </NotePart>
      ) : null}
    </div>
  );
}

/**
 * Optional advisory note about one competency.
 *
 * Everything above this panel is deterministic and already on screen before
 * this asks for anything. Nothing here decides a score, a mastery band, a
 * monitoring status or an intervention.
 *
 * The note arrives already shaped and bounded by the server — a learning gap,
 * up to two pieces of evidence, up to three actions, one next check — so this
 * renders the parts rather than a block of prose. "Ask again" keeps the note
 * on screen while it asks, replaces it only when a new one arrives, and says
 * in a toast when one did not.
 *
 * @param {{evidence: object|null, competencyName: string|null}} props
 */
export function StudentInsightPanel({ evidence, competencyName }) {
  const [state, setState] = useState(IDLE);
  const [nonce, setNonce] = useState(0);

  const askAgain = useCallback(() => setNonce((value) => value + 1), []);
  const dismissFailure = useCallback(
    () => setState((current) => ({ ...current, failure: null })),
    [],
  );

  useEffect(() => {
    if (!evidence) return undefined;

    let active = true;

    // Deferred by a microtask rather than set in the effect body, because a
    // synchronous setState here cascades an extra render for no gain.
    Promise.resolve()
      .then(() => {
        if (!active) return;
        setState((current) =>
          // A different learner starts clean; the same one keeps its note.
          current.forEvidence === evidence
            ? { ...current, loading: true, failure: null }
            : { ...IDLE, loading: true, forEvidence: evidence },
        );
      })
      .then(() => fetchTeacherInsight(evidence))
      .catch(() => ({ ok: false, status: null, code: "unreachable" }))
      .then((result) => {
        if (!active) return;
        setState((current) => ({ ...settleInsight(current, result), forEvidence: evidence }));
      });

    return () => {
      active = false;
    };
  }, [evidence, nonce]);

  if (!evidence) return null;

  const note = state.forEvidence === evidence ? state.insight : null;
  const firstLoad = state.loading && !note;

  return (
    <section
      aria-labelledby="advisory-heading"
      className="rounded-xl border border-border bg-secondary/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="advisory-heading"
            className="flex items-center gap-2 font-display text-base font-semibold text-foreground"
          >
            <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
            Teaching note
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            AI suggestion (advisory)
            {competencyName ? ` · ${competencyName}` : ""}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={askAgain}
          disabled={state.loading}
          aria-label="Ask for a new teaching note"
        >
          <RefreshCw
            aria-hidden="true"
            className={`size-3.5 ${state.loading ? "animate-spin motion-reduce:animate-none" : ""}`}
          />
          {state.loading ? "Asking…" : "Ask again"}
        </Button>
      </div>

      <div
        aria-live="polite"
        aria-busy={state.loading}
        className={`mt-3 transition-opacity motion-reduce:transition-none ${
          state.loading && note ? "opacity-60" : ""
        }`}
      >
        {firstLoad ? (
          <p className="text-sm text-muted-foreground">Preparing a teaching note…</p>
        ) : note ? (
          <TeachingNote note={note} />
        ) : state.reason ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{state.reason}</p>
        ) : null}
      </div>

      <Toast
        toast={state.failure ? { tone: "error", message: state.failure } : null}
        onDismiss={dismissFailure}
      />
    </section>
  );
}
