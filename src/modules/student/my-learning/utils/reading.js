/**
 * How the lesson reader decides a learner has actually read a section, and what
 * it sends when they have.
 *
 * None of this decides whether a lesson is finished. `app.module_is_satisfied`
 * does that, from a passed activity, and reading progress only moves a path
 * item to `in_progress`. What these functions settle is the narrower question
 * the reader has to answer for itself: which sections have genuinely been in
 * front of the learner, and how to say so to the API without sending a request
 * for every scroll event.
 *
 * They are pure so they can be tested without a browser. The reader owns the
 * timers and the `IntersectionObserver`; the judgement lives here.
 */

/**
 * How much of a section has to be on screen before it counts as being read.
 *
 * Six tenths of a short section is a section a learner is looking at. A section
 * taller than the window can never reach that fraction, so the requirement is
 * capped at half the viewport: a learner reading a long worked example has the
 * middle of the screen full of it, which is the same evidence expressed in the
 * only way a tall element can express it.
 */
export const READING_VISIBLE_RATIO = 0.6;
export const READING_VIEWPORT_RATIO = 0.5;

/**
 * How long it has to stay there.
 *
 * A learner who drags the scrollbar from the title to the practice button puts
 * every section on screen for a moment, and none of it has been read. Two
 * seconds of the section holding still is short enough that an ordinary reader
 * never notices the rule and long enough that a flick past cannot satisfy it.
 */
export const READING_DWELL_MS = 2000;

/**
 * How long the reader waits for the reading to settle before it saves.
 *
 * Sections are collected as they are read and sent together once a second and a
 * half has passed without another one arriving, so scrolling through a lesson
 * costs a handful of requests rather than one per section and never one per
 * scroll event.
 */
export const READING_QUIET_MS = 1500;

function finitePositive(value) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

/**
 * Whether the part of a section currently on screen is enough of it.
 *
 * The comparison is in pixels rather than in `intersectionRatio` because the
 * ratio is meaningless for a section taller than the window: a worked example
 * twice the height of the viewport tops out at a ratio of about 0.5 no matter
 * how carefully it is read. Measuring the visible height against the smaller of
 * "most of the section" and "half the window" asks the same question of a short
 * section and a long one.
 *
 * The half-pixel tolerance is for fractional layout heights, where a section
 * fully on screen reports a visible height a hair under its own.
 */
export function isOnScreenEnough({ visibleHeight, sectionHeight, viewportHeight }) {
  const visible = finitePositive(visibleHeight);
  const section = finitePositive(sectionHeight);
  const viewport = finitePositive(viewportHeight);

  if (visible === 0 || section === 0 || viewport === 0) {
    return false;
  }

  const needed = Math.min(section * READING_VISIBLE_RATIO, viewport * READING_VIEWPORT_RATIO);
  return visible + 0.5 >= needed;
}

/**
 * The one request a batch of newly read sections turns into.
 *
 * `completed_section_ids` is a replacement rather than an addition, so the
 * payload carries everything the server has already confirmed as well as what
 * has just been read, in the lesson's own order. An id the lesson does not have
 * is dropped instead of being sent for the database to refuse, and a batch that
 * adds nothing the server already knows produces no request at all — which is
 * what keeps a learner scrolling back over a lesson they have read from writing
 * the same row over and over.
 *
 * `last_section_id` is the last section the learner was actually in, so it is
 * taken from the new reading and not from the ordered union: the furthest point
 * reached is not necessarily the last one looked at, and it is the latter a
 * learner is returned to.
 */
export function progressPayload({ orderedIds = [], confirmedIds = [], justRead = [] }) {
  const known = new Set(confirmedIds);
  const belongs = new Set(orderedIds);

  const fresh = [];
  for (const id of justRead) {
    if (belongs.has(id) && !known.has(id) && !fresh.includes(id)) {
      fresh.push(id);
    }
  }

  if (fresh.length === 0) {
    return null;
  }

  const finished = new Set([...known, ...fresh]);

  return {
    completedSectionIds: orderedIds.filter((id) => finished.has(id)),
    lastSectionId: fresh[fresh.length - 1],
  };
}
