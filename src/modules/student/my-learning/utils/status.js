/**
 * The words MathSmart uses for a module's place in a learner's week.
 *
 * Every status a learner sees is written out, so a colour, a tint or a glyph
 * is never the only thing carrying the meaning. The vocabulary matches the
 * learner dashboard: "Ready to start", "In progress", "Finished", "Opens
 * later" — plain sentences, never database identifiers.
 */

/** `app.path_item_status` as a learner reads it. */
export const MODULE_STATUS = Object.freeze({
  locked: Object.freeze({ label: "Opens later", verb: "Open" }),
  available: Object.freeze({ label: "Ready to start", verb: "Start" }),
  in_progress: Object.freeze({ label: "In progress", verb: "Continue" }),
  completed: Object.freeze({ label: "Finished", verb: "Review" }),
});

/**
 * What a browsed lesson says when reading is all the evidence there is.
 *
 * Deliberately not "Finished". `student_module_progress.is_complete` means
 * every section has been read, and since completion started requiring a passed
 * activity that is no longer the same claim. Calling it "Finished" on the
 * browse shelf would hand back the self-certification the path itself just
 * took away — a learner would read the whole lesson, see "Finished", and be
 * wrong about it.
 */
const READ_THROUGH = Object.freeze({ label: "All read", verb: "Review" });

export function pathItemStatus(value) {
  return MODULE_STATUS[value] ?? { label: "Ready to start", verb: "Open" };
}

/**
 * Status for a module read from the catalogue.
 *
 * The path item is authoritative wherever there is one: it is the value
 * `app.refresh_learning_path` computed from stored evidence, and it already
 * knows whether the learner passed the practice. Reading is consulted only for
 * a lesson browsed outside the assigned path, where there is no path item to
 * ask — and then it says "All read", which is what it actually knows.
 */
export function catalogueStatus({ pathStatus, isComplete }) {
  if (pathStatus) {
    return pathItemStatus(pathStatus);
  }
  if (isComplete) {
    return READ_THROUGH;
  }
  return pathItemStatus(pathStatus);
}

/**
 * Whether a row is shut rather than merely unstarted.
 *
 * `app.refresh_learning_path` never downgrades a completed item, so a learner
 * who has already finished a lesson keeps it open even if a stale catalogue
 * read still carries the old `locked`. Deciding that here, once, is what stops
 * each screen from repeating the comparison and getting it subtly different.
 */
export function isLockedStatus({ statusValue, isComplete }) {
  return statusValue === "locked" && !isComplete;
}
