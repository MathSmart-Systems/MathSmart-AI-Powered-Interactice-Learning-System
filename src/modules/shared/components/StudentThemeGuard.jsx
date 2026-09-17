"use client";

import { useEffect } from "react";

/**
 * Ensures student modules strictly remain in the default light mode.
 * Any dark mode class on documentElement is immediately removed on mount.
 */
export function StudentThemeGuard() {
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return null;
}
