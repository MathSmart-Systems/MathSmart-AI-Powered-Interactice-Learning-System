import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COMPETENCY_PAGE_SIZE,
  readAllCompetencies,
} from "../services/competency-pagination.js";

describe("readAllCompetencies", () => {
  it("uses the supported page size and combines every reported page", async () => {
    const calls = [];
    const result = await readAllCompetencies(async (page, pageSize) => {
      calls.push({ page, pageSize });
      return {
        ok: true,
        data: [{ competency_id: `competency-${page}` }],
        meta: { total_pages: 3 },
      };
    });

    assert.equal(COMPETENCY_PAGE_SIZE, 100);
    assert.deepEqual(calls, [
      { page: 1, pageSize: 100 },
      { page: 2, pageSize: 100 },
      { page: 3, pageSize: 100 },
    ]);
    assert.deepEqual(
      result.items.map((item) => item.competency_id),
      ["competency-1", "competency-2", "competency-3"],
    );
  });

  it("returns a later page failure unchanged", async () => {
    const failure = { ok: false, status: 503, message: "Try again later." };
    const result = await readAllCompetencies(async (page) => {
      if (page === 2) return failure;
      return { ok: true, data: [], meta: { total_pages: 2 } };
    });

    assert.equal(result, failure);
  });

  it("fails closed when pagination metadata is invalid", async () => {
    const result = await readAllCompetencies(async () => ({
      ok: true,
      data: [],
      meta: { total_pages: 101 },
    }));

    assert.deepEqual(result, { ok: false, status: null });
  });
});
