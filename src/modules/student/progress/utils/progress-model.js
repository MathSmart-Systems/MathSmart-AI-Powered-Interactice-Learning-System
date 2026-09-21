/**
 * Normalization and presentation logic for Student Progress.
 *
 * Keeps calculations deterministic and pure so they can be unit-tested
 * without network or browser dependencies.
 */

import { STUDENT_ROUTE } from "./constants.js";

/**
 * Where each kind of recommended next action leads.
 *
 * The backend names the destination in `type` and writes `label` as prose for
 * the learner. Deciding the route by reading the label instead sent
 * `{type: "dashboard", label: "Return to Dashboard"}` to the activities list,
 * and printed it as "Continue Return to Dashboard", because the label did not
 * begin with the word the old code was looking for. The type is now the only
 * thing consulted, and the label is shown exactly as the backend wrote it.
 *
 * `dashboard` is no longer emitted — a finished path now says `path_complete`
 * and a learner without one is sent to the diagnostic that builds it — but it
 * is still routed, because a learner on a page served before the backend was
 * redeployed should not be handed a broken link.
 */
const ACTION_ROUTE_BY_TYPE = Object.freeze({
  module: STUDENT_ROUTE.MY_LEARNING,
  path_complete: STUDENT_ROUTE.MY_LEARNING,
  dashboard: STUDENT_ROUTE.DASHBOARD,
  activity: STUDENT_ROUTE.ACTIVITIES,
  assessment: STUDENT_ROUTE.ASSESSMENTS,
  diagnostic: STUDENT_ROUTE.DIAGNOSTIC,
});

/**
 * A type this build does not know about still has to lead somewhere truthful.
 * The dashboard is the one destination that is correct for every learner, so an
 * unrecognised type goes there rather than guessing at a feature screen.
 */
const FALLBACK_ACTION_ROUTE = STUDENT_ROUTE.DASHBOARD;

const ACTION_DESCRIPTION_BY_TYPE = Object.freeze({
  module:
    "Open the next lesson on your learning path and build on what you have already done.",
  path_complete:
    "There is nothing left open on your path. Open My Learning to look back over what you finished, or to explore the other published lessons.",
  dashboard:
    "You have finished the lessons on your learning path for now. Your dashboard shows what comes next once your teacher adds more.",
  activity:
    "Practise what you have been working on. Every attempt you make is recorded on this page.",
  assessment: "Your teacher has an assessment waiting for you.",
  diagnostic:
    "Your diagnostic is what builds your learning path, so it is the step that unlocks everything else.",
});

const DEFAULT_ACTION_DESCRIPTION =
  "Follow your recommended next step to keep building your Grade 6 mathematics competencies.";

/**
 * Field names accepted for the complete published Grade 6 competency total.
 *
 * `total_competencies_count` is the contract; the rest are tolerated so that a
 * page served against an older or newer build degrades to "no published total
 * is known" only when there is genuinely nothing to read. This is the only
 * denominator that can support an "all mastered" claim, because it counts the
 * curriculum rather than the rows a learner happens to have attempted.
 */
const PUBLISHED_COMPETENCY_TOTAL_FIELDS = Object.freeze([
  "total_competencies_count",
  "total_competency_count",
  "published_competency_total",
]);

/**
 * Field names accepted for the count of competencies the learner has mastered.
 *
 * The backend counts this over the same published set as the total, so the two
 * are a matched pair. Counting the mastered rows in the payload instead would
 * count over whatever subset the drill-down returned, which is how a numerator
 * and its denominator end up measuring different things.
 */
const MASTERED_COMPETENCY_FIELDS = Object.freeze(["competencies_mastered_count"]);

/**
 * Field names accepted for the learner's assigned-module denominator.
 *
 * `total_modules_count` counts the modules on this learner's own path, not the
 * published catalogue, so "3 of 6" is three of the six they were actually
 * given. When it is missing the learner's path rows are counted directly,
 * which is the same quantity from the other endpoint.
 */
const ASSIGNED_MODULE_TOTAL_FIELDS = Object.freeze([
  "total_modules_count",
  "assigned_modules_count",
  "path_modules_count",
]);

