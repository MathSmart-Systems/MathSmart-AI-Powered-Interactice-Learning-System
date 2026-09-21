/**
 * Turns the three learner contracts into exactly what the dashboard renders.
 *
 * The rule this file exists to keep: MathSmart does not compute a learner
 * result in the browser. Mastery, growth, mastery bands, path order and the
 * recommended next action all arrive already decided by
 * `GET /api/v1/progress/me`, `GET /api/v1/learning-path/me` and
 * `GET /api/v1/students/me`. What happens below is selection and wording —
 * which of those decided values is shown first, and what it is called.
 *
 * The one product rule applied here is the order of two answers the API gives
 * separately: while the learner's diagnostic is unfinished, the diagnostic is
 * the next action, because the path the API recommends from is built out of it.
 */

import {
  completionPercent,
  describeGrowth,
  firstName,
  formatCount,
  toNumber,
} from "./format.js";
import { diagnosticStatus, masteryBand, pathItemStatus, supportNotice } from "./status.js";

/** Only routes that exist today. Nothing here is a placeholder destination. */
export const STUDENT_ROUTE = Object.freeze({
  DASHBOARD: "/student/dashboard",
  MY_LEARNING: "/student/my-learning",
  ACTIVITIES: "/student/activities",
  ASSESSMENTS: "/student/assessments",
  DIAGNOSTIC: "/student/assessments/diagnostic",
  PROGRESS: "/student/progress",
  module: (moduleId) => `/student/my-learning/${encodeURIComponent(moduleId)}`,
  activity: (activityId) => `/student/activities/${encodeURIComponent(activityId)}`,
  assessment: (assessmentId) => `/student/assessments/${encodeURIComponent(assessmentId)}`,
});

/** How many rows each summary section shows before it defers to its own page. */
export const PATH_PREVIEW_LIMIT = 4;
export const COMPETENCY_PREVIEW_LIMIT = 5;
export const ACTIVITY_PREVIEW_LIMIT = 5;
export const READY_PREVIEW_LIMIT = 3;

/** Activity path states the server marks as open to this learner now. */
const OPEN_PATH_STATUSES = new Set(["available", "in_progress"]);

/** Assessment availability values that mean "there is something to sit". */
const OPEN_ASSESSMENT = new Set(["available", "in_progress", "reassessment"]);

function nextActionForDiagnostic(status) {
  const starting = status !== "in_progress";

  return {
    kind: "diagnostic",
    eyebrow: starting ? "Start here" : "Pick up where you stopped",
    title: starting ? "Take your diagnostic" : "Finish your diagnostic",
    description: starting
      ? "The diagnostic finds what you already know, so MathSmart can plot your starting point and build a path that fits you."
      : "You have answers saved already. Finishing the diagnostic plots your starting point and opens your learning path.",
    cta: starting ? "Start the diagnostic" : "Finish the diagnostic",
    href: STUDENT_ROUTE.DIAGNOSTIC,
    meta: null,
  };
}

function nextActionForModule(item, masteryScore = null) {
  const status = pathItemStatus(item.status);
  const carryingOn = item.status === "in_progress";

  return {
    kind: "module",
    eyebrow: carryingOn ? "Carry on" : "Your next step",
    title: item.moduleTitle,
    // Plain words for a Grade 6 learner. The API's recommendation reason is a
    // teacher-facing sentence ("places this competency in the Needs
    // Improvement band") and it stays on the teacher's side of the product.
    description: carryingOn
      ? "You have started this lesson. Pick up where you stopped."
      : "This is the next lesson on your learning path.",
    cta: `${status.verb} this lesson`,
    // The lesson itself, not the list it sits in. The module id was already
    // loaded; the old link made the learner find it again.
    href: item.moduleId ? STUDENT_ROUTE.module(item.moduleId) : STUDENT_ROUTE.MY_LEARNING,
    meta: {
      competency: item.competencyName,
      competencyCode: item.competencyCode,
      minutes: item.estimatedMinutes,
      statusLabel: status.label,
      masteryScore: toNumber(masteryScore),
    },
  };
}

const ALL_DONE_ACTION = Object.freeze({
  kind: "all_done",
  eyebrow: "Nothing left waiting",
  title: "You have finished every lesson on your path",
  description:
    "There is no work queued for you right now. Look back at how far your scores have moved, and your teacher will add the next competencies.",
  cta: "Look at my progress",
  href: STUDENT_ROUTE.PROGRESS,
  meta: null,
});

