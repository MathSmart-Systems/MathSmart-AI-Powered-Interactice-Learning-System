"use client";

import { useEffect, useRef } from "react";

function isEditableTarget(target) {
  const node = target;
  if (!node || typeof node.tagName !== "string") return false;
  const tag = node.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return Boolean(node.isContentEditable);
}

/**
 * Keyboard shortcuts for the queue.
 *
 *   "/"  - focus the first filter control
 *   "n"  - open the first case in the queue
 *
 * Resolving used to be bound to "r", back when a case opened as a dialog over
 * this list and "the case open for review" was a thing the list knew about. A
 * case is its own page now, so the key had nothing to act on and resolving
 * lives where the case is. A shortcut that sometimes does nothing is worse
 * than no shortcut.
 *
 * Keys are ignored while the teacher types in a field, and none of these are
 * mutations derived from AI — they open the same deterministic pages.
 *
 * @param {object} options
 * @param {() => void} options.onNextCase
 * @returns {React.RefObject} Attach this to the first filter control.
 */
export function useQueueShortcuts({ onNextCase }) {
  const filterFocusRef = useRef(null);
  const nextRef = useRef(onNextCase);

  useEffect(() => {
    nextRef.current = onNextCase;
  });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.defaultPrevented) return;
      // A held key must not repeat a mutation.
      if (event.repeat) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        filterFocusRef.current?.focus();
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        nextRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return filterFocusRef;
}