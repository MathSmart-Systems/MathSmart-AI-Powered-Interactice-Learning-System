import { expect, test } from "@playwright/test";

import { isLoopbackUrl, mutationTargets } from "./environment.js";

/**
 * The guard that decides whether a browser test may create rows.
 *
 * Tested on its own, because everything it protects depends on it being right
 * and nothing else would notice if it quietly started returning true. A suite
 * that writes to a hosted project leaves rows behind in real school data, and
 * the only signal that it happened would be the data itself.
 */
test.describe("the mutation guard", () => {
  test("recognises every spelling of this machine", () => {
    for (const address of [
      "http://localhost:3000",
      "http://127.0.0.1:54321",
      "http://[::1]:8000/api/v1",
      "http://0.0.0.0:3100",
      "https://localhost:3000",
    ]) {
      expect(isLoopbackUrl(address), address).toBe(true);
    }
  });

  test("refuses anything that is not this machine", () => {
    for (const address of [
      "https://example.supabase.co",
      "https://api.mathsmart.test/api/v1",
      "http://localhost.attacker.example",
      "http://127.0.0.1.attacker.example",
      "https://10.0.0.5",
      "https://192.168.1.10",
    ]) {
      expect(isLoopbackUrl(address), address).toBe(false);
    }
  });

  test("fails closed on an address it cannot read", () => {
    // Not local is the only safe answer to "where would this write?" when the
    // answer is unknown.
    for (const address of ["", null, undefined, "not a url", "localhost:3000", 3000]) {
      expect(isLoopbackUrl(address), String(address)).toBe(false);
    }
  });

  test("checks the frontend, the API and Supabase, not one of them", () => {
    // The frontend can be served from localhost while it talks to a hosted
    // database — which is the shape the repository's own .env has. Checking
    // the Supabase URL alone would have called that arrangement safe.
    const names = mutationTargets().map((target) => target.name);

    expect(names).toEqual(["frontend", "API", "Supabase"]);
  });
});
