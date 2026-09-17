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

export function pathItemStatus(value) {
  return MODULE_STATUS[value] ?? { label: "Ready to start", verb: "Open" };
}

/**
 * Status for a module read from the catalogue.
 *
 * Modules on the path carry the path item's status. A module browsed outside
 * the path has no path item, so it reads "Ready to start" unless its progress
 * already says it was finished.
 */
export function catalogueStatus({ pathStatus, isComplete }) {
  if (isComplete) {
    return MODULE_STATUS.completed;
  }
  return pathItemStatus(pathStatus);
}