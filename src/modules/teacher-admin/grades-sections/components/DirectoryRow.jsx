"use client";

import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * One row of the school directory, and the shapes that sit beside it.
 *
 * Lives in its own file because both the working directory and the
 * out-of-scope panel draw the same row, and a row that knows nothing about
 * either of them cannot drift into serving one better than the other.
 */

function StatusPill({ active }) {
  return (
    <span className="shrink-0 rounded-full border border-border bg-background/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {active ? "Active" : "Inactive"}
    </span>
  );
}

export function EmptyState({ message }) {
  return (
    <p className="rounded-lg border border-dashed border-border bg-background/50 px-4 py-6 text-center text-sm text-muted-foreground">
      {message}
    </p>
  );
}

/**
 * A single bordered row: the name and its status on the left, its actions on
 * the right. Every action carries its own word, because a teacher taking a
 * live section out of the directory should not have to interpret an icon.
 *
 * The row stacks until its own panel is wide enough to hold a name beside the
 * wording — a container query, not a viewport one, because the panel is half
 * the width of the page from the `md` breakpoint upward. On a panel narrow
 * enough to be a phone the stacked buttons share the full width, which makes
 * them easier to hit; wider than that they take their natural size.
 */
export function DirectoryRow({ label, meta, active, onEdit, onToggle, onDelete, working }) {
  const toggleText = working
    ? active
      ? "Deactivating…"
      : "Activating…"
    : active
      ? "Deactivate"
      : "Activate";
  const ToggleIcon = active ? PowerOff : Power;

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card px-3 py-2.5 @md:flex-row @md:items-center @md:justify-between @md:gap-3">
      <div className="flex min-w-0 flex-1 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{label}</p>
          {meta ? <p className="truncate text-[11px] text-muted-foreground">{meta}</p> : null}
        </div>
        <StatusPill active={active} />
      </div>

      <div className="flex w-full shrink-0 items-center gap-2 @sm:w-auto">
        {onEdit ? (
          <Button
            size="sm"
            variant="outline"
            className="flex-1 @sm:flex-none"
            onClick={onEdit}
            aria-label={`Edit ${label}`}
          >
            <Pencil aria-hidden="true" className="size-3.5" />
            Edit
          </Button>
        ) : null}
        {onToggle ? (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 @sm:flex-none"
            onClick={onToggle}
            disabled={working}
            aria-busy={working || undefined}
            aria-label={`${toggleText} ${label}`}
          >
            <ToggleIcon aria-hidden="true" className="size-3.5" />
            {toggleText}
          </Button>
        ) : null}
        {/*
         * Deleting is offered only once a section is retired, so removing a
         * live class can never be one click. It is marking-pen red because it
         * is the one action here that cannot be undone.
         */}
        {onDelete && !active ? (
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 text-destructive hover:bg-destructive/10 hover:text-destructive @sm:flex-none"
            onClick={onDelete}
            disabled={working}
            aria-label={`Delete ${label}`}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Delete
          </Button>
        ) : null}
      </div>
    </li>
  );
}
