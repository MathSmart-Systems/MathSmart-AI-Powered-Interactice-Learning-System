/**
 * The one place a Question Bank list URL is built.
 *
 * Every filter lives in the address, which is what makes the bank shareable,
 * bookmarkable and — the part that matters most — honest: the server filters
 * before it takes a page, so the count under the list describes the rows above
 * it. A tab held in component state could only ever sort out the ten rows the
 * page happened to carry.
 */

const QUESTION_BANK_PATH = "/teacher/question-bank";

/** Builds a list URL, dropping only the filters that are not set. */
export function questionBankUrl({
  search = "",
  status = "published",
  competencyId = "",
  questionType = "",
  difficulty = "",
  page = 1,
} = {}) {
  const query = new URLSearchParams();

  if (search) {
    query.set("search", search);
  }
  query.set("status", status);
  if (competencyId) {
    query.set("competency_id", competencyId);
  }
  if (questionType) {
    query.set("type", questionType);
  }
  if (difficulty) {
    query.set("difficulty", difficulty);
  }
  query.set("page", String(page));

  return `${QUESTION_BANK_PATH}?${query.toString()}`;
}

export { QUESTION_BANK_PATH };
