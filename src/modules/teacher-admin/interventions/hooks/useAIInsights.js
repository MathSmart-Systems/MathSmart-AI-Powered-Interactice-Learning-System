"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  fetchRemediationSupport,
  fetchTeacherInsight,
} from "../services/interventions-api";
import {
  buildCaseAIEvidence,
  buildRemediationContext,
  readAdvisory,
} from "../utils/intervention-helpers";

/**
 * Non-blocking advisory AI for one open intervention case.
 *
 * Deterministic evidence never waits on this hook. Both advisory calls run in
 * the background and are stale-guarded against case changes and unmount; each
 * collapses to `null` on any failure (disabled, timeout, malformed reply,
 * refusal envelope), so the review modal always keeps its deterministic content
 * and only adds advisory text when Groq answered. Nothing here persists,
 * records, or decides severity, status, or scores.
 *
 * @param {object|null} detail - The case detail, or null to stay idle
 * @returns {object}
 */
export function useAIInsights(detail) {
  const evidence = useMemo(() => buildCaseAIEvidence(detail), [detail]);
  const context = useMemo(() => buildRemediationContext(detail), [detail]);
  const [nonce, setNonce] = useState(0);
  const [visible, setVisible] = useState({ insight: null, remediation: null, loading: false });

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!evidence.competencyId) return undefined;

    let active = true;
    Promise.resolve()
      .then(() => setVisible((current) => ({ ...current, loading: true })))
      .then(() =>
        Promise.allSettled([
          fetchTeacherInsight(evidence),
          fetchRemediationSupport(context),
        ])
      )
      .then(([insightResult, remediationResult]) => {
        if (!active) return;
        const insight =
          insightResult.status === "fulfilled"
            ? readAdvisory(insightResult.value, "insight_summary")
            : null;
        const remediation =
          remediationResult.status === "fulfilled"
            ? readAdvisory(remediationResult.value, "recommended_module_title")
            : null;
        setVisible({ insight, remediation, loading: false });
      })
      .catch(() => {
        if (active) setVisible({ insight: null, remediation: null, loading: false });
      });

    return () => {
      active = false;
    };
  }, [evidence, context, nonce]);

  const idle = !evidence.competencyId;

  return {
    insight: idle ? null : visible.insight,
    remediation: idle ? null : visible.remediation,
    loading: idle ? false : visible.loading,
    hasContent: !idle && Boolean(visible.insight || visible.remediation),
    refresh,
  };
}