import { expect } from "@playwright/test";

/**
 * Keeping a learner's place, and proving it.
 *
 * The defect these guard against is one defect wearing two faces. A screen
 * that swaps its content for a full-page skeleton is briefly much shorter than
 * it was; the browser clamps a scroll offset it can no longer honour; and when
 * the taller content returns the offset is gone. The learner experiences that
 * as "it jumped me back to the top", and the skeleton is the cause rather than
 * a separate annoyance.
 *
 * Both student players are therefore held to the same two rules: an ordinary
 * action never replaces the screen with a skeleton, and it never moves the
 * page.
 */

/** The window's current vertical offset. */
export function scrollTop(page) {
  return page.evaluate(() => Math.round(window.scrollY));
}

/** How far this page can actually be scrolled right now. */
export function reachableScroll(page) {
  return page.evaluate(() =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
  );
}

/**
 * Scrolls below the fold and returns where it landed.
 *
 * Returns 0 when the page is short enough to need no scrolling, which is a
 * legitimate outcome rather than a failure: a caller that asserts against the
 * returned offset is then asserting nothing, which is correct — there was no
 * place to lose.
 */
export async function scrollBelowTheFold(page) {
  const reachable = await reachableScroll(page);
  if (reachable === 0) return 0;

  const target = Math.max(1, Math.round(reachable * 0.6));
  await page.evaluate((offset) => window.scrollTo(0, offset), target);
  await page.waitForFunction(
    (offset) => Math.abs(window.scrollY - offset) < 4,
    target,
    { timeout: 2000 },
  );
  return scrollTop(page);
}

/**
 * Asserts the page is still roughly where it was.
 *
 * The comparison is against what the page can now hold rather than against the
 * original number. Content legitimately changes height — a results screen is
 * shorter than the question list it replaces — and the browser will clamp an
 * offset that no longer exists. Demanding the exact pixel would fail for a
 * reason that is not a defect. Being dropped at the top, which is the defect,
 * fails this every time.
 */
export async function expectKeptPlace(page, before, description = "the page kept its place") {
  if (before === 0) return;

  const reachable = await reachableScroll(page);
  const floor = Math.min(before, reachable) / 2;
  const after = await scrollTop(page);

  expect(after, `${description} (was ${before}, now ${after}, reachable ${reachable})`).toBeGreaterThanOrEqual(
    floor,
  );
}

/**
 * Runs an action and proves it neither moved the page nor blanked the screen.
 *
 * `anchor` is something that was on screen before the action and must still be
 * on screen after it. That is what catches the full-page skeleton: a skeleton
 * takes the real content away, so an anchor drawn from the real content
 * disappears with it.
 */
export async function expectOrdinaryAction(page, { anchor, act, description }) {
  await expect(anchor, `${description}: the anchor was not there to begin with`).toBeVisible();
  const before = await scrollBelowTheFold(page);

  await act();

  await expect(anchor, `${description}: the screen was replaced`).toBeVisible();
  await expectKeptPlace(page, before, description);
}

/**
 * Whether a control turns up, rather than whether it is there this instant.
 *
 * `count()` is a snapshot. A player fetches its content and opens an attempt
 * after the heading has already rendered, so a count taken the moment the
 * heading appears reads zero for controls that arrive a few hundred
 * milliseconds later — and the test skips itself for a reason that was not
 * true by the time it would have run.
 */
export async function present(locator, timeout = 8_000) {
  try {
    await locator.first().waitFor({ state: "attached", timeout });
    return true;
  } catch {
    return false;
  }
}

/** Every element on the page that owns a vertical scrollbar of its own. */
export function verticalScrollers(page) {
  return page.evaluate(() => {
    const found = [];
    for (const node of document.querySelectorAll("*")) {
      const style = getComputedStyle(node);
      const scrolls = style.overflowY === "auto" || style.overflowY === "scroll";
      if (scrolls && node.scrollHeight > node.clientHeight + 1) {
        found.push(`${node.tagName.toLowerCase()}.${String(node.className).slice(0, 60)}`);
      }
    }
    return found;
  });
}

/** The widths a student screen has to survive, phone through to wide desktop. */
export const STUDENT_VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 800 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide", width: 1920, height: 1080 },
];
