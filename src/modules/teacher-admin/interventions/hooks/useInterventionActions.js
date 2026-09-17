"use client";

import { useCallback, useState } from "react";

import {
  readInterventionCase,
  updateIntervention,
} from "../services/interventions-api";

/**
 * Owns the deterministic case review flow: loading one case's evidence and
 * recording a teacher action on it. Every mutation goes through the API, which
 * enforces the lifecycle in the database and writes its own audit row.
 *
 * @returns {object}
 */
export function useInterventionActions() {
  const [caseDetail, setCaseDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  const openCase = useCallback(async (interventionId) => {
    setLoadingDetail(true);
    setDetailError(null);
    setSaveError(null);
    setLastSaved(null);

    const result = await readInterventionCase(interventionId);
    if (result.ok) {
      setCaseDetail(result.data);
      setLoadingDetail(false);
      return result.data;
    }

    setDetailError(result.error ?? "Could not load this case.");
    setLoadingDetail(false);
    return null;
  }, []);

  const closeCase = useCallback(() => {
    setCaseDetail(null);
    setDetailError(null);
    setSaveError(null);
    setLastSaved(null);
  }, []);

  /**
   * Records a teacher action on the open case (type, notes, status).
   *
   * @param {string} interventionId
   * @param {object} payload
   * @param {string} payload.interventionType
   * @param {string} payload.educatorNotes
   * @param {"In Progress"|"Resolved"} [payload.status]
   * @param {string} [payload.reopenReason]
   */
  const recordAction = useCallback(async (interventionId, payload) => {
    setSaving(true);
    setSaveError(null);
    setLastSaved(null);

    const result = await updateIntervention(interventionId, {
      interventionType: payload.interventionType,
      educatorNotes: payload.educatorNotes,
      status: payload.status ?? null,
      reopenReason: payload.reopenReason ?? null,
    });

    setSaving(false);

    if (result.ok) {
      setCaseDetail(result.data);
      setLastSaved(result.data);
      return result.data;
    }

    setSaveError(result.error ?? "Could not record this intervention.");
    return null;
  }, []);

  return {
    caseDetail,
    loadingDetail,
    detailError,
    saving,
    saveError,
    lastSaved,
    openCase,
    closeCase,
    recordAction,
  };
}