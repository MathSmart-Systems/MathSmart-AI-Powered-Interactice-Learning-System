"use client";

import { useMemo } from "react";
import { BookOpen, Loader2, RefreshCw, Sparkles, Zap } from "lucide-react";

import { useAIInsights } from "../hooks/useAIInsights";
import { provenanceLabel } from "../utils/intervention-helpers";

function AdvisoryBody({ title, icon: Icon, text, provenance }) {
  return (
    <section aria-label={title} className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0">
          <Icon aria-hidden="true" className="size-4 text-indigo-500" />
        </span>
        <div className="min-w-0">
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            {title}
          </h4>
          {text ? <p className="mt-1.5 text-sm leading-relaxed text-foreground">{text}</p> : null}
          {provenance ? (
            <p className="mt-1.5 text-[11px] text-muted-foreground">{provenance}</p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * The advisory AI surface for one intervention case.
 *
 * Renders persisted advisory text when the record already has it; otherwise it
 * live-fetches teacher insight and remediation support in the background. Every
 * failure mode (Groq disabled, timeout, malformed reply, refusal) collapses to
 * a quiet, non-blocking note, so the deterministic evidence above is never held
 * up or altered. Nothing here is persisted or decides case state.
 *
 * @param {object} props
 * @param {object|null} props.detail - The case detail object
 */
export function AIInsightPanel({ detail }) {
  const hasStored = useMemo(
    () => Boolean(detail?.ai_insight || detail?.ai_recommendation),
    [detail]
  );
  const live = useAIInsights(hasStored ? null : detail);

  const storedProvenance = detail?.ai_provider
    ? [detail.ai_provider, detail.ai_model].filter(Boolean).join(" · ")
    : null;

  if (hasStored) {
    return (
      <div className="space-y-2 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
        <div className="flex items-center gap-2">
          <Zap aria-hidden="true" className="size-4 text-indigo-500" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
            AI pedagogical insight (advisory)
          </h4>
        </div>
        {detail.ai_insight ? (
          <p className="text-sm leading-relaxed text-foreground">{detail.ai_insight}</p>
        ) : null}
        {detail.ai_recommendation ? (
          <p className="text-sm leading-relaxed text-foreground">{detail.ai_recommendation}</p>
        ) : null}
        {storedProvenance ? (
          <p className="text-[11px] text-muted-foreground">Provided by {storedProvenance}</p>
        ) : null}
      </div>
    );
  }

  if (live.loading) {
    return (
      <div role="status" aria-live="polite" className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
          Preparing advisory insight...
        </p>
        <div className="mt-3 space-y-2" aria-hidden="true">
          <div className="h-2.5 w-3/4 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-2.5 w-5/6 animate-pulse rounded bg-muted-foreground/20" />
          <div className="h-2.5 w-1/2 animate-pulse rounded bg-muted-foreground/20" />
        </div>
      </div>
    );
  }

  if (live.hasContent) {
    return (
      <div className="space-y-3 rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-indigo-500" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
              AI assistance (advisory)
            </h4>
          </div>
          <button
            type="button"
            onClick={live.refresh}
            className="inline-flex items-center gap-1.5 rounded-md border border-input bg-card px-2 py-1 text-[11px] font-semibold text-foreground shadow-xs transition-colors hover:bg-muted/40"
          >
            <RefreshCw aria-hidden="true" className="size-3" />
            Regenerate
          </button>
        </div>
        {live.insight ? (
          <AdvisoryBody
            title="Teacher insight (advisory)"
            icon={Zap}
            text={live.insight.text}
            provenance={provenanceLabel(live.insight)}
          />
        ) : null}
        {live.remediation ? (
          <AdvisoryBody
            title="Remediation suggestion (advisory)"
            icon={BookOpen}
            text={live.remediation.text}
            provenance={provenanceLabel(live.remediation)}
          />
        ) : null}
        <p className="text-[11px] text-muted-foreground">
          Advisory text is generated and should be reviewed by a teacher before acting on it.
        </p>
      </div>
    );
  }

  return (
    <p
      role="note"
      className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-xs text-muted-foreground"
    >
      <Sparkles aria-hidden="true" className="mr-1.5 inline size-3.5 align-[-2px]" />
      Advisory AI assistance is not available. Deterministic evidence above is unaffected.
    </p>
  );
}