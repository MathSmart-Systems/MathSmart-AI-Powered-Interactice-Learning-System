import { DEFAULT_PAGE_SIZE, STATUS_LABELS } from "../constants";

import { listCompetencies, listModules } from "../services/learning-modules-api";

import { LearningModulesClient } from "./LearningModulesClient";
import { LearningModulesServiceError } from "./LearningModulesStates";
import { formatUpdated } from "../utils/format.js";

const MAX_SEARCH_LENGTH = 120;

function parsePage(value) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(page) ? 1 : Math.max(page, 1);
}

function toCompetency(row) {
  return {
    id: typeof row?.competency_id === "string" ? row.competency_id : null,
    code: typeof row?.code === "string" ? row.code : null,
    name: typeof row?.name === "string" ? row.name : null,
  };
}

/** "M6NS-Ia-2 — Numbers and number sense", with a safe fallback. */
function competencyLabel(competencyByCode, competencyId) {
  const competency = competencyByCode.get(competencyId) ?? null;
  const prefix = competency ? competency.code : null;
  const name = competency ? competency.name : null;

  if (prefix && name) {
    return `${prefix} — ${name}`;
  }
  if (name) {
    return name;
  }
  if (prefix) {
    return prefix;
  }
  return null;
}

/**
 * Reads the module library and hands the result to the interactive shell. Only
 * decisions belong here: which page, which search, which state. The shell
 * decides how the list looks; nothing in this file decides how content is
 * authored or graded.
 */
export async function LearningModulesView({ search: searchParam, page: pageParam }) {
  const search = typeof searchParam === "string" ? searchParam.slice(0, MAX_SEARCH_LENGTH).trim() : "";
  const requestedPage = parsePage(pageParam);

  const [modulesResult, competenciesResult] = await Promise.all([
    listModules({ search, page: requestedPage }),
    listCompetencies(),
  ]);

  if (!modulesResult.ok) {
    return <LearningModulesServiceError message={modulesResult.message ?? undefined} />;
  }

  const totalItems = typeof modulesResult.meta?.total_items === "number" ? modulesResult.meta.total_items : 0;
  const totalPages = typeof modulesResult.meta?.total_pages === "number" ? modulesResult.meta.total_pages : 1;
  const page = Math.min(requestedPage, Math.max(totalPages, 1));

  // A degraded competency read never sinks the list: rows fall back to a
  // missing badge and the author dialog reports that no competency is
  // available, which validation then refuses. Teachers can still browse.
  const competencyByCode = new Map();
  const competencyOptions = [];

  if (competenciesResult.ok) {
    for (const row of Array.isArray(competenciesResult.items) ? competenciesResult.items : []) {
      const entry = toCompetency(row);
      if (entry.id && entry.id !== "") {
        competencyByCode.set(entry.id, entry);
        competencyOptions.push({ id: entry.id, label: competencyLabel(competencyByCode, entry.id) });
      }
    }
  }

  competencyOptions.sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  const items = Array.isArray(modulesResult.items)
    ? modulesResult.items.map((row) => toModuleRow(row, competencyByCode))
    : [];

  return (
    <LearningModulesClient
      items={items}
      totalItems={totalItems}
      totalPages={totalPages}
      page={page}
      pageSize={DEFAULT_PAGE_SIZE}
      search={search}
      competencies={competencyOptions}
    />
  );
}

function toModuleRow(row, competencyByCode) {
  const competencyId = typeof row?.competency_id === "string" ? row.competency_id : null;
  const rules = Array.isArray(row?.rules) ? row.rules : [];
  const workedExamples = Array.isArray(row?.worked_examples) ? row.worked_examples : [];
  const status = typeof row?.status === "string" && STATUS_LABELS[row.status] ? row.status : "draft";

  return {
    id: typeof row?.module_id === "string" ? row.module_id : String(row?.module_id ?? ""),
    competencyId,
    title: typeof row?.title === "string" && row.title ? row.title : "Untitled module",
    estimatedMinutes: typeof row?.estimated_minutes === "number" ? row.estimated_minutes : null,
    orderIndex: typeof row?.order_index === "number" ? row.order_index : null,
    learningObjective: typeof row?.learning_objective === "string" ? row.learning_objective : "",
    shortExplanation: typeof row?.short_explanation === "string" ? row.short_explanation : "",
    rules,
    workedExamples,
    status,
    version: typeof row?.version === "number" ? row.version : null,
    statusLabel: STATUS_LABELS[row?.status] ?? "Draft",
    competency: competencyLabel(competencyByCode, competencyId),
    rulesCount: rules.length,
    workedExamplesCount: workedExamples.length,
    updatedLabel: formatUpdated(row?.updated_at),
  };
}