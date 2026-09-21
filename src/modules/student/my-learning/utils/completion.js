/**
 * What actually finishes a lesson, in the words a Grade 6 learner reads.
 *
 * `app.module_is_satisfied` settles this in the database: a module with a
 * published activity is finished when the learner has passed that activity,
 * judged at submission from the stored answer keys, and a module with no
 * published activity falls back to reading progress because there is nothing
 * to pass. Reading still moves a path item to `in_progress`; it no longer
 * closes one.
 *
 * Nothing here recomputes that rule — the path status the API returns is the
 * database's own answer. These functions only choose which of the three true
 * sentences the reader should be showing, so that the reader never promises a
 * learner something the database will not honour.
 */

/** The lesson is done: the path item is closed, or there was nothing to pass. */
export const FINISHED = "finished";

/** The lesson has an activity, and passing it is the only thing that closes it. */
export const PASS_THE_ACTIVITY = "pass_the_activity";

/** The lesson has no activity, so reading all of it is what closes it. */
export const READ_IT_ALL = "read_it_all";

/**
 * Statuses that certainly do not make an activity a learner's to attempt.
 *
 * `activities_select` already refuses a learner anything but a published
 * activity on a published module, so every activity in this payload is one they
 * may open. The test therefore names the statuses that are definitely not
 * published rather than insisting on a spelling of "published" the API could
 * change: mistaking a real activity for none would tell a learner that reading
 * finishes a lesson that only passing can finish, which is the exact untruth
 * this screen exists to stop telling.
 *
 * An activity with no id is dropped as well. It cannot be opened, and an
 * activity a learner cannot reach cannot be what finishes their lesson.
 */
const NOT_PUBLISHED = new Set(["draft", "archived"]);

export function practiceActivities(activities = []) {
  if (!Array.isArray(activities)) {
    return [];
  }
  return activities.filter((activity) => activity?.id && !NOT_PUBLISHED.has(activity.status));
}

/**
 * Which of the three sentences applies, and how to say it.
 *
 * `pathStatus` is `app.learning_path_items.status`, recomputed by
 * `app.refresh_learning_path` and the only value in this payload that knows
 * whether the activity was passed. `readingComplete` is
 * `student_module_progress.is_complete`, which since the completion migration
 * means every section has been read and nothing more than that — so it is
 * allowed to say "you have read all of this" and is never allowed to say "you
 * have finished this" while an activity is still waiting to be passed.
 */
export function completionRule({ pathStatus, hasPracticeActivity, readingComplete }) {
  if (pathStatus === "completed") {
    return {
      kind: FINISHED,
      title: "You have finished this lesson.",
      detail: hasPracticeActivity
        ? "You passed its practice activity. You can read it again, or practise again, whenever you like."
        : "You read all of it, and it has no practice activity to pass.",
    };
  }

  if (hasPracticeActivity) {
    return {
      kind: PASS_THE_ACTIVITY,
      title: "Passing the practice activity is what finishes this lesson.",
      detail:
        "Reading saves how far you have got. This lesson counts as finished when you get enough of the practice activity right, and you can try it more than once.",
    };
  }

  if (readingComplete) {
    return {
      kind: FINISHED,
      title: "You have read all of this lesson.",
      detail: "It has no practice activity, so reading all of it is what finishes it.",
    };
  }

  return {
    kind: READ_IT_ALL,
    title: "Reading the whole lesson is what finishes it.",
    detail:
      "This lesson has no practice activity yet, so your reading is what completes it. If your teacher adds an activity later, passing that becomes the thing that finishes it.",
  };
}
