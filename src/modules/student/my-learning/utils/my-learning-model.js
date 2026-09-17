/**
 * The view model for Student My Learning.
 *
 * The API returns a catalogue and an ordered path in two shapes and two calls.
 * This module joins them into the rows a screen actually renders: the path in
 * priority order with its reasons and statuses, and the remaining published
 * modules as a browsable shelf underneath. All reads here are pure; the screen
 * never decides a status for itself, it only chooses the words to print the
 * backend's answer in.
 */

import { catalogueStatus, pathItemStatus } from "./status.js";
import { formatPercent, toNumber } from "./format.js";

export const MY_LEARNING_ROUTE = "/student/my-learning";

export function moduleRoute(moduleId) {
  return `${MY_LEARNING_ROUTE}/${moduleId}`;
}

export function activityRoute(activityId) {
  return `/student/activities/${activityId}`;
}

const DEFAULT_COMPETENCY_NAME = "Grade 6 mathematics";

function readString(value, fallback = "") {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

function asStringList(value) {
  return Array.isArray(value) ? value.filter((step) => typeof step === "string").map((s) => s.trim()).filter(Boolean) : [];
}

/** A module as the catalogue endpoint describes it, with safe defaults. */
function catalogueRow(item = {}) {
  const id = item.module_id ?? item.id ?? null;

  return {
    moduleId: id,
    competencyName: readString(item.competency_name, DEFAULT_COMPETENCY_NAME),
    title: readString(item.title, "Untitled lesson"),
    minutes: toNumber(item.estimated_minutes),
    orderIndex: toNumber(item.order_index) ?? Number.MAX_SAFE_INTEGER,
    pathStatus: item.path_status ?? null,
    completionPercentage: formatPercent(item.completion_percentage) ?? 0,
    isComplete: Boolean(item.is_complete),
  };
}

/** A path item as the learning-path endpoint describes it, with safe defaults. */
function pathRow(item = {}) {
  const moduleInfo = item.module ?? {};
  const competency = item.competency ?? {};
  const moduleId = moduleInfo.id ?? item.module_id ?? null;

  if (moduleId === null) {
    return null;
  }

  const priority = toNumber(item.priority) ?? null;
  const status = pathItemStatus(item.status ?? null);

  return {
    moduleId,
    key: priority ?? moduleId,
    priority,
    reason: readString(item.reason, null),
    statusValue: item.status ?? null,
    title: readString(moduleInfo.title, "Untitled lesson"),
    competencyName: readString(competency.name, DEFAULT_COMPETENCY_NAME),
    competencyCode: readString(competency.code, null),
    minutes: toNumber(moduleInfo.estimated_minutes),
    pathStatus: status,
    cta: `${status.verb} this module`,
  };
}

/**
 * The My Learning screen. `path` runs in the order the teacher's reasons gave
 * it; `browse` lists every published module not on the path, ordered by the
 * curriculum, so a learner who outgrows their path can still open anything.
 */
export function buildMyLearningModel({ modules = [], pathItems = [] }) {
  const catalogue = modules.map(catalogueRow).filter((row) => row.moduleId !== null);
  const byId = new Map(catalogue.map((row) => [row.moduleId, row]));
  const pathIds = new Set();

  const path = pathItems
    .map((item) => {
      const row = pathRow(item);
      if (row === null) {
        return null;
      }
      pathIds.add(row.moduleId);

      const found = byId.get(row.moduleId);
      if (found) {
        row.title = found.title;
        row.competencyName = found.competencyName;
        row.competencyCode = found.competencyCode ?? row.competencyCode;
        row.minutes = found.minutes ?? row.minutes;
        row.completionPercentage = found.completionPercentage;
        row.isComplete = found.isComplete;
      } else {
        row.completionPercentage = 0;
        row.isComplete = false;
      }

      return row;
    })
    .filter((row) => row !== null);

  const browse = catalogue
    .filter((row) => !pathIds.has(row.moduleId))
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((row) => {
      const status = catalogueStatus(row);
      return {
        moduleId: row.moduleId,
        key: row.moduleId,
        title: row.title,
        competencyName: row.competencyName,
        minutes: row.minutes,
        completionPercentage: row.completionPercentage,
        isComplete: row.isComplete,
        statusValue: row.isComplete ? "completed" : row.pathStatus,
        pathStatus: status,
        cta: `${status.verb} this module`,
      };
    });

  return {
    path,
    browse,
    pathEmpty: path.length === 0,
    catalogueEmpty: catalogue.length === 0,
  };
}

/**
 * Rules and worked examples are authored in camel-case keys but documented in
 * snake-case, so a reader never assumes which shape left the server. One rule
 * becomes the fields the screen prints; an extra `highlight` line is kept only
 * when it was actually written.
 */
function normalizeRule(rule = {}) {
  return {
    title: readString(rule.title),
    formula: readString(rule.ruleFormula ?? rule.rule_formula),
    explanation: readString(rule.explanation),
    visual: readString(rule.visualExample ?? rule.visual_example),
    highlight: readString(rule.highlight, null),
  };
}

function normalizeExample(example = {}) {
  return {
    problem: readString(example.problem),
    steps: asStringList(example.steps),
    solution: readString(example.solution),
    tip: readString(example.tip, null),
  };
}

const SECTION_LABELS = {
  objective: "The learning goal",
  concept: "The big idea",
};

function sectionLabel(id, index) {
  if (SECTION_LABELS[id]) {
    return SECTION_LABELS[id];
  }
  if (id.startsWith("rule_")) {
    return `Rule ${id.slice("rule_".length)}`;
  }
  if (id.startsWith("example_")) {
    return `Worked example ${id.slice("example_".length)}`;
  }
  return `Section ${String(index + 1)}`;
}

/**
 * One module, ready to read.
 *
 * `percent` and `isComplete` are the backend's own numbers. A fresh module has
 * no progress row at all — that is not the same as zero, so missing progress
 * renders as "not started" and never as a fake 0%.
 */
export function buildModuleReaderModel(detail = {}) {
  const progress = detail.progress ?? {};
  const completedSections = new Set(asStringList(progress.completed_section_ids));

  const rules = Array.isArray(detail.rules) ? detail.rules.map(normalizeRule) : [];
  const workedExamples = Array.isArray(detail.worked_examples)
    ? detail.worked_examples.map(normalizeExample)
    : [];
  const activities = Array.isArray(detail.associated_activities)
    ? detail.associated_activities.map((activity) => ({
        id: activity.id ?? null,
        title: readString(activity.title, "Practice activity"),
        status: readString(activity.status, null),
      }))
    : [];

  const rawSectionIds = Array.isArray(detail.section_ids)
    ? detail.section_ids.filter((id) => typeof id === "string")
    : [];
  const sections = rawSectionIds.map((id, index) => ({
    id,
    label: sectionLabel(id, index),
    done: completedSections.has(id),
  }));

  const completionPercent =
    formatPercent(progress.completion_percentage) ??
    formatPercent(progress.completionPercentage) ??
    0;
  const isComplete = Boolean(progress.is_complete ?? progress.isComplete);

  const allSectionsFinished =
    !isComplete && sections.length > 0 && sections.every((section) => section.done);

  return {
    id: detail.id ?? detail.module_id ?? null,
    competencyName: readString(detail.competency_name, DEFAULT_COMPETENCY_NAME),
    title: readString(detail.title, "Untitled lesson"),
    minutes: toNumber(detail.estimated_minutes),
    pathStatus: readString(detail.path_status, null),
    objective: readString(detail.learning_objective, null),
    explanation: readString(detail.short_explanation, null),
    rules,
    workedExamples,
    activities,
    sections,
    ruleCount: rules.length,
    exampleCount: workedExamples.length,
    progress: {
      percent: completionPercent,
      isComplete,
      completedSectionIds: [...completedSections],
      lastSectionId: readString(progress.last_section_id ?? progress.lastSectionId, null),
    },
    allSectionsFinished,
  };
}
