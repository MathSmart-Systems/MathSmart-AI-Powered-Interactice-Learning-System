"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { listInterventionCases } from "../services/interventions-api";
import { normalizeCase, sortCases } from "../utils/intervention-helpers";

/**
 * Manages the deterministic intervention queue.
 *
 * The initial cases come from the server component; this hook owns the live
 * state, applies the documented filters through the API, and keeps the queue
 * sorted by severity deterministically. AI is never consulted here.
 *
 * @param {Array<object>} initialCases
 */
export function useInterventionQueue(initialCases = []) {
  const [cases, setCases] = useState(() => sortCases(initialCases.map(normalizeCase)));
  const [filters, setFilters] = useState({
    gradeId: null,
    sectionId: null,
    competencyId: null,
    severity: null,
    status: null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (nextFilters, { silent = false } = {}) => {
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const result = await listInterventionCases({
      gradeId: nextFilters.gradeId,
      sectionId: nextFilters.sectionId,
      competencyId: nextFilters.competencyId,
      severity: nextFilters.severity,
      status: nextFilters.status,
      page: 1,
      pageSize: 100,
    });

    if (!mounted.current) return undefined;

    if (result.ok && Array.isArray(result.data)) {
      setCases(sortCases(result.data.map(normalizeCase)));
      if (silent) setRefreshing(false);
      else setLoading(false);
      return result.data;
    }

    setError(result.error ?? "Could not load the intervention queue.");
    if (silent) setRefreshing(false);
    else setLoading(false);
    return null;
  }, []);

  const setFilter = useCallback(
    (key, value) => {
      const next = { ...filters, [key]: value || null };
      setFilters(next);
      load(next);
    },
    [filters, load]
  );

  const clearFilters = useCallback(() => {
    const reset = { gradeId: null, sectionId: null, competencyId: null, severity: null, status: null };
    setFilters(reset);
    load(reset);
  }, [load]);

  /**
   * Replaces one case in place after a mutation, so the queue reflects the
   * change immediately. The next `refresh` reconciles with the server.
   *
   * @param {object} updated - The case returned by the mutation
   */
  const applyCase = useCallback((updated) => {
    if (!updated?.id) return;
    setCases((current) => {
      const next = current.map((item) =>
        item.id === updated.id ? normalizeCase({ ...item, ...updated }) : item
      );
      return sortCases(next);
    });
  }, []);

  const refresh = useCallback(() => {
    load(filters, { silent: true });
  }, [filters, load]);

  return {
    cases,
    filters,
    loading,
    refreshing,
    error,
    setFilter,
    clearFilters,
    applyCase,
    refresh,
  };
}