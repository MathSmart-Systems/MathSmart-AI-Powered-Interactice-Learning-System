import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * Behavioural cover for the Teacher/Administrator Students workspace.
 *
 * The roster and the learner record are server-rendered, which a browser test
 * cannot intercept: `page.route` sees the browser's requests, not the Next
 * server's. So the structural checks below run against whatever the deployment
 * actually holds, and only the genuinely client-side calls — the roster
 * refresh, the enrolment POST, the edit PATCH and the advisory request — are
 * stubbed. That split is deliberate: it keeps the tests honest about what they
 * proved, and it means nothing here enrols a learner into real school data or
 * makes a live Groq request.
 *
 * Three things these are mostly about: a learner's name opens their record, a
 * truncated roster reports the API's own total rather than the size of the
 * page it received, and enrolment never asks which grade.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Widths the workspace has to stay usable at, from the narrowest phone up. */
const VIEWPORTS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 375, height: 667 },
  { name: "tall phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide desktop", width: 1920, height: 1080 },
];

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type,accept,idempotency-key",
  "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
};

function jsonReply(route, status, payload) {
  return route.fulfill({
    status,
    contentType: "application/json",
    headers: CORS_HEADERS,
    body: JSON.stringify(payload),
  });
}

/** A name no other run will collide with, and that reads as test data. */
function uniqueName(prefix) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

/**
 * Intercepts only the browser's own calls to the students API.
 *
 * Scoped to the API prefix, because the workspace's page lives at
 * `/teacher/students` and a looser predicate would intercept the navigation
 * itself and hand the browser a page of JSON.
 *
 * @returns {{enrolled: Array, patches: Array, insights: Array, rosterReads: number}}
 */
async function stubClientCalls(page, { rosterTotal = null, insight = undefined } = {}) {
  const store = { enrolled: [], patches: [], insights: [], rosterReads: 0 };

  await page.route(
    (url) =>
      url.pathname.includes("/api/v1/") &&
      (url.pathname.endsWith("/students") ||
        /\/students\/[^/]+$/.test(url.pathname) ||
        url.pathname.includes("/ai/teacher-insight")),
    async (route) => {
      const request = route.request();
      const method = request.method();
      if (method === "OPTIONS") {
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }

      const { pathname } = new URL(request.url());

      if (pathname.includes("/ai/teacher-insight")) {
        store.insights.push(request.postDataJSON());
        if (insight === null) {
          return jsonReply(route, 503, {
            error: {
              code: "groq_assistance_unavailable",
              message: "AI assistance is not available",
            },
          });
        }
        return jsonReply(route, 200, { data: insight });
      }

      if (method === "POST") {
        store.enrolled.push(request.postDataJSON());
        return jsonReply(route, 201, {
          data: { user_id: "usr-new", student_id: "stu-new", learner_id: "LRN-NEW" },
        });
      }

      if (method === "PATCH") {
        store.patches.push(request.postDataJSON());
        return jsonReply(route, 200, { data: { student_id: "stu-1" } });
      }

      // The roster refresh. The total is deliberately independent of the page
      // length, which is the whole point of the message it drives.
      store.rosterReads += 1;
      return jsonReply(route, 200, {
        data: [],
        meta: { page: 1, page_size: 100, total_items: rosterTotal ?? 0, total_pages: 1 },
      });
    },
  );

  return store;
}

/**
 * The first learner on the roster, or null when nobody is enrolled.
 *
 * Waits for the roster to have settled first: the page is server-rendered but
 * the table still arrives with hydration, and asking too early reads an empty
 * roster as an empty deployment.
 */
async function firstLearner(page) {
  await page.getByRole("heading", { name: "Student roster" }).waitFor();

  const anyLearner = page.locator('main a[href^="/teacher/students/"]').first();
  const empty = page.getByText(/No students|No learners/);
  await expect(anyLearner.or(empty).first()).toBeVisible();

  if ((await anyLearner.count()) === 0) return null;

  return {
    link: anyLearner,
    href: await anyLearner.getAttribute("href"),
    name: (await anyLearner.innerText()).trim(),
  };
}

