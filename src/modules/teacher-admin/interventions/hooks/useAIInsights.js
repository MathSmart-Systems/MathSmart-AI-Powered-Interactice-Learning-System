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
  const [visible, setVisible] = useState({
    insight: null,
    remediation: null,
    loading: false,
    key: null,
  });

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  // Identifies one advisory request, so a reply is only ever rendered for the
  // case and regeneration it was asked for.
  const requestKey = `${detail?.id ?? ""}|${nonce}`;

  useEffect(() => {
    if (!evidence.competencyId) return undefined;

    let active = true;
    Promise.resolve()
      .then(() =>
        setVisible({ insight: null, remediation: null, loading: true, key: requestKey })
      )
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
        setVisible({ insight, remediation, loading: false, key: requestKey });
      })
      .catch(() => {
        if (active) {
          setVisible({ insight: null, remediation: null, loading: false, key: requestKey });
        }
      });

    return () => {
      active = false;
    };
  }, [evidence, context, requestKey]);

  const idle = !evidence.competencyId;
  // A key mismatch means the effect for the current case has not committed
  // yet, which reads as loading rather than the previous case's advisory.
  const current =
    visible.key === requestKey
      ? visible
      : { insight: null, remediation: null, loading: true, key: requestKey };

  return {
    insight: idle ? null : current.insight,
    remediation: idle ? null : current.remediation,
    loading: idle ? false : current.loading,
    hasContent: !idle && Boolean(current.insight || current.remediation),
    refresh,
  };
}