const NO_PATH_ACTION = Object.freeze({
  kind: "no_path",
  eyebrow: "Your path is being prepared",
  title: "Your learning path is not ready yet",
  description:
    "Your path is built from your diagnostic. While it is being prepared, you can look through the lessons in My Learning.",
  cta: "Browse My Learning",
  href: STUDENT_ROUTE.MY_LEARNING,
  meta: null,
});

const LOCKED_PATH_ACTION = Object.freeze({
  kind: "locked_path",
  eyebrow: "More learning is coming",
  title: "Your next module is not open yet",
  description:
    "Your teacher will open the next module when it is ready. You can review your progress while you wait.",
  cta: "Look at my progress",
  href: STUDENT_ROUTE.PROGRESS,
  meta: null,
});

function toPathItem(item) {
  return {
    id: item?.id ?? null,
    priority: toNumber(item?.priority),
    reason: item?.reason ?? null,
    status: item?.status ?? null,
    statusLabel: pathItemStatus(item?.status).label,
    competencyName: item?.competency?.name ?? null,
    competencyCode: item?.competency?.code ?? null,
    moduleId: item?.module?.id ?? null,
    moduleTitle: item?.module?.title ?? "Untitled module",
    estimatedMinutes: toNumber(item?.module?.estimated_minutes),
  };
}

function toCompetency(row) {
  return {
    id: row?.competency_id ?? null,
    code: row?.competency_code ?? null,
    name: row?.competency_name ?? "Untitled competency",
    diagnosticScore: toNumber(row?.diagnostic_score),
    currentScore: toNumber(row?.current_score),
    growth: describeGrowth(row?.growth),
    growthValue: toNumber(row?.growth),
    band: masteryBand(row?.mastery_band),
    attemptCount: toNumber(row?.attempt_count) ?? 0,
  };
}

/**
 * Practice the server says is open to this learner right now.
 *
 * Both flags are the server's: `is_ready` means the activity can actually be
 * delivered, and `path_status` is where it sits on this learner's own path. An
 * activity on no path at all is open practice, and is offered too.
 */
function toReadyActivity(row) {
  return {
    id: String(row?.id ?? ""),
    title: row?.title ?? "Untitled practice",
    // The practice title already names its lesson, so the lesson title under
    // it only said the same thing twice.
    detail: null,
    minutes: toNumber(row?.estimated_minutes),
    href: row?.id ? STUDENT_ROUTE.activity(row.id) : STUDENT_ROUTE.ACTIVITIES,
    started: toNumber(row?.attempt_count) > 0,
  };
}

function isOpenActivity(row) {
  if (!row?.is_ready) return false;
  return row.path_status === null || row.path_status === undefined || OPEN_PATH_STATUSES.has(row.path_status);
}

/**
 * Assessments the server says this learner can sit now.
 *
 * `availability` is decided in SQL — including whether a retake is allowed —
 * so nothing here works out who may sit what. The diagnostic is left out: it
 * has its own place at the top of the page until it is done.
 */
function toReadyAssessment(row) {
  return {
    id: String(row?.id ?? ""),
    title: row?.title ?? "Untitled assessment",
    detail:
      row?.availability === "in_progress"
        ? "Started — pick up where you stopped"
        : row?.availability === "reassessment"
          ? "You can try this again"
          : null,
    minutes: toNumber(row?.duration_minutes),
    href: row?.id ? STUDENT_ROUTE.assessment(row.id) : STUDENT_ROUTE.ASSESSMENTS,
    started: row?.availability === "in_progress",
  };
}

function isOpenAssessment(row) {
  return Boolean(row?.is_ready) && row?.type !== "diagnostic" && OPEN_ASSESSMENT.has(row?.availability);
}

function toActivity(row, index) {
  return {
    id: `${row?.resource_id ?? "record"}-${row?.date ?? index}`,
    date: row?.date ?? null,
    label: row?.label ?? "Recorded work",
    title: row?.title ?? null,
    score: toNumber(row?.score),
  };
}

/**
 * Builds the view model.
 *
 * @param {object} input
 * @param {object|null} input.learner  data from `GET /students/me`
 * @param {object|null} input.progress data from `GET /progress/me`
 * @param {Array|null} input.pathItems data from `GET /learning-path/me`
 */
