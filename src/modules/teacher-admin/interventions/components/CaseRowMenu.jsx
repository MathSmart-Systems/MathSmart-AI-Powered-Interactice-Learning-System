"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, MoreHorizontal } from "lucide-react";

/**
 * Quick actions for one queue row.
 *
 * Only transitions that need no educator-written reason are performed inline.
 * A reopen from "Resolved" always routes through the full review form, because
 * it requires a reason and a deliberate decision.
 *
 * @param {object} props
 * @param {object} item - The normalized queue row
 * @param {(interventionId: string, status: "In Progress"|"Resolved") => void} props.onQuickStatus
 * @param {(interventionId: string) => void} props.onRecord
 * @param {boolean} [props.disabled]
 */
export function CaseRowMenu({ item, onQuickStatus, onRecord, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const status = item?.status;
  const canMarkInProgress = status === "Needs Intervention";
  const canMarkResolved = status === "Needs Intervention" || status === "In Progress";

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const run = (action) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Quick actions for ${item?.student?.full_name ?? "this learner"}`}
        onClick={() => setOpen((current) => !current)}
        disabled={disabled}
        className="inline-flex size-8 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:border-input hover:bg-muted/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-60"
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Quick actions"
          className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-lg border border-border bg-card p-1 shadow-lg"
        >
          {canMarkInProgress ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => onQuickStatus(item.id, "In Progress"))}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
            >
              Mark In Progress
            </button>
          ) : null}
          {canMarkResolved ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => run(() => onQuickStatus(item.id, "Resolved"))}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-emerald-700 dark:text-emerald-300 transition-colors hover:bg-muted/40"
            >
              Mark Resolved
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => run(() => onRecord(item.id))}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-semibold text-foreground transition-colors hover:bg-muted/40"
          >
            {status === "Resolved" ? "Reopen case…" : "Record action…"}
            <ChevronRight aria-hidden="true" className="ml-auto size-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}