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
 *   "n"  - open the next case in the queue
 *   "r"  - resolve the case currently open for review
 *
 * Esc already closes the review modal through the dialog primitive. Keys are
 * ignored while the teacher types in a field, and none of these are mutations
 * derived from AI — they call the same deterministic queue and status actions.
 *
 * @param {object} options
 * @param {() => void} options.onNextCase
 * @param {() => void} options.onResolveReview
 * @param {boolean} [options.resolveBusy] - True while a resolve is in flight
 * @returns {React.RefObject} Attach this to the first filter control.
 */
export function useQueueShortcuts({ onNextCase, onResolveReview, resolveBusy = false }) {
  const filterFocusRef = useRef(null);
  const nextRef = useRef(onNextCase);
  const resolveRef = useRef(onResolveReview);
  const resolveBusyRef = useRef(resolveBusy);

  useEffect(() => {
    nextRef.current = onNextCase;
    resolveRef.current = onResolveReview;
    resolveBusyRef.current = resolveBusy;
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
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        // One resolve at a time, or each press writes another audit event.
        if (resolveBusyRef.current) return;
        resolveRef.current?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return filterFocusRef;
}