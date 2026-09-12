import { DIFFICULTY_LABELS, DEFAULT_PAGE_SIZE, QUESTION_TYPE_LABELS, STATUS_LABELS } from "../constants";

import { listCompetencies, listQuestions } from "../services/question-bank-api";

import { QuestionBankClient } from "./QuestionBankClient";
import { QuestionBankServiceError } from "./QuestionBankStates";
import { formatUpdated } from "../utils/format.js";

const MAX_SEARCH_LENGTH = 100;

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
 * Reads the bank and hands the result to the interactive shell. Only decisions
 * belong here: which page, which search, which state. The shell decides how the
 * list looks; nothing in this file decides authoring or grading.
 */
export async function QuestionBankView({ search: searchParam, page: pageParam }) {
  const search = typeof searchParam === "string" ? searchParam.slice(0, MAX_SEARCH_LENGTH).trim() : "";
  const requestedPage = parsePage(pageParam);

  const [questionsResult, competenciesResult] = await Promise.all([
    listQuestions({ search, page: requestedPage }),
    listCompetencies(),
  ]);

  if (!questionsResult.ok) {
    return (
      <QuestionBankServiceError message={questionsResult.message ?? undefined} />
    );
  }

  const totalItems = typeof questionsResult.meta?.total_items === "number" ? questionsResult.meta.total_items : 0;
  const totalPages = typeof questionsResult.meta?.total_pages === "number" ? questionsResult.meta.total_pages : 1;
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

  const items = Array.isArray(questionsResult.items)
    ? questionsResult.items.map((row) => toQuestionRow(row, competencyByCode))
    : [];

  return (
    <QuestionBankClient
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

function toQuestionRow(row, competencyByCode) {
  const competencyId = typeof row?.competency_id === "string" ? row.competency_id : null;
  const choiceCount = Array.isArray(row?.choices) ? row.choices.length : null;

  return {
    id: typeof row?.question_id === "string" ? row.question_id : String(row?.question_id ?? ""),
    prompt: typeof row?.prompt === "string" && row.prompt ? row.prompt : "Untitled question",
    competencyId,
    questionType: typeof row?.question_type === "string" ? row.question_type : "multiple_choice",
    difficulty: typeof row?.difficulty === "string" ? row.difficulty : null,
    status: typeof row?.status === "string" && STATUS_LABELS[row.status] ? row.status : "draft",
    choices: Array.isArray(row?.choices) ? row.choices.map((choice) => String(choice)) : [],
    visualAid: typeof row?.visual_aid_description === "string" ? row.visual_aid_description : null,
    version: typeof row?.version === "number" ? row.version : null,

    statusLabel: STATUS_LABELS[row?.status] ?? "Draft",
    typeLabel: QUESTION_TYPE_LABELS[row?.question_type] ?? "Question",
    difficultyLabel: DIFFICULTY_LABELS[row?.difficulty] ?? "Difficulty",
    competency: competencyLabel(competencyByCode, competencyId),
    options: row?.question_type === "multiple_choice" ? choiceCount : null,
    updatedLabel: formatUpdated(row?.updated_at),
  };
}