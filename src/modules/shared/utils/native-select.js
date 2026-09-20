/**
 * The class list that makes a native `<select>` look like the Input primitive.
 *
 * A native select is the right control for these workspaces: it cannot be
 * clipped by a card, it cannot open a second scrollbar inside a table or a
 * dialog, it flips against the viewport edge without being asked, and on a
 * phone it is the platform's own picker. What it does not do is inherit the
 * theme, so it borrows it here.
 *
 * Kept in one place because the literal was copied into two authoring dialogs
 * and had started to drift from `src/components/ui/input.jsx`, which it exists
 * to match.
 */
export const NATIVE_SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30 md:text-sm";
