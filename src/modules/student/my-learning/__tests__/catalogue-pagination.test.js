import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readCataloguePages } from "../services/catalogue-pagination.js";

describe("readCataloguePages", () => {
  it("reads every page in bounded concurrent batches", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const requestedPages = [];

    const result = await readCataloguePages(
      { ok: true, data: [{ id: 1 }], meta: { total_pages: 13 } },
      async (page) => {
        requestedPages.push(page);
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        await new Promise((resolve) => setImmediate(resolve));
        activeRequests -= 1;
        return { ok: true, data: [{ id: page }] };
      },
    );

    assert.equal(result.ok, true);
    assert.deepEqual(requestedPages, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    assert.equal(maximumActiveRequests, 5);
    assert.equal(result.pages.length, 13);
  });

  it("rejects an invalid or excessive page count before requesting more pages", async () => {
    for (const totalPages of ["2", -1, 1.5, 101, Number.POSITIVE_INFINITY]) {
      let requestCount = 0;
      const result = await readCataloguePages(
        { ok: true, data: [], meta: { total_pages: totalPages } },
        async () => {
          requestCount += 1;
          return { ok: true, data: [] };
        },
      );

      assert.equal(result.ok, false);
      assert.equal(requestCount, 0);
    }
  });

  it("stops before the next batch when one page fails", async () => {
    const requestedPages = [];
    const result = await readCataloguePages(
      { ok: true, data: [], meta: { total_pages: 9 } },
      async (page) => {
        requestedPages.push(page);
        return { ok: page !== 4, data: [] };
      },
    );

    assert.equal(result.ok, false);
    assert.deepEqual(requestedPages, [2, 3, 4, 5, 6]);
  });
});
