const MAX_CATALOGUE_PAGES = 100;
const CATALOGUE_REQUEST_BATCH_SIZE = 5;

function cataloguePageCount(value) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_CATALOGUE_PAGES
  ) {
    return null;
  }

  return Math.max(1, value);
}

/**
 * Reads every permitted catalogue page without trusting pagination metadata to
 * create an unbounded Promise.all burst.
 */
export async function readCataloguePages(firstPage, readPage) {
  const totalPages = cataloguePageCount(firstPage.meta?.total_pages ?? 1);

  if (totalPages === null) {
    return { ok: false, pages: [] };
  }

  const pages = [firstPage];

  for (let first = 2; first <= totalPages; first += CATALOGUE_REQUEST_BATCH_SIZE) {
    const last = Math.min(totalPages, first + CATALOGUE_REQUEST_BATCH_SIZE - 1);
    const pageNumbers = Array.from({ length: last - first + 1 }, (_, index) => first + index);
    const batch = await Promise.all(pageNumbers.map((page) => readPage(page)));

    if (batch.some((page) => !page.ok)) {
      return { ok: false, pages: [] };
    }

    pages.push(...batch);
  }

  return { ok: true, pages };
}
