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
  PROGRESS: "/student/progress",
});

/** How many rows each summary section shows before it defers to its own page. */
export const PATH_PREVIEW_LIMIT = 4;
export const COMPETENCY_PREVIEW_LIMIT = 5;
export const ACTIVITY_PREVIEW_LIMIT = 5;

const ACTIVE_PATH_STATUSES = new Set(["available", "in_progress"]);

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
    href: STUDENT_ROUTE.ASSESSMENTS,
    meta: null,
  };
}

function nextActionForModule(item) {
  const status = pathItemStatus(item.status);
  const carryingOn = item.status === "in_progress";

  return {
    kind: "module",
    eyebrow: carryingOn ? "Carry on" : "Your next step",
    title: item.moduleTitle,
    description:
      item.reason ?? "This module is next on the path built from your diagnostic.",
    cta: `${status.verb} this module`,
    href: STUDENT_ROUTE.MY_LEARNING,
    meta: {
      competency: item.competencyName,
      competencyCode: item.competencyCode,
      minutes: item.estimatedMinutes,
      statusLabel: status.label,
    },
  };
}

const ALL_DONE_ACTION = Object.freeze({
  kind: "all_done",
  eyebrow: "Nothing left waiting",
  title: "You have finished every module on your path",
  description:
    "There is no work queued for you right now. Look back at how far your scores have moved, and your teacher will add the next competencies.",
  cta: "Look at my progress",
  href: STUDENT_ROUTE.PROGRESS,
  meta: null,
});

const NO_PATH_ACTION = Object.freeze({
  kind: "no_path",
  eyebrow: "Your path is being prepared",
  title: "No modules are on your path yet",
  description:
    "Your teacher builds your path from your diagnostic and the Grade 6 competencies. Until it arrives, the modules already published are open to browse.",
  cta: "Browse My Learning",
  href: STUDENT_ROUTE.MY_LEARNING,
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
export function buildDashboardModel({ learner, progress, pathItems }) {
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

  let nextAction;

  if (!diagnosticIsComplete) {
    nextAction = nextActionForDiagnostic(diagnosticValue);
  } else if (recommendedItem) {
    nextAction = nextActionForModule(recommendedItem);
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
  } else if (path.length > 0) {
    nextAction = ALL_DONE_ACTION;
  } else {
    nextAction = NO_PATH_ACTION;
  }

  const modulesFinished = toNumber(progress?.modules_completed_count) ?? 0;
  const modulesTotal = toNumber(progress?.total_modules_count) ?? 0;
  const competencies = Array.isArray(progress?.competencies)
    ? progress.competencies.map(toCompetency)
    : [];
  const activity = Array.isArray(progress?.recent_activity)
    ? progress.recent_activity.map(toActivity)
    : [];

  return {
    learner: {
      fullName: learner?.full_name ?? null,
      firstName: firstName(learner?.full_name),
      learnerId: learner?.learner_id ?? null,
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
      percent: completionPercent(modulesFinished, modulesTotal),
    },
    path: {
      items: path,
      preview: path.slice(0, PATH_PREVIEW_LIMIT),
      remaining: Math.max(path.length - PATH_PREVIEW_LIMIT, 0),
      activeCount: path.filter((item) => ACTIVE_PATH_STATUSES.has(item.status)).length,
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
