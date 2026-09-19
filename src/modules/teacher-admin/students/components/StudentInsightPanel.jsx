"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { fetchTeacherInsight } from "../services/students-ai";
import { insightUnavailableReason, readInsight } from "../utils/insight-evidence";

/** Formats provenance for display, or an em dash when the contract gave none. */
function provenanceLine(insight) {
  const parts = [];
  if (insight.provider) parts.push(insight.provider);
  if (insight.model) parts.push(insight.model);
  if (insight.generatedAt) {
    const when = new Date(insight.generatedAt);
    if (!Number.isNaN(when.getTime())) parts.push(when.toLocaleString());
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Optional advisory prose about one competency.
 *
 * Everything above this panel is deterministic and already on screen before
 * this asks for anything. Nothing here decides a score, a mastery band, a
 * monitoring status or an intervention — it is a teacher's reading aid, and it
 * says so.
 *
 * The request runs after paint and never blocks. Every failure ends the same
 * way: a short sentence, a retry button, and the learner's record untouched.
 *
 * @param {{evidence: object|null, competencyName: string|null}} props
 */
export function StudentInsightPanel({ evidence, competencyName }) {
  const [state, setState] = useState({ loading: false, insight: null, reason: null });
  const [nonce, setNonce] = useState(0);

  const retry = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    // Nothing to ask about: the panel renders nothing, so there is no state to
    // move and nothing to tidy up.
    if (!evidence) return undefined;

    let active = true;

    // Deferred by a microtask rather than set in the effect body, because a
    // synchronous setState here cascades an extra render for no gain — the
    // request it announces is asynchronous anyway.
    Promise.resolve()
      .then(() => {
        if (active) setState({ loading: true, insight: null, reason: null });
      })
      .then(() => fetchTeacherInsight(evidence))
      .then((result) => {
        if (!active) return;
        setState({
          loading: false,
          insight: readInsight(result),
          reason: insightUnavailableReason(result),
        });
      })
      .catch(() => {
        if (!active) return;
        setState({
          loading: false,
          insight: null,
          reason: insightUnavailableReason({ ok: false, code: "unreachable" }),
        });
      });

    return () => {
      active = false;
    };
  }, [evidence, nonce]);

  // Nothing to ask about is not a failure, and says nothing.
  if (!evidence) return null;

  const provenance = state.insight ? provenanceLine(state.insight) : null;

  return (
    <section
      aria-labelledby="advisory-heading"
      className="rounded-xl border border-border bg-secondary/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2
          id="advisory-heading"
          className="flex items-center gap-2 font-display text-base font-semibold text-foreground"
        >
          <Sparkles aria-hidden="true" className="size-4 text-muted-foreground" />
          Teaching note (advisory)
        </h2>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={retry}
          disabled={state.loading}
          aria-label="Ask for a new teaching note"
        >
          <RefreshCw aria-hidden="true" className="size-3.5" />
          {state.loading ? "Asking…" : "Ask again"}
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Generated text about {competencyName ?? "this competency"}. It is a suggestion to read,
        not a measurement — every number on this page comes from the learner&apos;s own recorded
        work.
      </p>

      <div aria-live="polite" className="mt-3">
        {state.loading ? (
          <p className="text-sm text-muted-foreground">Preparing a teaching note…</p>
        ) : state.insight ? (
          <>
            <p className="text-sm leading-relaxed whitespace-pre-line text-foreground">
              {state.insight.text}
            </p>
            {provenance ? (
              <p className="mt-2 text-xs text-muted-foreground">Written by {provenance}</p>
            ) : null}
          </>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">{state.reason}</p>
        )}
      </div>
    </section>
  );
}
