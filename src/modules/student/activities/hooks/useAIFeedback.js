"use client";

import { useCallback, useRef, useState } from "react";

import { encourageStudent, explainIncorrectAnswer } from "../services/ai-assistance.js";

/**
 * Optional advisory AI feedback for the activity player.
 *
 * Everything here is best-effort: results are shown as advisory in the UI with
 * their provenance, failures resolve to `null`, and no deterministic score,
 * verdict or pass decision depends on anything this hook returns.
 */
export function useAIFeedback() {
  const [explanation, setExplanation] = useState(null);
  const [explanationLoading, setExplanationLoading] = useState(false);
  const [explanationAttempted, setExplanationAttempted] = useState(false);
  const [encouragement, setEncouragement] = useState(null);
  const [encouragementLoading, setEncouragementLoading] = useState(false);

  const analyzedKeyRef = useRef(null);

  /**
   * Ask for an advisory explanation of one incorrect answer. `questionId` and
   * the submitted answer identify a unique analysis so a revisit does not spam
   * the service or flicker the panel.
   */
  const analyze = useCallback(async ({ questionId, questionText, submittedAnswer, competencyId }) => {
    const key = `${questionId}::${submittedAnswer}`;
    if (analyzedKeyRef.current === key) return null;
    if (!questionId) return null;

    analyzedKeyRef.current = key;
    setExplanationAttempted(true);
    setExplanationLoading(true);
    try {
      const result = await explainIncorrectAnswer({
        questionText: questionText ?? "",
        submittedAnswer,
        competencyId,
      });
      setExplanation(result);
      return result;
    } finally {
      setExplanationLoading(false);
    }
  }, []);

  const clearAnalysis = useCallback(() => {
    analyzedKeyRef.current = null;
    setExplanation(null);
    setExplanationLoading(false);
    setExplanationAttempted(false);
  }, []);

  const encourage = useCallback(
    async ({ competencyId, score, masteryBand, displayContext }) => {
      setEncouragementLoading(true);
      try {
        const result = await encourageStudent({
          competencyId,
          score,
          masteryBand,
          displayContext,
        });
        setEncouragement(result);
        return result;
      } finally {
        setEncouragementLoading(false);
      }
    },
    [],
  );

  return {
    explanation,
    explanationLoading,
    explanationAttempted,
    encouragement,
    encouragementLoading,
    analyze,
    clearAnalysis,
    encourage,
  };
}