"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { generateInterventionSuggestion } from "../services/interventions-api";
import { suggestionFailure } from "../utils/intervention-helpers";

/**
 * Asking for a support plan on one case, and asking again.
 *
 * Nothing here fires on its own. A suggestion exists only because a teacher
 * pressed a button, and it is produced entirely server-side — the browser
 * sends no evidence and receives no obligation to act on what comes back. The
 * reply is the whole case detail as it now stands, which the caller hands back
 * to the rest of the review so the deterministic fields and the advisory ones
 * stay one record rather than two.
 *
 * A failure never takes the stored plan away. The case is replaced only when
 * the server answers with a new one, so asking again and being refused leaves
 * the teacher reading the suggestion they already had — which is the whole
 * reason the failure is reported upward as a message rather than rendered in
 * the place the plan occupies.
 *
 * @param {string|null|undefined} interventionId - The open case
 * @param {(detail: object) => void} [onUpdated] - Receives the refreshed case
 * @param {{caseClosed?: boolean, onFailure?: (message: string) => void}} [context]
 * @returns {{generate: () => Promise<void>, generating: boolean, busy: boolean}}
 */
export function useCaseSuggestion(
  interventionId,
  onUpdated,
  { caseClosed = false, onFailure } = {},
) {
  const [generating, setGenerating] = useState(false);
  const report = useRef(onFailure);

  useEffect(() => {
    report.current = onFailure;
  });

  const generate = useCallback(async () => {
    if (!interventionId) return;

    setGenerating(true);
    try {
      const result = await generateInterventionSuggestion(interventionId);
      if (result?.ok && result.data) {
        onUpdated?.(result.data);
        return;
      }
      // Only a success replaces the case, so whatever plan was on screen stays
      // on screen and the teacher is told separately.
      report.current?.(suggestionFailure(result, { caseClosed }));
    } catch {
      // A thrown request is indistinguishable from an unreachable one, and the
      // teacher needs the same sentence either way.
      report.current?.(suggestionFailure({ code: "unreachable" }, { caseClosed }));
    } finally {
      setGenerating(false);
    }
  }, [caseClosed, interventionId, onUpdated]);

  return { generate, generating, busy: generating };
}
