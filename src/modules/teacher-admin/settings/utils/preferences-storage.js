/**
 * Storage helpers for teacher preferences and avatar in the browser.
 */

export const PREFERENCES_KEY = "mathsmart.teacher_preferences";
export const TEACHER_AVATAR_KEY = "mathsmart.teacher_avatar";

/**
 * Reads saved display preferences from localStorage.
 *
 * @param {object} [fallback]
 * @returns {object}
 */
export function loadDisplayPreferences(fallback = {}) {
  if (typeof window === "undefined") {
    return { ...fallback };
  }
  try {
    const raw = window.localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

/**
 * Applies the active theme (light, dark, or system) to the document root element.
 *
 * @param {string} [theme]
 */
export function applyTheme(theme = "light") {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  const isDark =
    theme === "dark" ||
    (theme === "system" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);

  if (isDark) {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

/**
 * Saves display preferences to localStorage and updates DOM styling.
 *
 * @param {object} prefs
 */
export function saveDisplayPreferences(prefs) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
  } catch {
    // Safe fallback
  }
  if (prefs?.theme) {
    applyTheme(prefs.theme);
  }
  // Notify TeacherThemeListener so projector mode takes effect immediately
  // across all teacher pages without requiring a reload.
  try {
    window.dispatchEvent(
      new CustomEvent("mathsmart:theme-change", {
        detail: { theme: prefs?.theme, projectorMode: prefs?.projectorMode },
      })
    );
  } catch {
    // Safe fallback
  }
}

/**
 * Reads the saved teacher avatar (data URL or preset ID) from localStorage.
 *
 * @returns {string | null}
 */
export function loadTeacherAvatar() {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage.getItem(TEACHER_AVATAR_KEY) || null;
  } catch {
    return null;
  }
}

/**
 * Saves or removes the teacher avatar in localStorage and broadcasts a change event.
 *
 * @param {string | null} avatar
 */
export function saveTeacherAvatar(avatar) {
  if (typeof window === "undefined") return;
  try {
    if (avatar) {
      window.localStorage.setItem(TEACHER_AVATAR_KEY, avatar);
    } else {
      window.localStorage.removeItem(TEACHER_AVATAR_KEY);
    }
    window.dispatchEvent(new Event("mathsmart:teacher-avatar-change"));
  } catch {
    // Safe fallback
  }
}
