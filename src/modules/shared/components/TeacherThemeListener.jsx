"use client";

import { useEffect } from "react";

const TEACHER_PREFS_KEY = "mathsmart.teacher_preferences";
const THEME_KEY = "mathsmart_theme";

/**
 * Reads the teacher theme preference from localStorage or defaults to light.
 *
 * @returns {"light" | "dark" | "system"}
 */
export function resolveTeacherTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const rawPrefs = window.localStorage.getItem(TEACHER_PREFS_KEY);
    if (rawPrefs) {
      const parsed = JSON.parse(rawPrefs);
      if (parsed?.theme) return parsed.theme;
    }
    const rawTheme = window.localStorage.getItem(THEME_KEY);
    if (rawTheme) return rawTheme;
  } catch {
    // Graceful fallback
  }
  return "light";
}

/**
 * Applies or removes the dark and projector-mode classes on documentElement for teacher modules.
 *
 * @param {"light" | "dark" | "system"} [targetTheme]
 * @param {boolean} [targetProjectorMode]
 */
export function applyTeacherTheme(targetTheme, targetProjectorMode) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const theme = targetTheme || resolveTeacherTheme();
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }

  let projectorMode = targetProjectorMode;
  if (projectorMode === undefined) {
    try {
      const rawPrefs = window.localStorage.getItem(TEACHER_PREFS_KEY);
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs);
        projectorMode = parsed?.projectorMode;
      }
    } catch {
      // Graceful fallback
    }
  }

  if (projectorMode) {
    document.documentElement.classList.add("projector-mode");
  } else {
    document.documentElement.classList.remove("projector-mode");
  }
}

/**
 * Teacher-only theme listener:
 * Activates dark mode and projector mode strictly while the teacher workspace is mounted.
 * Automatically cleans up by removing dark mode and projector mode whenever navigating away.
 */
export function TeacherThemeListener() {
  useEffect(() => {
    applyTeacherTheme();

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const handleMediaChange = () => {
      const currentTheme = resolveTeacherTheme();
      if (currentTheme === "system") {
        applyTeacherTheme("system");
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === TEACHER_PREFS_KEY || e.key === THEME_KEY) {
        applyTeacherTheme();
      }
    };

    const handleCustomThemeChange = (e) => {
      applyTeacherTheme(e.detail?.theme, e.detail?.projectorMode);
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleMediaChange);
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("mathsmart:theme-change", handleCustomThemeChange);

    return () => {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.remove("projector-mode");
      if (mediaQuery?.removeEventListener) {
        mediaQuery.removeEventListener("change", handleMediaChange);
      } else if (mediaQuery?.removeListener) {
        mediaQuery.removeListener(handleMediaChange);
      }
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("mathsmart:theme-change", handleCustomThemeChange);
    };
  }, []);

  return null;
}