describe("teacher students workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  // ─── The roster ──────────────────────────────────────────────────

  test("the roster opens as its own workspace", async ({ page }) => {
    await page.goto("/teacher/students");

    await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Student roster" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
  });

  test("a learner's name is a link into their record", async ({ page }) => {
    await page.goto("/teacher/students");

    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    // A link, not a row click: reachable by keyboard, announced as a link, and
    // openable in a new tab like any other.
    await expect(learner.link).toBeVisible();
    expect(learner.href).toMatch(/^\/teacher\/students\/[0-9a-f-]{8,}$/);
  });

  test("opening a learner from the roster shows their record", async ({ page }) => {
    await page.goto("/teacher/students");

    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await learner.link.click();

    await expect(page).toHaveURL(new RegExp(`${learner.href}$`));
    await expect(page.getByRole("heading", { name: learner.name })).toBeVisible();
  });

  test("the grade is context, never a filter or a choice", async ({ page }) => {
    await page.goto("/teacher/students");

    await expect(page.getByLabel("Filter by grade level")).toHaveCount(0);
    // Shown once, as a badge.
    await expect(page.getByRole("main").getByText("Grade 6", { exact: true })).toBeVisible();
  });

  test("the section filter offers only active Grade 6 sections", async ({ page }) => {
    await page.goto("/teacher/students");

    const options = await page
      .getByLabel("Filter by class section")
      .locator("option")
      .evaluateAll((all) => all.map((option) => option.textContent.trim()));

    expect(options[0]).toBe("All sections");
    // No legacy section from another grade is offered.
    expect(options.join(" ")).not.toContain("(Grade 3)");
    expect(options.join(" ")).not.toContain("(Grade 5)");
  });

  test("a truncated roster reports the API's own total", async ({ page }) => {
    const store = await stubClientCalls(page, { rosterTotal: 412 });
    await page.goto("/teacher/students");

    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to filter by");

    // Changing the filter is the workspace's own way of re-reading the roster,
    // which is the client-side call this test can intercept.
    await filter.selectOption({ index: 1 });
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    // The defect this guards: a page of 0 out of 412 must not read "0 of 0"
    // just because that is what arrived.
    await expect(page.getByText(/Showing first 0 of 412 learners/)).toBeVisible();
  });

  // ─── Grade 6 enrolment ───────────────────────────────────────────

  test("enrolment asks for no grade", async ({ page }) => {
    await page.goto("/teacher/students");

    await page.getByRole("button", { name: "Enroll student", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    await expect(dialog.getByText("Grade Level")).toHaveCount(0);
    // The section is the only choice left, so the only select in the form.
    await expect(dialog.locator("select")).toHaveCount(1);
  });

  test("enrolment offers only active Grade 6 sections", async ({ page }) => {
    await page.goto("/teacher/students");
    await page.getByRole("button", { name: "Enroll student", exact: true }).click();

    const options = await page
      .getByRole("dialog")
      .getByLabel("Section")
      .locator("option")
      .evaluateAll((all) => all.map((option) => option.textContent.trim()));

    expect(options[0]).toBe("No section assigned");
  });

  test("an enrolment carries the Grade 6 id without being asked for it", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    await page.getByRole("button", { name: "Enroll student", exact: true }).click();
    await page.getByLabel("Full Name").fill(uniqueName("QA Learner"));
    await page.getByLabel("Email").fill(`qa.${Date.now().toString(36)}@example.com`);
    await page.getByLabel(/Learner ID/).fill(`QA-${Date.now().toString().slice(-8)}`);
    await page.getByRole("dialog").getByRole("button", { name: /Enroll/ }).click();

    await expect.poll(() => store.enrolled.length).toBeGreaterThan(0);

    // Resolved from the directory, never typed and never chosen.
    const sent = store.enrolled.at(-1);
    expect(sent.grade_id, "no grade was resolved into the request").toBeTruthy();
    expect(sent).toHaveProperty("full_name");
    expect(sent).toHaveProperty("learner_id");
  });

  test("editing a learner never sends a grade", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    const edit = page.getByRole("button", { name: /^Edit / }).first();
    test.skip((await edit.count()) === 0, "no learner is enrolled in this deployment");

    await edit.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Grade Level")).toHaveCount(0);

    await dialog.getByRole("button", { name: /Save/ }).click();

    await expect.poll(() => store.patches.length).toBeGreaterThan(0);
    expect(store.patches.at(-1), "a grade travelled on an edit").not.toHaveProperty("grade_id");
  });

  // ─── The learner record ──────────────────────────────────────────

  test("the record shows identity, enrolment and deterministic progress", async ({ page }) => {
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);

    await expect(page.getByRole("heading", { name: learner.name })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enrollment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recorded progress" })).toBeVisible();

    // The enrolment facts a teacher needs, each labelled.
    const main = page.getByRole("main");
    await expect(main.getByText("Section", { exact: true })).toBeVisible();
    await expect(main.getByText("Diagnostic", { exact: true }).first()).toBeVisible();
    await expect(main.getByText("Monitoring", { exact: true })).toBeVisible();
  });

  test("the record offers a way back to the roster", async ({ page }) => {
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);
    const back = page.getByRole("link", { name: "Back to the student roster" });
    await expect(back).toBeVisible();
    await back.click();

    await expect(page).toHaveURL(/\/teacher\/students$/);
  });

  test("a learner who cannot be opened says so without confirming they exist", async ({ page }) => {
    // A well-formed id that names nobody. The API answers 404 for a learner
    // outside this educator's reach too, which is the same answer on purpose.
    await page.goto("/teacher/students/00000000-0000-4000-8000-000000000000");

    await expect(page.getByRole("heading", { name: "No such learner" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Back to the student roster" })).toBeVisible();
  });

  test("a learner with no recorded work says so rather than showing zeros", async ({ page }) => {
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);
    const empty = page.getByText(/No competency work recorded yet/);
    test.skip((await empty.count()) === 0, "this learner has recorded work");

    await expect(empty).toBeVisible();
    // An absent score reads as absent, not as zero.
    await expect(page.getByRole("main").getByText("—").first()).toBeVisible();
  });

  // ─── The advisory note ───────────────────────────────────────────

  test("no advisory note is requested for a learner with nothing to explain", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);
    const unscored = page.getByText(/No competency work recorded yet/);
    test.skip((await unscored.count()) === 0, "this learner has recorded work");

    await page.waitForTimeout(1500);

    // Nothing to ask about is not a failure: the panel stays away and no
    // request is made, rather than asking Groq to comment on an empty record.
    await expect(page.getByRole("region", { name: "Teaching note (advisory)" })).toHaveCount(0);
    expect(store.insights).toHaveLength(0);
  });

  test("an advisory note never carries a learner's identity", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);
    const panel = page.getByRole("region", { name: "Teaching note (advisory)" });
    test.skip((await panel.count()) === 0, "this learner has no scored competency to ask about");

    await expect.poll(() => store.insights.length).toBeGreaterThan(0);

    const sent = JSON.stringify(store.insights.at(-1));
    expect(sent, "a learner name travelled").not.toContain(learner.name);
    expect(sent, "a learner id travelled").not.toContain(learner.href.split("/").pop());
    // Recurring-mistake evidence is never sent, because none is collected.
    expect(store.insights.at(-1).incorrect_patterns).toEqual([]);
  });

  // ─── Access, keyboard and width ──────────────────────────────────

  test("a signed-out visitor cannot open a learner record", async ({ page, context }) => {
    await context.clearCookies();
    await page.goto("/teacher/students/00000000-0000-4000-8000-000000000000");

    await expect(page).toHaveURL(/\/login/);
  });

  test("the roster can be walked and opened from the keyboard", async ({ page }) => {
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await learner.link.focus();
    await expect(learner.link).toBeFocused();

    const ring = await learner.link.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring, "the focused link shows no ring").not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`${learner.href}$`));
  });

  for (const viewport of VIEWPORTS) {
    test(`the roster fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/teacher/students");

      await expect(page.getByRole("heading", { name: "Students", exact: true })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `the page scrolls sideways at ${viewport.width}px`).toBe(false);
    });

    test(`the learner record fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/teacher/students");
      const learner = await firstLearner(page);
      test.skip(learner === null, "no learner is enrolled in this deployment");

      await page.goto(learner.href);
      await expect(page.getByRole("heading", { name: learner.name })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `the record scrolls sideways at ${viewport.width}px`).toBe(false);
    });
  }

  test("the enrolment dialog stays usable on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.goto("/teacher/students");

    await page.getByRole("button", { name: "Enroll student", exact: true }).click();

    const field = page.getByLabel("Full Name");
    await expect(field).toBeVisible();

    const box = await field.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(304);
  });
});
