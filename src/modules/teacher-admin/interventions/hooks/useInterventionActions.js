"use client";

import { useCallback, useRef, useState } from "react";

import {
  readInterventionCase,
  updateIntervention,
} from "../services/interventions-api";

/**
 * Owns the deterministic case review flow: loading one case's evidence and
 * recording a teacher action on it. Every mutation goes through the API, which
 * enforces the lifecycle in the database and writes its own audit row.
 *
 * `initialDetail` is how the case page seeds this without a second request:
 * the server component already read the case, so re-reading it in the browser
 * would replace a rendered page with a pending one for nothing.
 *
 * @param {object|null} [initialDetail]
 * @returns {object}
 */
export function useInterventionActions(initialDetail = null) {
  const [caseDetail, setCaseDetail] = useState(initialDetail);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);
  // Rapid case navigation can leave two detail requests in flight. Only the
  // newest may commit, or the form would submit against the wrong case.
  const detailToken = useRef(0);

  const openCase = useCallback(async (interventionId) => {
    const token = (detailToken.current += 1);
    setLoadingDetail(true);
    setDetailError(null);
    setSaveError(null);
    setLastSaved(null);

    try {
      const result = await readInterventionCase(interventionId);
      if (token !== detailToken.current) return null;
      if (result.ok) {
        setCaseDetail(result.data);
        return result.data;
      }
      setDetailError(result.error ?? "Could not load this case.");
      return null;
    } catch (cause) {
      if (token !== detailToken.current) return null;
      console.warn("[MathSmart] Could not open intervention", interventionId, cause);
      setDetailError("Could not load this case.");
      return null;
    } finally {
      if (token === detailToken.current) setLoadingDetail(false);
    }
  }, []);

  const closeCase = useCallback(() => {
    // Invalidates any detail request still in flight for the closed case.
    detailToken.current += 1;
    setCaseDetail(null);
    setDetailError(null);
    setSaveError(null);
    setLastSaved(null);
    setLoadingDetail(false);
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

    try {
      const result = await updateIntervention(interventionId, {
        interventionType: payload.interventionType,
        educatorNotes: payload.educatorNotes,
        status: payload.status ?? null,
        reopenReason: payload.reopenReason ?? null,
      });

      if (result.ok) {
        setCaseDetail(result.data);
        setLastSaved(result.data);
        return result.data;
      }

      setSaveError(result.error ?? "Could not record this intervention.");
      return null;
    } catch (cause) {
      console.warn("[MathSmart] Could not record intervention", interventionId, cause);
      setSaveError("Could not record this intervention.");
      return null;
    } finally {
      setSaving(false);
    }
  }, []);

  /**
   * Replaces the open case with a version the server has just returned.
   *
   * Used by the advisory panel, which changes only the case's `ai_*` fields
   * and gets the whole record back. Guarded on the identifier so a reply that
   * arrives after the teacher has moved on cannot redraw somebody else's case.
   *
   * @param {object} detail - The refreshed case detail
   */
  const applyDetail = useCallback((detail) => {
    if (!detail?.id) return;
    setCaseDetail((current) => (current?.id === detail.id ? detail : current));
  }, []);

  /**
   * A quick lifecycle move from a row: mark the case In Progress or Resolved
   * without opening the record form. Reopens are never done here, because they
   * need an educator-written reason. The queue applies the returned data.
   *
   * @param {string} interventionId
   * @param {"In Progress"|"Resolved"} status
   * @returns {Promise<object|null>}
   */
  const setCaseStatus = useCallback(async (interventionId, status) => {
    setSaving(true);
    setSaveError(null);
    setLastSaved(null);

    try {
      const result = await updateIntervention(interventionId, {
        interventionType: null,
        educatorNotes: null,
        status,
        reopenReason: null,
      });

      if (!result.ok) {
        setSaveError(result.error ?? "Could not update this case.");
        return null;
      }

      setCaseDetail((current) => (current?.id === result.data.id ? result.data : current));
      setLastSaved(result.data);
      return result.data;
    } catch (cause) {
      console.warn("[MathSmart] Could not update intervention", interventionId, cause);
      setSaveError("Could not update this case.");
      return null;
    } finally {
      setSaving(false);
    }
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
    setCaseStatus,
    applyDetail,
  };
}