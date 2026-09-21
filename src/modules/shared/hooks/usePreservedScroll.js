"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

/**
 * A layout effect in the browser, an ordinary effect on the server.
 *
 * The restore has to happen before the browser paints or the learner sees the
 * page move and then move back, which is what a layout effect is for. React
 * warns that one cannot run during server rendering, and it is right — there is
 * no scroll offset to keep there — so the server gets the version that never
 * runs at all.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Keeps the page where the reader left it across a state change.
 *
 * Answering, checking, taking a hint and moving between questions all swap
 * content of different heights in and out: the feedback panel appears and
 * disappears, a hint adds two lines, a correct answer takes the check button
 * away. When the document ends up shorter the browser clamps the scroll offset
 * it can no longer honour, and a learner who was reading question four is moved
 * without having asked to be.
 *
 * `preserve()` is called by the handler that is about to cause the change, and
 * the layout effect puts the offset back before the browser paints, so nothing
 * is ever seen to move. An asynchronous handler calls it twice — once on the
 * click and once when the answer lands — because the render that matters is the
 * second one.
 *
 * Submitting and retrying use it too, together with a focus move to the new
 * heading: the screen is replaced rather than adjusted, but a learner who has
 * scrolled down to the last question should not be thrown back to the top for
 * having finished.
 *
 * Shared because both the activity player and the assessment player have the
 * same problem for the same reason. It moved here when the second one needed
 * it, not in anticipation of it.
 */
export function usePreservedScroll() {
  const offset = useRef(null);

  const preserve = useCallback(() => {
    if (typeof window === "undefined") return;
    offset.current = window.scrollY;
  }, []);

  useBeforePaint(() => {
    const target = offset.current;
    offset.current = null;
    if (target === null || typeof window === "undefined") return;
    if (window.scrollY !== target) window.scrollTo(window.scrollX, target);
  });

  return preserve;
}