export function buildDashboardModel({
  learner,
  progress,
  pathItems,
  activities = null,
  assessments = null,
}) {
  const path = Array.isArray(pathItems) ? pathItems.map(toPathItem) : [];
  const diagnosticValue = learner?.diagnostic_status ?? null;
  const diagnostic = diagnosticStatus(diagnosticValue);
  const diagnosticIsComplete = diagnosticValue === "completed";

  const recommendation = progress?.recommended_next_action ?? null;
  const recommendedModuleId =
    recommendation?.type === "module" ? (recommendation.resource_id ?? null) : null;
  const recommendedItem = recommendedModuleId
    ? path.find((item) => item.moduleId === recommendedModuleId)
    : null;

  const competencies = Array.isArray(progress?.competencies)
    ? progress.competencies.map(toCompetency)
    : [];

  let nextAction;

  if (!diagnosticIsComplete) {
    nextAction = nextActionForDiagnostic(diagnosticValue);
  } else if (recommendedItem) {
    const comp = competencies.find(
      (c) =>
        (c.code && c.code === recommendedItem.competencyCode) ||
        (c.name && c.name === recommendedItem.competencyName)
    );
    nextAction = nextActionForModule(recommendedItem, comp?.currentScore ?? null);
  } else if (recommendedModuleId) {
    // The API recommended a module the path response does not describe. Take the
    // learner to the same destination, using the wording the API supplied.
    nextAction = nextActionForModule({
      status: "available",
      moduleTitle: recommendation?.label ?? "Your next module",
      reason: null,
      competencyName: null,
      competencyCode: null,
      estimatedMinutes: null,
    });
  } else if (recommendation?.type === "path_complete") {
    // The API's own answer. It used to be re-derived here from path statuses.
    nextAction = ALL_DONE_ACTION;
  } else if (path.length > 0 && path.every((item) => item.status === "completed")) {
    nextAction = ALL_DONE_ACTION;
  } else if (path.length > 0) {
    nextAction = LOCKED_PATH_ACTION;
  } else {
    nextAction = NO_PATH_ACTION;
  }

  const modulesFinished = toNumber(progress?.modules_completed_count) ?? 0;
  const modulesTotal = toNumber(progress?.total_modules_count) ?? 0;
  const masteredCount = toNumber(progress?.competencies_mastered_count);
  const competencyTotal = toNumber(progress?.total_competencies_count);

  const openActivities = Array.isArray(activities)
    ? activities.filter(isOpenActivity).map(toReadyActivity)
    : null;
  const openAssessments = Array.isArray(assessments)
    ? assessments.filter(isOpenAssessment).map(toReadyAssessment)
    : null;
  const activity = Array.isArray(progress?.recent_activity)
    ? progress.recent_activity.map(toActivity)
    : [];

  return {
    learner: {
      fullName: learner?.full_name ?? null,
      firstName: firstName(learner?.full_name),
      learnerId: learner?.learner_id ?? null,
      sectionName: learner?.section_name ?? null,
    },
    diagnostic: {
      value: diagnosticValue,
      label: diagnostic.label,
      summary: diagnostic.summary,
      isComplete: diagnosticIsComplete,
    },
    support: supportNotice({
      monitoringStatus: progress?.monitoring_status ?? learner?.monitoring_status ?? null,
      openInterventionCount: toNumber(progress?.active_intervention_count) ?? 0,
    }),
    nextAction,
    plot: {
      diagnosticScore: toNumber(progress?.diagnostic_score),
      currentScore: toNumber(progress?.overall_mastery),
      growthValue: toNumber(progress?.growth),
      growth: describeGrowth(progress?.growth),
    },
    modules: {
      ...formatCount(modulesFinished, modulesTotal),
      // Null when there is no path to be a percentage of. The view used to
      // print "null% of Grade 6 path completed" for every learner without one.
      percent: completionPercent(modulesFinished, modulesTotal),
      hasPath: modulesTotal > 0,
    },
    mastery: {
      mastered: masteredCount,
      total: competencyTotal,
    },
    ready: {
      // Null when the list could not be read, which the view says in words;
      // an empty array is a real "nothing open right now".
      activities: openActivities === null ? null : openActivities.slice(0, READY_PREVIEW_LIMIT),
      activityCount: openActivities === null ? null : openActivities.length,
      assessments:
        openAssessments === null ? null : openAssessments.slice(0, READY_PREVIEW_LIMIT),
      assessmentCount: openAssessments === null ? null : openAssessments.length,
    },
    path: {
      items: path,
      preview: path.slice(0, PATH_PREVIEW_LIMIT),
      remaining: Math.max(path.length - PATH_PREVIEW_LIMIT, 0),
      isEmpty: path.length === 0,
    },
    competencies: {
      items: competencies,
      preview: competencies.slice(0, COMPETENCY_PREVIEW_LIMIT),
      remaining: Math.max(competencies.length - COMPETENCY_PREVIEW_LIMIT, 0),
      isEmpty: competencies.length === 0,
    },
    activity: {
      items: activity,
      preview: activity.slice(0, ACTIVITY_PREVIEW_LIMIT),
      isEmpty: activity.length === 0,
    },
  };
}
