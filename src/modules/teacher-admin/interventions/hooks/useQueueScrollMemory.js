"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

const STORAGE_KEY = "mathsmart.interventions.scroll.v1";

/** The element that actually scrolls around the queue, or the window. */
function scrollerFor(node) {
  let element = node?.parentElement ?? null;
  while (element) {
    const style = window.getComputedStyle(element);
    if (/(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight) {
      return element;
    }
    element = element.parentElement;
  }
  return null;
}

/**
 * Remembers where the teacher was in the queue, per filter set.
 *
 * The browser restores a scroll offset on its own back button, but not when
 * somebody follows a link back — and the case page has one of those, because
 * "Back to the intervention queue" has to work whether they arrived by link,
 * by typing the address, or from a bookmark.
 *
 * The offset is stored against the query string it belongs to, so returning to
 * a queue narrowed differently starts at the top rather than at an offset that
 * meant something on a different list. `sessionStorage` is the right lifetime:
 * this is worth keeping while a teacher works through a queue, and worth
 * forgetting when they close the tab. Every access is guarded, because a
 * private window may refuse it outright.
 *
 * @param {string} query - The queue's current query string
 * @returns {React.RefObject} Attach this to the element the list sits in.
 */
export function useQueueScrollMemory(query) {
  const anchorRef = useRef(null);
  const queryRef = useRef(query);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const remember = useCallback(() => {
    const scroller = scrollerFor(anchorRef.current);
    const top = scroller ? scroller.scrollTop : window.scrollY;
    try {
      window.sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ query: queryRef.current, top }),
      );
    } catch {
      // A browser that refuses storage simply does not remember. The queue
      // still works; it just starts at the top.
    }
  }, []);

  useLayoutEffect(() => {
    let stored = null;
    try {
      stored = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null");
    } catch {
      stored = null;
    }

    if (stored && stored.query === query && typeof stored.top === "number" && stored.top > 0) {
      const scroller = scrollerFor(anchorRef.current);
      if (scroller) scroller.scrollTop = stored.top;
      else window.scrollTo(0, stored.top);
    }
    // Only on arrival. Restoring on every filter change would fight the
    // teacher's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const scroller = scrollerFor(anchorRef.current);
    const target = scroller ?? window;
    target.addEventListener("scroll", remember, { passive: true });
    window.addEventListener("pagehide", remember);
    return () => {
      target.removeEventListener("scroll", remember);
      window.removeEventListener("pagehide", remember);
      remember();
    };
  }, [remember]);

  return anchorRef;
}
