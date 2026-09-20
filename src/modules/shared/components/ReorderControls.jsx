"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Move-earlier and move-later, for any authored list that carries an order.
 *
 * Three things it deliberately does differently from the pair it replaces.
 *
 * The buttons are `aria-disabled` at the ends rather than `disabled`. A button
 * that disables itself under the pointer that just pressed it is removed from
 * the focus order, and the browser drops focus to the document body — so
 * moving an item to the top of a list with the keyboard threw the user out of
 * the list they were reordering.
 *
 * The accessible name says what is moving, not which position it holds. The
 * position is the one thing a reorder changes, so a label built from it names
 * something different the moment it is used.
 *
 * And the buttons are full controls with a visible arrow and a named target
 * rather than 32px icon squares, so they match the size of every other action
 * in these workspaces.
 *
 * @param {object} props
 * @param {string} props.itemName - What is being moved, e.g. "What is 2 + 2?".
 * @param {number} props.index - Zero-based place in the list.
 * @param {number} props.total
 * @param {(offset: number) => void} props.onMove
 */
export function ReorderControls({ itemName, index, total, onMove }) {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-disabled={isFirst}
        aria-label={`Move ${itemName} earlier`}
        className={isFirst ? "opacity-50" : undefined}
        onClick={() => {
          if (!isFirst) {
            onMove(-1);
          }
        }}
      >
        <ArrowUp aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Up</span>
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-disabled={isLast}
        aria-label={`Move ${itemName} later`}
        className={isLast ? "opacity-50" : undefined}
        onClick={() => {
          if (!isLast) {
            onMove(1);
          }
        }}
      >
        <ArrowDown aria-hidden="true" className="size-4" />
        <span className="sr-only sm:not-sr-only">Down</span>
      </Button>
    </div>
  );
}