/** Safely parses a number or returns null. */
export function toNumber(val) {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Reads the first usable whole-number count from a set of candidate fields.
 *
 * Returns null rather than zero when nothing usable is present, because a
 * missing denominator and a denominator of zero mean different things to every
 * caller below: one means "do not claim anything", the other means "there is
 * nothing to master".
 */
function readCount(record, fieldNames) {
  if (!isRecord(record)) return null;
  for (const field of fieldNames) {
    const value = toNumber(record[field]);
    if (value !== null && Number.isInteger(value) && value >= 0) {
      return value;
    }
  }
  return null;
}

/** Formats a numeric score as whole percentage string or fallback. */
export function formatScore(val, fallback = "—") {
  const num = toNumber(val);
  return num !== null ? `${Math.round(num)}%` : fallback;
}

/** Formats growth delta with leading plus sign or flat dash. */
export function formatGrowth(growth) {
  const num = toNumber(growth);
  if (num === null) return "—";
  const rounded = Math.round(num);
  if (rounded > 0) return `+${rounded}%`;
  if (rounded < 0) return `${rounded}%`;
  return "0%";
}

/** Formats a date in Philippine / British school record style (e.g. 10 Aug 2026). */
export function formatDate(dateInput) {
  if (!dateInput) return "Recently";
  try {
    const d = new Date(dateInput);
    if (Number.isNaN(d.getTime())) return "Recently";
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Manila",
    }).format(d);
  } catch {
    return "Recently";
  }
}

/**
 * Sorting value for a history row, newest first.
 *
 * Rows the backend could not date are not pretended to be recent: they sort to
 * the end instead of drifting to the top of a list a learner reads as a diary.
 */
