import { redirect } from "next/navigation";

import {
  DIFFICULTY_LABELS,
  DIFFICULTY_OPTIONS,
  DEFAULT_PAGE_SIZE,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  STATUS_LABELS,
} from "../constants";

import { listCompetencies, listQuestions } from "../services/question-bank-api";

import { QuestionBankClient } from "./QuestionBankClient";
import { QuestionBankServiceError } from "./QuestionBankStates";
import { formatUpdated } from "../utils/format.js";
import { questionBankUrl } from "../utils/urls.js";

const MAX_SEARCH_LENGTH = 100;

/** Normalises an untrusted page query to a positive integer. */
function parsePage(value) {
  const page = Number.parseInt(value ?? "1", 10);
  return Number.isNaN(page) ? 1 : Math.max(page, 1);
}

/** The publication state the list is scoped to. Unknown values fall back. */
function parseStatus(value) {
  return typeof value === "string" && STATUS_LABELS[value] ? value : "published";
}

/** A filter value is kept only when it is one the API will accept. */
function parseChoice(value, allowed) {
  return typeof value === "string" && allowed.has(value) ? value : "";
}

/** A competency filter is an identifier or nothing; the API validates it. */
function parseId(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

/** Selects the safe competency fields used by the authoring interface. */
function toCompetency(row) {
  return {
    id: typeof row?.competency_id === "string" ? row.competency_id : null,
    code: typeof row?.code === "string" ? row.code : null,
    name: typeof row?.name === "string" ? row.name : null,
    status: typeof row?.status === "string" ? row.status : null,
    // Shown on a row so a teacher can see which strand a question belongs to.
    // It is read here and never offered as a choice anywhere: a strand written
    // under "Other" belongs to its own competency and must not become an
    // option every later competency can be filed under.
    domain: typeof row?.domain === "string" ? row.domain : null,
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
 *
 * Every filter reaches the API. The bank used to fetch one page and sort it
 * into publication tabs in the browser, which made the tab counts describe that
 * page rather than the bank, let a status holding hundreds of rows look empty,
 * and left the caption under the list counting every status while the rows
 * above it showed one.
 */
export async function QuestionBankView({
  search: searchParam,
  status: statusParam,
  competency_id: competencyParam,
  type: typeParam,
  difficulty: difficultyParam,
  page: pageParam,
}) {
  const search =
    typeof searchParam === "string" ? searchParam.slice(0, MAX_SEARCH_LENGTH).trim() : "";
  const status = parseStatus(statusParam);
  const competencyId = parseId(competencyParam);
  const questionType = parseChoice(
    typeParam,
    new Set(QUESTION_TYPES.map((option) => option.value)),
  );
  const difficulty = parseChoice(
    difficultyParam,
    new Set(DIFFICULTY_OPTIONS.map((option) => option.value)),
  );
  const requestedPage = parsePage(pageParam);

  const [questionsResult, competenciesResult] = await Promise.all([
    listQuestions({
      search,
      status,
      competencyId,
      questionType,
      difficulty,
      page: requestedPage,
    }),
    listCompetencies(),
  ]);

  if (!questionsResult.ok) {
    return <QuestionBankServiceError message={questionsResult.message ?? undefined} />;
  }

  const totalItems =
    typeof questionsResult.meta?.total_items === "number" ? questionsResult.meta.total_items : 0;
  const totalPages =
    typeof questionsResult.meta?.total_pages === "number" ? questionsResult.meta.total_pages : 1;
  const page = Math.min(requestedPage, Math.max(totalPages, 1));

  // A page beyond the end was answered with the empty page the API returned,
  // under a page number taken from the clamp — so an out-of-range address read
  // as an empty bank. Land on the last real page instead.
  if (page !== requestedPage) {
    redirect(
      questionBankUrl({ search, status, competencyId, questionType, difficulty, page }),
    );
  }

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
        competencyOptions.push({
          id: entry.id,
          label: competencyLabel(competencyByCode, entry.id),
          status: entry.status,
        });
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
      status={status}
      competencyId={competencyId}
      questionType={questionType}
      difficulty={difficulty}
      competencies={competencyOptions}
      competenciesAvailable={competenciesResult.ok}
    />
  );
}

/** Normalises an API question row for the interactive list. */
function toQuestionRow(row, competencyByCode) {
  const competencyId = typeof row?.competency_id === "string" ? row.competency_id : null;
  const choiceCount = Array.isArray(row?.choices) ? row.choices.length : null;
  const competency = competencyByCode.get(competencyId) ?? null;

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
    // Read-only, and never promoted into a filter or a dropdown.
    competencyStrand: competency?.domain ?? null,
    competencyStatus: competency?.status ?? null,
    options: row?.question_type === "multiple_choice" ? choiceCount : null,
    updatedLabel: formatUpdated(row?.updated_at),
  };
}
