"use client";

import { useEffect } from "react";

const TEACHER_PREFS_KEY = "mathsmart.teacher_preferences";
const THEME_KEY = "mathsmart_theme";

/**
 * Reads the active theme preference from localStorage or defaults to system.
 *
 * @returns {"light" | "dark" | "system"}
 */
export function resolveTheme() {
  if (typeof window === "undefined") return "system";
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
  return "system";
}

/**
 * Applies the dark class to <html> based on theme setting and system preference.
 *
 * @param {"light" | "dark" | "system"} [targetTheme]
 */
export function applyGlobalTheme(targetTheme) {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const theme = targetTheme || resolveTheme();
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
 * Global component that synchronizes theme across all workspaces (Student & Teacher),
 * handling OS color-scheme updates and cross-tab storage changes.
 */
export function GlobalThemeListener() {
  useEffect(() => {
    applyGlobalTheme();

    const mediaQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    const handleMediaChange = () => {
      const currentTheme = resolveTheme();
      if (currentTheme === "system") {
        applyGlobalTheme("system");
      }
    };

    const handleStorageChange = (e) => {
      if (e.key === TEACHER_PREFS_KEY || e.key === THEME_KEY) {
        applyGlobalTheme();
      }
    };

    const handleCustomThemeChange = (e) => {
      applyGlobalTheme(e.detail?.theme);
    };

    if (mediaQuery?.addEventListener) {
      mediaQuery.addEventListener("change", handleMediaChange);
    } else if (mediaQuery?.addListener) {
      mediaQuery.addListener(handleMediaChange);
    }

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("mathsmart:theme-change", handleCustomThemeChange);

    return () => {
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
