/**
 * Normalization and presentation logic for Student Progress.
 *
 * Keeps calculations deterministic and pure so they can be unit-tested
 * without network or browser dependencies.
 */

import { STUDENT_ROUTE } from "./constants.js";

/** Safely parses a number or returns null. */
export function toNumber(val) {
  return typeof val === "number" && Number.isFinite(val) ? val : null;
}

function text(value, fallback) {
  return typeof value === "string" && value.trim() ? value : fallback;
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

/** Resolves display details from the authoritative backend mastery band. */
export function masteryStatus(band) {
  const normalizedBand = typeof band === "string" ? band.toLowerCase().trim() : "";

  if (normalizedBand === "mastered") {
    return {
      label: "Mastered",
      variant: "mastered",
      colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800",
    };
  }

  if (
    normalizedBand === "developing" ||
    normalizedBand === "improved"
  ) {
    return {
      label: "Developing",
      variant: "developing",
      colorClass: "text-indigo-700 bg-indigo-50 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800",
    };
  }

  if (
    normalizedBand === "needs improvement" ||
    normalizedBand === "needs support"
  ) {
    return {
      label: "Needs Support",
      variant: "needs_support",
      colorClass: "text-rose-700 bg-rose-50 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800",
    };
  }

  return {
    label: "Not Scored",
    variant: "unscored",
    colorClass: "text-slate-600 bg-slate-100 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700",
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

  const modulesCompleted = Math.max(0, parseInt(progress.modules_completed_count, 10) || 0);
  const totalModules = Math.max(modulesCompleted, parseInt(progress.total_modules_count, 10) || 0);
  const moduleCompletionPercent = totalModules > 0 ? Math.round((modulesCompleted / totalModules) * 100) : 0;

  const rawCompetencies = Array.isArray(progress.competencies) ? progress.competencies : [];
  let masteredCount = 0;

  const competencyRows = rawCompetencies
    .filter((comp) => comp && typeof comp === "object" && !Array.isArray(comp))
    .map((comp, index) => {
      const curScore = toNumber(comp.current_score);
      const diagScore = toNumber(comp.diagnostic_score);
      const status = masteryStatus(comp.mastery_band);

      if (status.variant === "mastered") {
        masteredCount += 1;
      }

      const growthVal = toNumber(comp.growth);

      const trajectory = Array.isArray(comp.trajectory)
        ? comp.trajectory
            .filter((pt) => pt && typeof pt === "object" && !Array.isArray(pt))
            .map((pt) => ({
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
        attemptCount: toNumber(comp.attempt_count) ?? 0,
        unsuccessfulAttempts: toNumber(comp.unsuccessful_attempts) ?? 0,
        trajectory,
      };
    });

  const totalCompetencies = Math.max(competencyRows.length, 1);
  const masteryPercent = totalCompetencies > 0 ? Math.round((masteredCount / totalCompetencies) * 100) : 0;

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
    const rec = progress.recommended_next_action;
    nextAction = {
      type: text(rec.type, "module"),
      title: rec.label,
      description: "Follow your recommended next step to strengthen competencies and boost your mastery score.",
      cta: rec.label.startsWith("Continue") ? rec.label : `Continue ${rec.label}`,
      href: rec.type === "module" ? STUDENT_ROUTE.MY_LEARNING : STUDENT_ROUTE.ACTIVITIES,
    };
  } else if (Array.isArray(pathItems) && pathItems.length > 0) {
    const validPathItems = pathItems.filter((p) => p && typeof p === "object" && !Array.isArray(p));
    const activeItem = validPathItems.find((p) => p.status === "in_progress" || p.status === "available") || validPathItems[0];
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

  // Trajectory items from competencies also populate assessments history
  competencyRows.forEach((comp) => {
    comp.trajectory.forEach((t) => {
      const lower = t.label.toLowerCase();
      if (lower.includes("diagnostic") || lower.includes("assessment")) {
        assessmentsHistory.push({
          id: `${comp.id}-${t.label}-${t.dateFormatted}`,
          title: `${comp.name}: ${t.label}`,
          score: t.score,
          scoreFormatted: t.scoreFormatted,
          dateFormatted: t.dateFormatted,
          type: "assessment",
        });
      }
    });
  });

  // Recent activity list populated from progress
  rawActivities.forEach((act, idx) => {
    if (!act || typeof act !== "object" || Array.isArray(act)) return;
    const actScore = toNumber(act.score);
    const item = {
      id: text(act.resource_id, `activity-${idx}`),
      title: text(act.title, text(act.label, "Interactive Activity")),
      label: text(act.label, "Practice"),
      score: actScore,
      scoreFormatted: formatScore(actScore),
      dateFormatted: formatDate(act.date),
    };

    const lower = typeof act.label === "string" ? act.label.toLowerCase() : "";
    if (lower.includes("assessment") || lower.includes("diagnostic")) {
      assessmentsHistory.push(item);
    } else if (lower.includes("module")) {
      modulesHistory.push(item);
    } else {
      activitiesHistory.push(item);
    }
  });

  // Path items as completed/in-progress module history if recent activities lack modules
  if (modulesHistory.length === 0 && Array.isArray(pathItems)) {
    pathItems.forEach((p) => {
      if (!p || typeof p !== "object" || Array.isArray(p)) return;
      if (p.status === "completed" || p.status === "in_progress") {
        modulesHistory.push({
          id: text(p.id, text(p.module?.id, "learning-module")),
          title: text(p.module?.title, "Learning Module"),
          label: p.status === "completed" ? "Module Completed" : "Module In Progress",
          score: null,
          scoreFormatted: p.status === "completed" ? "Completed" : "In Progress",
          dateFormatted: "Current Path",
        });
      }
    });
  }

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
    totalCompetencies: competencyRows.length,
    masteryPercent,
    competencies: competencyRows,
    recommendedAction: nextAction,
    history: {
      assessments: assessmentsHistory,
      modules: modulesHistory,
      activities: activitiesHistory,
    },
    hasData: rawDiagnostic !== null || competencyRows.length > 0 || rawActivities.length > 0,
  };
}
