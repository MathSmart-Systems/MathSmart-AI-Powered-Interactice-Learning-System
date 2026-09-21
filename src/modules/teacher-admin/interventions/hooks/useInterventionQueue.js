"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { listInterventionCases } from "../services/interventions-api";
import {
  emptyFilters,
  filtersFromQuery,
  filtersToQuery,
  normalizeCase,
  sortCases,
} from "../utils/intervention-helpers";

/**
 * Manages the deterministic intervention queue.
 *
 * The filters live in the query string rather than in this hook's state. A
 * case is its own page now, so narrowing the queue and opening a case is a
 * real navigation, and the only place a filter set survives one of those —
 * along with a refresh, a bookmark, and the browser's own back button — is the
 * address bar. Everything else here is unchanged: the initial cases come from
 * the server component, the documented filters go to the API, and the queue
 * stays sorted by severity. AI is never consulted.
 *
 * @param {Array<object>} initialCases
 */
export function useInterventionQueue(initialCases = []) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [cases, setCases] = useState(() => sortCases(initialCases.map(normalizeCase)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  // True once any client request has loaded the queue, which retires the error
  // the server component reported for its own initial read.
  const [loaded, setLoaded] = useState(false);
  const mounted = useRef(true);
  // Filter changes and silent refreshes can overlap. Only the newest request
  // may commit, or an older reply replaces the queue the controls describe.
  const requestToken = useRef(0);

  const query = searchParams.toString();
  const filters = useMemo(
    () => filtersFromQuery(new URLSearchParams(query)),
    [query],
  );

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (nextFilters, { silent = false } = {}) => {
    const token = (requestToken.current += 1);
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    const result = await listInterventionCases({
      studentId: nextFilters.studentId,
      gradeId: nextFilters.gradeId,
      sectionId: nextFilters.sectionId,
      competencyId: nextFilters.competencyId,
      severity: nextFilters.severity,
      status: nextFilters.status,
      dateFrom: nextFilters.dateFrom,
      dateTo: nextFilters.dateTo,
      minAttempts: nextFilters.minAttempts,
      minScoreDrop: nextFilters.minScoreDrop,
      page: 1,
      pageSize: 100,
    });

    if (!mounted.current || token !== requestToken.current) return undefined;

    if (result.ok && Array.isArray(result.data)) {
      setCases(sortCases(result.data.map(normalizeCase)));
      setLoaded(true);
      if (silent) setRefreshing(false);
      else setLoading(false);
      return result.data;
    }

    setError(result.error ?? "Could not load the intervention queue.");
    if (silent) setRefreshing(false);
    else setLoading(false);
    return null;
  }, []);

  /**
   * Re-reads the queue whenever the address says something different.
   *
   * The first pass is skipped: the server component already read this exact
   * filter set and handed the rows in, and asking again would replace real
   * content with a pending state for no new information.
   */
  const lastQuery = useRef(query);
  const seeded = useRef(false);
  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      lastQuery.current = query;
      return;
    }
    if (lastQuery.current === query) return;
    lastQuery.current = query;
    load(filtersFromQuery(new URLSearchParams(query)));
  }, [query, load]);

  /**
   * Puts a filter set in the address without adding a history entry.
   *
   * `replace` rather than `push`, because ten filter changes should not be ten
   * presses of the back button between a teacher and the page they came from.
   * `scroll: false`, because a filter narrows what is already on screen and
   * the reader should keep their place.
   */
  const applyToUrl = useCallback(
    (next) => {
      const nextQuery = filtersToQuery(next);
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const setFilter = useCallback(
    (key, value) => {
      applyToUrl({ ...filters, [key]: value || null });
    },
    [applyToUrl, filters],
  );

  /**
   * Applies a full filter snapshot at once. Used by the saved-view flow so
   * every documented key is restored, not just the ones that differ.
   *
   * @param {object} nextFilters
   */
  const applyFilters = useCallback(
    (nextFilters) => {
      applyToUrl({ ...emptyFilters(), ...nextFilters });
    },
    [applyToUrl],
  );

  const clearFilters = useCallback(() => {
    applyToUrl(emptyFilters());
  }, [applyToUrl]);

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

  const reload = useCallback(() => {
    load(filters);
  }, [filters, load]);

  return {
    cases,
    filters,
    loading,
    refreshing,
    loaded,
    error,
    setFilter,
    applyFilters,
    clearFilters,
    applyCase,
    refresh,
    reload,
  };
}
