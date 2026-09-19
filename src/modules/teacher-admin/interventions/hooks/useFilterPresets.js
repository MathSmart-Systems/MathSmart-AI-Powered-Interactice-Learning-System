"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "mathsmart.interventions.presets.v1";

/**
 * Saved filter views for the intervention queue.
 *
 * Presets are plain filter snapshots kept in localStorage. They never contain
 * educator notes, learner evidence, or anything sensitive — only filter keys —
 * and they never influence any deterministic decision by themselves.
 *
 * @returns {object}
 */
export function useFilterPresets() {
  const [presets, setPresets] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    const read = () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        const stored = raw ? JSON.parse(raw) : [];
        setPresets(Array.isArray(stored) ? stored : []);
      } catch {
        setPresets([]);
      }
    };
    const timer = window.setTimeout(read, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const persist = useCallback((next) => {
    setPresets(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      setError("Could not save your filter preset to this browser.");
    }
  }, []);

  const save = useCallback((name, filters) => {
    const trimmed = String(name ?? "").trim();
    if (!trimmed) return;
    const next = [...presets.filter((item) => item.name !== trimmed), { name: trimmed, filters }];
    persist(next);
  }, [persist, presets]);

  const remove = useCallback((name) => {
    persist(presets.filter((item) => item.name !== name));
  }, [persist, presets]);

  return { presets, error, save, remove };
}