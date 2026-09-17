export const COMPETENCY_PAGE_SIZE = 100;

const MAX_COMPETENCY_PAGES = 100;

function competencyPageCount(value) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_COMPETENCY_PAGES
  ) {
    return null;
  }

  return Math.max(1, value);
}

/** Loads the complete bounded competency collection one supported page at a time. */
export async function readAllCompetencies(readPage) {
  const firstResult = await readPage(1, COMPETENCY_PAGE_SIZE);

  if (!firstResult.ok) {
    return firstResult;
  }

  const totalPages = competencyPageCount(firstResult.meta?.total_pages ?? 1);

  if (totalPages === null) {
    return { ok: false, status: null };
  }

  const items = Array.isArray(firstResult.data) ? [...firstResult.data] : [];

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await readPage(page, COMPETENCY_PAGE_SIZE);

    if (!result.ok) {
      return result;
    }

    if (Array.isArray(result.data)) {
      items.push(...result.data);
    }
  }

  return { ...firstResult, data: items, items };
}
