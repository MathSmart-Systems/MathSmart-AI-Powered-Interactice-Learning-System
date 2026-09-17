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
 * Applies or removes the dark class on documentElement for teacher modules.
 *
 * @param {"light" | "dark" | "system"} [targetTheme]
 */
export function applyTeacherTheme(targetTheme) {
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
}

/**
 * Teacher-only theme listener:
 * Activates dark mode strictly while the teacher workspace is mounted.
 * Automatically cleans up by removing dark mode whenever navigating away.
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
      applyTeacherTheme(e.detail?.theme);
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
