"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal, Pencil, RotateCcw, Trash2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";

import { isDropped } from "../utils/labels";
import { learnerName } from "../utils/roster";

/** The menu's own width, in px. Matches the `width` set on the panel. */
const MENU_WIDTH = 224;

/** The tallest the menu ever gets: three items, a separator and its padding. */
const MENU_HEIGHT = 156;

/** Breathing room kept between the menu and the edge of the viewport. */
const GUTTER = 8;

/** The gap between the trigger and the menu. */
const OFFSET = 4;

/**
 * Where the menu goes, measured from the trigger and clamped to the viewport.
 *
 * Returned as `fixed` coordinates rather than offsets inside the row. The row
 * lives in the roster's `overflow-hidden` wrapper and its horizontally
 * scrollable inner element, so a menu positioned within that flow is clipped
 * by both — which is exactly what happened on the last rows of the table.
 *
 * Opening upward is anchored by `bottom` rather than by a computed `top`, so a
 * menu shorter than the space it was given grows from the trigger instead of
 * floating above it.
 */
function placeMenu(trigger) {
  const rect = trigger.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom - GUTTER - OFFSET;
  const spaceAbove = rect.top - GUTTER - OFFSET;

  // Downward whenever it fits. Upward only when there is genuinely more room
  // there, so a short viewport does not flip to somewhere equally cramped.
  const flip = spaceBelow < MENU_HEIGHT && spaceAbove > spaceBelow;

  // Right-aligned to the button, then pulled back inside the viewport. On a
  // 320px screen the clamp is what stops the menu widening the document.
  const left = Math.min(
    Math.max(GUTTER, rect.right - MENU_WIDTH),
    Math.max(GUTTER, window.innerWidth - MENU_WIDTH - GUTTER),
  );

  return flip
    ? { left, bottom: window.innerHeight - rect.top + OFFSET, maxHeight: spaceAbove, flip }
    : { left, top: rect.bottom + OFFSET, maxHeight: spaceBelow, flip };
}

/**
 * What a teacher can do to one learner, from the row they are looking at.
 *
 * A menu rather than a line of buttons, because a dropped learner has three
 * actions and two of them are destructive — a row of icons would put "purge
 * permanently" a mis-click away from "edit".
 *
 * It renders through a portal into `document.body` and positions itself with
 * `fixed`, so it is outside the roster's overflow containers entirely: opening
 * it cannot clip the menu, scroll the table, move a row, or add a second
 * vertical scrollbar to the page. It is built from a plain button and a
 * positioned list rather than a new dependency — the trigger owns
 * `aria-expanded` and `aria-controls`, Escape closes it and returns focus, and
 * a click anywhere else dismisses it.
 *
 * The actions offered follow the learner's state, so the same row never shows
 * both "Drop" and "Restore".
 *
 * It goes unavailable while anything is selected. A row menu acts on one
 * learner and the bar at the bottom acts on the selection, and offering both
 * at once leaves a teacher unable to tell which a click is about to be — which
 * matters most for exactly the two actions that cannot be undone.
 */
export function StudentRowActions({ learner, disabled, onEdit, onDrop, onRestore, onPurge }) {
  const [placement, setPlacement] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const dropped = isDropped(learner);
  const name = learnerName(learner);
  const open = placement !== null;

  useEffect(() => {
    if (!open) return undefined;

    function onPointerDown(event) {
      if (menuRef.current?.contains(event.target)) return;
      if (triggerRef.current?.contains(event.target)) return;
      setPlacement(null);
    }

    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      setPlacement(null);
      // Escape must leave the keyboard where it started, not on the page body.
      triggerRef.current?.focus();
    }

    // Fixed coordinates are measured once, so anything that moves the trigger
    // has to re-measure. Scrolling is captured so a scroll inside the table
    // counts too, not only the page's own.
    function reposition() {
      if (!triggerRef.current) return;
      setPlacement(placeMenu(triggerRef.current));
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  function toggle() {
    if (disabled) return;
    // Measured in the handler rather than in an effect, so the menu is never
    // painted at the wrong place first and moved afterwards.
    setPlacement(open || !triggerRef.current ? null : placeMenu(triggerRef.current));
  }

  function choose(action) {
    setPlacement(null);
    triggerRef.current?.focus();
    action?.();
  }

  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground " +
    "hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none";

  const menu = open ? (
    <div
      ref={menuRef}
      id={menuId}
      role="menu"
      aria-label={`Actions for ${name}`}
      data-placement={placement.flip ? "top" : "bottom"}
      /*
       * z-40 sits above the roster and the sticky selection bar, and below the
       * z-50 dialogs — a dialog and this menu are never open together, and if
       * they ever were the dialog should win.
       */
      className="fixed z-40 overflow-y-auto overscroll-contain rounded-lg border border-border bg-card py-1 shadow-md"
      style={{
        width: MENU_WIDTH,
        left: placement.left,
        top: placement.top,
        bottom: placement.bottom,
        maxHeight: Math.max(placement.maxHeight, 0),
      }}
    >
      <button type="button" role="menuitem" className={item} onClick={() => choose(onEdit)}>
        <Pencil aria-hidden="true" className="size-3.5 text-muted-foreground" />
        Edit student
      </button>

      {dropped ? (
        <>
          <button type="button" role="menuitem" className={item} onClick={() => choose(onRestore)}>
            <RotateCcw aria-hidden="true" className="size-3.5 text-muted-foreground" />
            Restore student
          </button>

          <div role="separator" className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            className={`${item} text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10`}
            onClick={() => choose(onPurge)}
          >
            <Trash2 aria-hidden="true" className="size-3.5" />
            Purge permanently
          </button>
        </>
      ) : (
        <button
          type="button"
          role="menuitem"
          className={`${item} text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10`}
          onClick={() => choose(onDrop)}
        >
          <UserMinus aria-hidden="true" className="size-3.5" />
          Drop student
        </button>
      )}
    </div>
  ) : null;

  return (
    <>
      <Button
        ref={triggerRef}
        size="icon"
        variant="outline"
        className="size-8"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={toggle}
        /*
         * Named differently while selection mode is on, so a screen reader
         * hears why it does nothing rather than meeting a button that simply
         * refuses. The bulk bar is the only way to act on a selection.
         */
        aria-label={
          disabled
            ? `Actions for ${name} — unavailable while students are selected`
            : `Actions for ${name}`
        }
      >
        <MoreHorizontal aria-hidden="true" className="size-3.5" />
      </Button>

      {menu && typeof document !== "undefined" ? createPortal(menu, document.body) : null}
    </>
  );
}