function sortableTime(dateInput) {
  if (!dateInput) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(dateInput).getTime();
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/**
 * Describes how much evidence stands behind a band, in the learner's words.
 *
 * The band itself is the database's verdict and is never recalculated here.
 * This only says how many attempts produced it, because a single lucky attempt
 * and a steady run of six read very differently to the learner looking at the
 * same badge.
 */
export function attemptSummary(attemptCount, unsuccessfulAttempts) {
  const attempts = Math.max(0, Math.trunc(toNumber(attemptCount) ?? 0));
  const unsuccessful = Math.min(
    attempts,
    Math.max(0, Math.trunc(toNumber(unsuccessfulAttempts) ?? 0)),
  );

  if (attempts === 0) {
    return "No attempts recorded yet";
  }

  const base = attempts === 1 ? "Based on 1 attempt" : `Based on ${attempts} attempts`;
  if (unsuccessful === 0) {
    return base;
  }
  return `${base}, ${unsuccessful} not yet passing`;
}

/**
 * Resolves display details from the authoritative backend mastery band.
 *
 * Every band carries a written label and a distinct icon in the table, so the
 * classes below are reinforcement rather than the signal. They are drawn from
 * the theme tokens so that the badges keep their contrast in both themes
 * instead of pinning one palette's greens and reds into a feature module.
 */
export function masteryStatus(band) {
  const normalizedBand = typeof band === "string" ? band.toLowerCase().trim() : "";

  if (normalizedBand === "mastered") {
    return {
      label: "Mastered",
      variant: "mastered",
      colorClass: "text-primary bg-primary/10 border-primary/30",
    };
  }

  if (
    normalizedBand === "developing" ||
    normalizedBand === "improved"
  ) {
    return {
      label: "Developing",
      variant: "developing",
      // Deliberately not `bg-muted`: that is the unscored badge's surface, and
      // the two states that most need telling apart would have shared it.
      colorClass: "text-foreground bg-foreground/10 border-foreground/25",
    };
  }

  if (
    normalizedBand === "needs improvement" ||
    normalizedBand === "needs support"
  ) {
    return {
      label: "Needs Support",
      variant: "needs_support",
      colorClass: "text-destructive bg-destructive/10 border-destructive/30",
    };
  }

  return {
    label: "Not Scored",
    variant: "unscored",
    colorClass: "text-muted-foreground bg-muted border-border",
  };
}

/**
 * Resolves the recommended next action the backend named.
 *
 * Only `type` decides the destination and only `label` is shown, so a new
 * action type added to the API lands on the dashboard rather than on a screen
 * chosen by accident.
 */
function backendNextAction(rec) {
  const type = text(rec.type, "module");
  return {
    type,
    title: rec.label,
    description: ACTION_DESCRIPTION_BY_TYPE[type] || DEFAULT_ACTION_DESCRIPTION,
    cta: rec.label,
    href: ACTION_ROUTE_BY_TYPE[type] || FALLBACK_ACTION_ROUTE,
  };
}

/**
 * Transforms raw progress and learner API responses into a complete
 * presentation model for the student progress workspace.
 */
export function buildProgressModel({ progress = {}, learner = {}, pathItems = [] } = {}) {
  if (
    !progress ||
    typeof progress !== "object" ||
    Array.isArray(progress) ||
    !learner ||
    typeof learner !== "object" ||
    Array.isArray(learner)
  ) {
    throw new TypeError("Progress payload must contain learner and progress records");
  }

  const rawMastery = toNumber(progress.overall_mastery);
  const rawDiagnostic = toNumber(progress.diagnostic_score);
  const rawGrowth = toNumber(progress.growth);

  const validPathItems = (Array.isArray(pathItems) ? pathItems : []).filter(isRecord);

  const modulesCompleted = Math.max(0, parseInt(progress.modules_completed_count, 10) || 0);

  /*
   * "X of Y modules" is only meaningful once Y is named, and both halves have
   * to count the same set. Y is the learner's own path — what they were
   * actually asked to do — so the card can say so in words instead of leaving
   * the reader to guess whether six is the whole of Grade 6 or the six they
   * were given.
   */
  const assignedModuleTotal = readCount(progress, ASSIGNED_MODULE_TOTAL_FIELDS);
  const resolvedModuleTotal = assignedModuleTotal ?? validPathItems.length;
  const totalModules = Math.max(modulesCompleted, resolvedModuleTotal);
  const moduleCompletionPercent = totalModules > 0 ? Math.round((modulesCompleted / totalModules) * 100) : 0;

  const rawCompetencies = Array.isArray(progress.competencies) ? progress.competencies : [];
  let masteredRowCount = 0;

  const competencyRows = rawCompetencies
    .filter(isRecord)
    .map((comp, index) => {
      const curScore = toNumber(comp.current_score);
      const diagScore = toNumber(comp.diagnostic_score);
      const status = masteryStatus(comp.mastery_band);

      if (status.variant === "mastered") {
        masteredRowCount += 1;
      }

      const growthVal = toNumber(comp.growth);
      const attemptCount = toNumber(comp.attempt_count) ?? 0;
      const unsuccessfulAttempts = toNumber(comp.unsuccessful_attempts) ?? 0;

      const trajectory = Array.isArray(comp.trajectory)
        ? comp.trajectory
            .filter(isRecord)
            .map((pt) => ({
              date: pt.date ?? null,
              dateFormatted: formatDate(pt.date),
              score: toNumber(pt.score),
              scoreFormatted: formatScore(pt.score),
              label: typeof pt.label === "string" ? pt.label : "Attempt",
            }))
        : [];

      return {
        id: text(comp.competency_id, text(comp.competency_code, `competency-${index}`)),
        code: text(comp.competency_code, "MATH6"),
        name: text(comp.competency_name, "Mathematics Competency"),
        diagnostic: diagScore,
        diagnosticFormatted: formatScore(diagScore),
        current: curScore,
        currentFormatted: formatScore(curScore),
        growth: growthVal,
        growthFormatted: formatGrowth(growthVal),
        status,
        attemptCount,
        unsuccessfulAttempts,
        attemptSummary: attemptSummary(attemptCount, unsuccessfulAttempts),
        trajectory,
      };
    });

  const attemptedCompetencies = competencyRows.length;

  /*
   * "All mastered" is a claim about the whole Grade 6 curriculum, so it may
   * only be made against the published competency total. Counting the rows the
   * learner has attempted and calling that the total told a learner who had
   * tried two competencies and passed both that they had mastered Grade 6.
   *
   * The numerator is the backend's own count, which is taken over the same
   * published set as the total; the mastered rows in this payload are only
   * counted when that figure is absent, because they count over whatever subset
   * the drill-down returned. A total that is missing, zero, or smaller than
   * what the learner has already attempted or mastered is not a curriculum
   * count at all: the denominator then falls back to the attempted rows and the
   * claim is withheld entirely.
   */
  const masteredCount = readCount(progress, MASTERED_COMPETENCY_FIELDS) ?? masteredRowCount;
  const publishedCompetencyTotal = readCount(progress, PUBLISHED_COMPETENCY_TOTAL_FIELDS);
  const hasPublishedCompetencyTotal =
    publishedCompetencyTotal !== null &&
    publishedCompetencyTotal > 0 &&
    publishedCompetencyTotal >= attemptedCompetencies &&
    publishedCompetencyTotal >= masteredCount;
  // Without a published total the denominator is the attempted rows, widened
  // to the mastered count if that is somehow larger: a fraction over one is a
  // more obvious lie to the learner than a denominator that is merely partial.
  const masteryDenominator = hasPublishedCompetencyTotal
    ? publishedCompetencyTotal
    : Math.max(attemptedCompetencies, masteredCount);
  const masteryDenominatorSource = hasPublishedCompetencyTotal ? "published" : "attempted";
  const allCompetenciesMastered =
    hasPublishedCompetencyTotal && masteredCount === publishedCompetencyTotal;
  const masteryPercent =
    masteryDenominator > 0 ? Math.round((masteredCount / masteryDenominator) * 100) : 0;

  // Recommended Next Action
  let nextAction = null;
  if (rawDiagnostic === null && learner?.diagnostic_status !== "completed") {
    nextAction = {
      type: "diagnostic",
      title: "Complete Your Baseline Diagnostic",
      description: "Take your Grade 6 Diagnostic Assessment to establish your starting proficiency and unlock customized learning modules.",
      cta: "Start Diagnostic",
      href: STUDENT_ROUTE.DIAGNOSTIC,
    };
  } else if (typeof progress.recommended_next_action?.label === "string") {
    nextAction = backendNextAction(progress.recommended_next_action);
  } else if (validPathItems.length > 0) {
    const activeItem =
      validPathItems.find((p) => p.status === "in_progress" || p.status === "available") ||
      validPathItems[0];
    nextAction = {
      type: "module",
      title: text(activeItem?.module?.title, "Continue Your Learning Path"),
      description: text(activeItem?.reason, "Targeted practice specifically assigned for your learning pace."),
      cta: "Start Module",
      href: STUDENT_ROUTE.MY_LEARNING,
    };
  } else {
    nextAction = {
      type: "review",
      title: "Review Practice Activities",
      description: "Keep your skills sharp with interactive practice problems.",
      cta: "Explore Activities",
      href: STUDENT_ROUTE.ACTIVITIES,
    };
  }

  // Learning History segregation
  const rawActivities = Array.isArray(progress.recent_activity) ? progress.recent_activity : [];

  const assessmentsHistory = [];
  const modulesHistory = [];
  const activitiesHistory = [];

  /*
   * The recent-activity list and every competency trajectory are projections of
   * the same stored attempts, so the same attempt arrives twice. It used to be
   * appended twice as well, which showed a learner one sitting as two and
   * inflated the count on the Assessments tab.
   *
   * The recent-activity copy is kept because it carries the resource and its
   * real title, and each trajectory point is matched against it by attempt
   * identity — label, timestamp and score. The tally is a count rather than a
   * set so that two genuinely separate competencies scored identically on the
   * same timestamp still contribute two rows: one trajectory point may cancel
   * one recent-activity row, not every row that looks like it.
   */
  const claimedAttempts = new Map();
  const attemptKey = (label, date, score) =>
    `${String(label).trim().toLowerCase()}|${date ?? ""}|${score ?? ""}`;

  function isAssessmentLabel(label) {
    const lower = typeof label === "string" ? label.toLowerCase() : "";
    return lower.includes("assessment") || lower.includes("diagnostic");
  }

  rawActivities.forEach((act, idx) => {
    if (!isRecord(act)) return;
    const actScore = toNumber(act.score);
    const item = {
      // Two attempts at the same activity share a resource id, so the position
      // is part of the key. Without it React collapsed repeat attempts.
      id: `${text(act.resource_id, "activity")}-${idx}`,
      title: text(act.title, text(act.label, "Interactive Activity")),
      label: text(act.label, "Practice"),
      score: actScore,
      scoreFormatted: formatScore(actScore),
      date: act.date ?? null,
      dateFormatted: formatDate(act.date),
      sortTime: sortableTime(act.date),
    };

    const lower = typeof act.label === "string" ? act.label.toLowerCase() : "";
    if (isAssessmentLabel(act.label)) {
      const key = attemptKey(item.label, act.date, actScore);
      claimedAttempts.set(key, (claimedAttempts.get(key) ?? 0) + 1);
      assessmentsHistory.push(item);
    } else if (lower.includes("module")) {
      modulesHistory.push(item);
    } else {
      activitiesHistory.push(item);
    }
  });

  competencyRows.forEach((comp) => {
    comp.trajectory.forEach((t) => {
      if (!isAssessmentLabel(t.label)) return;

      const key = attemptKey(t.label, t.date, t.score);
      const claimed = claimedAttempts.get(key) ?? 0;
      if (claimed > 0) {
        claimedAttempts.set(key, claimed - 1);
        return;
      }

      assessmentsHistory.push({
        id: `${comp.id}-${t.label}-${t.dateFormatted}`,
        title: `${comp.name}: ${t.label}`,
        score: t.score,
        scoreFormatted: t.scoreFormatted,
        date: t.date,
        dateFormatted: t.dateFormatted,
        sortTime: sortableTime(t.date),
        type: "assessment",
      });
    });
  });

  // Path items as completed/in-progress module history if recent activities lack modules
  if (modulesHistory.length === 0) {
    validPathItems.forEach((p) => {
      if (p.status === "completed" || p.status === "in_progress") {
        modulesHistory.push({
          id: text(p.id, text(p.module?.id, "learning-module")),
          title: text(p.module?.title, "Learning Module"),
          label: p.status === "completed" ? "Module Completed" : "Module In Progress",
          score: null,
          scoreFormatted: p.status === "completed" ? "Completed" : "In Progress",
          // A path row carries no timestamp. It used to print "Current Path"
          // in the column every other row uses for a date, which read as one.
          date: null,
          dateFormatted: "No date recorded",
          sortTime: Number.NEGATIVE_INFINITY,
        });
      }
    });
  }

  // Newest first, with undated rows last, so each tab reads as one diary
  // rather than as two lists stitched together in the order they were built.
  const newestFirst = (list) => list.sort((a, b) => b.sortTime - a.sortTime);

  return {
    studentId: progress.student_id || learner?.student_id,
    learnerName: text(learner.full_name, "Learner"),
    overallMastery: rawMastery,
    overallMasteryFormatted: formatScore(rawMastery, "0%"),
    diagnosticScore: rawDiagnostic,
    diagnosticScoreFormatted: formatScore(rawDiagnostic, "—"),
    growth: rawGrowth,
    growthFormatted: formatGrowth(rawGrowth),
    modulesCompleted,
    totalModules,
    moduleCompletionPercent,
    masteredCount,
    totalCompetencies: attemptedCompetencies,
    attemptedCompetencies,
    publishedCompetencyTotal,
    hasPublishedCompetencyTotal,
    masteryDenominator,
    masteryDenominatorSource,
    allCompetenciesMastered,
    masteryPercent,
    competencies: competencyRows,
    recommendedAction: nextAction,
    history: {
      assessments: newestFirst(assessmentsHistory),
      modules: newestFirst(modulesHistory),
      activities: newestFirst(activitiesHistory),
    },
    hasData: rawDiagnostic !== null || competencyRows.length > 0 || rawActivities.length > 0,
  };
}
