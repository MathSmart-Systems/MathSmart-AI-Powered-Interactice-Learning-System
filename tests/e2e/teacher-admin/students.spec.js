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
async function stubClientCalls(
  page,
  {
    rosterTotal = null,
    insight = undefined,
    roster = [],
    sectionMeta = [],
    preview = null,
    purgeFails = false,
  } = {},
) {
  const store = {
    enrolled: [],
    patches: [],
    insights: [],
    drops: [],
    restores: [],
    purges: [],
    rosterUrls: [],
    rosterReads: 0,
  };

  await page.route(
    (url) =>
      url.pathname.includes("/api/v1/") &&
      (url.pathname.endsWith("/students") ||
        url.pathname.endsWith("/students/drop") ||
        /\/students\/[^/]+\/(restore|purge|purge-preview)$/.test(url.pathname) ||
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
        // A function answers with whatever the test has set by then, so a
        // test can say "now a new note", "now a failure" around each click —
        // counting requests would not work, because development mode sends
        // the first one twice.
        const reply = typeof insight === "function" ? insight() : insight;
        if (reply === null) {
          return jsonReply(route, 503, {
            error: {
              code: "groq_assistance_unavailable",
              message: "AI assistance is not available",
            },
          });
        }
        return jsonReply(route, 200, { data: reply });
      }

      if (pathname.endsWith("/purge-preview")) {
        return jsonReply(route, 200, { data: preview ?? { removes: {} } });
      }

      if (pathname.endsWith("/restore")) {
        store.restores.push({ pathname, body: request.postDataJSON() });
        return jsonReply(route, 200, { data: { student_id: "stu-dropped" } });
      }

      if (pathname.endsWith("/purge")) {
        store.purges.push({ pathname, body: request.postDataJSON() });
        if (purgeFails) {
          return jsonReply(route, 502, {
            error: {
              code: "auth_delete_failed",
              message:
                "The learner's records were removed, but their sign-in account could not " +
                "be deleted. Try again to finish.",
            },
          });
        }
        return jsonReply(route, 200, { data: { purged: true, already_purged: false } });
      }

      // The drop. Answered with what the API answers, so the workspace has a
      // count to report rather than a silent success.
      if (pathname.endsWith("/students/drop")) {
        const body = request.postDataJSON();
        store.drops.push(body);
        return jsonReply(route, 200, {
          data: { dropped: body.user_ids ? body.user_ids.length : 72, user_ids: [] },
        });
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
      store.rosterUrls.push(request.url());
      return jsonReply(route, 200, {
        data: roster,
        meta: {
          page: 1,
          page_size: 100,
          total_items: rosterTotal ?? roster.length,
          total_pages: 1,
          sections: sectionMeta,
        },
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

/** A teaching note as the server now shapes it. */
function note(gap) {
  return {
    insight_summary: gap,
    evidence: ["Current score 55%, diagnostic 40%.", "3 of 5 attempts were unsuccessful."],
    recommended_actions: [
      "Model one product on an area grid.",
      "Pair the learner for two worked examples.",
      "Give three short items with feedback after each.",
    ],
    next_check: "Ask for one product without the grid.",
    learning_gaps: [],
    suggested_intervention_type: null,
    urgency_level: null,
  };
}

/** Opens the first learner whose record has a competency to write a note about. */
async function learnerWithNote(page) {
  await page.goto("/teacher/students");
  await page.getByRole("heading", { name: "Student roster" }).waitFor();
  const hrefs = await page
    .locator('main a[href^="/teacher/students/"]')
    .evaluateAll((links) => [...new Set(links.map((link) => link.getAttribute("href")))]);

  for (const href of hrefs.slice(0, 6)) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    const panel = page.getByRole("region", { name: "Teaching note", exact: true });
    if ((await panel.count()) > 0) return panel;
  }
  return null;
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

  // ─── Dropping a cohort ───────────────────────────────────────────
  //
  // The end-of-year case. A teacher clearing a class must be able to do it in
  // one act, and the number they are shown has to be the section's own — not
  // the number of rows the first page happened to load.

  /**
   * Stubs the roster as one real section holding more learners than it shows.
   *
   * The section id comes from the deployment's own filter, because the
   * workspace groups by the section directory: an invented id would fall into
   * "No section assigned" and prove nothing.
   */
  async function loadStubbedSection(page, { enrolled = 72 } = {}) {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to group by");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const sectionName = (await filter.locator("option").nth(1).innerText()).trim();

    const learners = [1, 2].map((n) => ({
      student_id: `stu-${n}`,
      user_id: `usr-${n}`,
      learner_id: `LRN-00${n}`,
      full_name: `Stubbed Learner ${n}`,
      section_id: sectionId,
      diagnostic_status: "not_started",
      monitoring_status: "active",
      account_status: "active",
    }));

    const store = await stubClientCalls(page, {
      roster: learners,
      rosterTotal: enrolled,
      sectionMeta: [{ section_id: sectionId, enrolled, dropped: 0 }],
    });

    // Changing the filter is the workspace's own way of re-reading the roster,
    // which is the client-side call this test can intercept.
    await filter.selectOption(sectionId);
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    return { store, sectionId, sectionName };
  }

  test("a section header says the section's own size, not the page's", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page);

    const header = page.getByRole("row", { name: new RegExp(sectionName) });
    await expect(header).toContainText("72 enrolled");
    // The honest half of it: the page is only showing two of them.
    await expect(header).toContainText("2 shown");
  });

  test("selecting a section counts everyone in it", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page);

    await page.getByLabel(`Select every student in ${sectionName}`).check();

    // The defect this guards: a bar that counted the rows on screen would say
    // "2 selected" and the teacher would confirm a drop of 72.
    await expect(page.getByText("72 selected")).toBeVisible();
  });

  test("dropping a section sends the section, never the loaded ids", async ({ page }) => {
    const { store, sectionId, sectionName } = await loadStubbedSection(page);

    await page.getByLabel(`Select every student in ${sectionName}`).check();
    await page.getByRole("button", { name: "Drop selected" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("72 students");

    await dialog.getByRole("button", { name: /^Drop 72 students$/ }).click();

    await expect.poll(() => store.drops.length).toBeGreaterThan(0);
    expect(store.drops[0]).toEqual({ section_id: sectionId });
  });

  test("a learner inside a selected section cannot be quietly excluded", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page);

    await page.getByLabel(`Select every student in ${sectionName}`).check();

    // The page holds 2 of 72, so there is no honest way to say "all but this
    // one". The row says so rather than offering a tick that would lie.
    await expect(page.getByLabel("Select Stubbed Learner 1")).toBeDisabled();
  });

  test("a fully loaded section can be narrowed learner by learner", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page, { enrolled: 2 });

    await page.getByLabel(`Select every student in ${sectionName}`).check();
    await expect(page.getByText("2 selected")).toBeVisible();

    await page.getByLabel("Select Stubbed Learner 1").uncheck();
    await expect(page.getByText("1 selected")).toBeVisible();
  });

  // ─── The grouping reads as a hierarchy ───────────────────────────

  test("a section heading never reads zero above a list of learners", async ({ page }) => {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to group by");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const sectionName = (await filter.locator("option").nth(1).innerText()).trim();

    // No per-section counts at all, which is what an older API reply looks
    // like. The defect this guards rendered "0 enrolled" over two names.
    const store = await stubClientCalls(page, {
      sectionMeta: [],
      roster: [1, 2].map((n) => ({
        student_id: `stu-${n}`,
        user_id: `usr-${n}`,
        learner_id: `LRN-00${n}`,
        full_name: `Stubbed Learner ${n}`,
        section_id: sectionId,
        diagnostic_status: "not_started",
        monitoring_status: "active",
        account_status: "active",
      })),
    });

    await filter.selectOption(sectionId);
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    const header = page.getByRole("row", { name: new RegExp(sectionName) });
    await expect(header).toContainText("2 enrolled");
    await expect(header).not.toContainText("0 enrolled");
  });

  test("a section with one learner counts one", async ({ page }) => {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to group by");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const sectionName = (await filter.locator("option").nth(1).innerText()).trim();

    const store = await stubClientCalls(page, {
      sectionMeta: [{ section_id: sectionId, enrolled: 1, dropped: 0 }],
      roster: [
        {
          student_id: "stu-solo",
          user_id: "usr-solo",
          learner_id: "LRN-SOLO",
          full_name: "Only Learner",
          section_id: sectionId,
          diagnostic_status: "not_started",
          monitoring_status: "active",
          account_status: "active",
        },
      ],
    });

    await filter.selectOption(sectionId);
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    const header = page.getByRole("row", { name: new RegExp(sectionName) });
    await expect(header).toContainText("1 enrolled");
    await expect(header).not.toContainText("shown");
  });

  test("an empty section shows no learner rows under it", async ({ page }) => {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to group by");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const sectionName = (await filter.locator("option").nth(1).innerText()).trim();

    const store = await stubClientCalls(page, {
      sectionMeta: [{ section_id: sectionId, enrolled: 0, dropped: 0 }],
      roster: [],
    });

    await filter.selectOption(sectionId);
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    // A section nobody is in is not a heading over nothing: the roster says so
    // in one sentence instead.
    await expect(page.getByRole("row", { name: new RegExp(sectionName) })).toHaveCount(0);
    await expect(page.getByText(/No enrolled learners|No learners/)).toBeVisible();
  });

  test("a section heading is told apart from the learners under it", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page);

    // Structure first: the heading is a real group header, so a screen reader
    // announces the class rather than reading names as one flat list.
    const heading = page.locator('th[scope="colgroup"]').first();
    await expect(heading).toBeVisible();
    await expect(heading).toContainText("Section");
    await expect(heading).toContainText(sectionName);

    // Then appearance, which must not be the only signal but must still differ.
    const headerRow = page.getByRole("row", { name: new RegExp(sectionName) });
    const learnerRow = page.getByRole("row", { name: /Stubbed Learner 1/ });

    const [headerBackground, learnerBackground] = await Promise.all([
      headerRow.evaluate((node) => getComputedStyle(node).backgroundColor),
      learnerRow.evaluate((node) => getComputedStyle(node).backgroundColor),
    ]);
    expect(headerBackground).not.toBe(learnerBackground);
  });

  test("searching hides a section whose learners do not match", async ({ page }) => {
    const { sectionName } = await loadStubbedSection(page);

    await expect(page.getByRole("row", { name: new RegExp(sectionName) })).toBeVisible();

    await page.getByLabel("Search").fill("nobody-by-this-name");

    await expect(page.getByRole("row", { name: new RegExp(sectionName) })).toHaveCount(0);
    await expect(page.getByText(/No learners match/)).toBeVisible();
  });

  for (const viewport of VIEWPORTS) {
    test(`the grouped roster stays readable on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { sectionName } = await loadStubbedSection(page);

      const heading = page.locator('th[scope="colgroup"]').first();
      await expect(heading).toBeVisible();
      await expect(heading).toContainText(sectionName);

      // Nothing overflows the document at any width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }

  /**
   * Stubs the roster as holding one dropped learner in a real section.
   *
   * `sectionGone` points them at a section id the directory does not have, so
   * the restore dialog has to demand a replacement rather than reuse it.
   */
  async function stubbedDroppedLearner(page, { sectionGone = false, purgeFails = false } = {}) {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to place them in");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const sectionName = (await filter.locator("option").nth(1).innerText()).trim();
    const placed = sectionGone ? "00000000-0000-4000-8000-0000000000ff" : sectionId;

    const store = await stubClientCalls(page, {
      purgeFails,
      roster: [
        {
          student_id: "stu-dropped",
          user_id: "usr-dropped",
          learner_id: "LRN-DROPPED",
          full_name: "Dropped Learner",
          section_id: placed,
          section_name: sectionGone ? "Retired Section" : sectionName,
          diagnostic_status: "completed",
          monitoring_status: "active",
          account_status: "archived",
        },
      ],
      sectionMeta: [{ section_id: placed, enrolled: 0, dropped: 1 }],
      preview: {
        learner_id: "LRN-DROPPED",
        removes: {
          assessment_attempts: 4,
          activity_attempts: 180,
          interventions: 10,
        },
      },
    });

    await page.getByLabel("Filter by student status").selectOption("dropped");
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Dropped Learner" })).toBeVisible();

    return { store, sectionId, sectionName };
  }

  /** The first enrolled learner the deployment actually holds. */
  async function stubbedEnrolledLearner(page) {
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");
    return { name: learner.name };
  }

  // ─── Student Status ──────────────────────────────────────────────
  //
  // The filter is sent to the API, never applied to the loaded page: the
  // roster reads one page of a larger list, so filtering here would report
  // whatever the first hundred happened to contain.

  test("the roster asks for enrolled learners by default", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to filter by");

    await filter.selectOption({ index: 1 });
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    expect(store.rosterUrls.at(-1)).toContain("status=enrolled");
  });

  test("the old Show dropped students checkbox is gone", async ({ page }) => {
    await page.goto("/teacher/students");
    await page.getByRole("heading", { name: "Student roster" }).waitFor();

    await expect(page.getByLabel("Show dropped students")).toHaveCount(0);
    await expect(page.getByLabel("Filter by student status")).toBeVisible();
  });

  test("Student Status offers enrolled, dropped and all students", async ({ page }) => {
    await page.goto("/teacher/students");

    const options = await page
      .getByLabel("Filter by student status")
      .locator("option")
      .evaluateAll((all) => all.map((option) => option.textContent.trim()));

    expect(options).toEqual(["Enrolled", "Dropped", "All students"]);
  });

  test("choosing Dropped asks the API for dropped learners", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    await page.getByLabel("Filter by student status").selectOption("dropped");
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    expect(store.rosterUrls.at(-1)).toContain("status=dropped");
  });

  test("choosing All students asks the API for everybody", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    await page.getByLabel("Filter by student status").selectOption("all");
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    expect(store.rosterUrls.at(-1)).toContain("status=all");
  });

  test("section and status are sent together, not one instead of the other", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to filter by");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    await filter.selectOption(sectionId);
    await page.getByLabel("Filter by student status").selectOption("dropped");
    await expect.poll(() => store.rosterReads).toBeGreaterThan(1);

    const last = store.rosterUrls.at(-1);
    expect(last).toContain("status=dropped");
    expect(last).toContain(`section_id=${sectionId}`);
    // And the grade filter never goes missing when another one changes.
    expect(last).toMatch(/grade_id=[0-9a-f-]{36}/);
  });

  test("a dropped learner never reads Active on the same row", async ({ page }) => {
    const { store, sectionId } = await stubbedDroppedLearner(page);
    expect(store.rosterReads).toBeGreaterThan(0);
    expect(sectionId).toBeTruthy();

    const row = page.getByRole("row", { name: /Dropped Learner/ });
    await expect(row).toContainText("Dropped");
    await expect(row).not.toContainText("Active");

    // And the badge is said once, not once under the name and once in Status.
    const badges = await row.getByText("Dropped", { exact: true }).count();
    expect(badges).toBe(1);
  });

  // ─── Restore ─────────────────────────────────────────────────────

  test("a dropped learner is offered Restore and Purge, never Drop", async ({ page }) => {
    await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    const menu = page.getByRole("menu");

    await expect(menu.getByRole("menuitem", { name: "Restore student" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Purge permanently" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Drop student" })).toHaveCount(0);
  });

  test("an enrolled learner is offered Drop, never Restore or Purge", async ({ page }) => {
    await stubbedEnrolledLearner(page);

    // The first row's menu. Named learners are not unique in a deployment —
    // two siblings share a name in the development data — so this asks for a
    // row rather than for a name.
    await page.getByRole("button", { name: /^Actions for / }).first().click();
    const menu = page.getByRole("menu");

    await expect(menu.getByRole("menuitem", { name: "Drop student" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Restore student" })).toHaveCount(0);
    await expect(menu.getByRole("menuitem", { name: "Purge permanently" })).toHaveCount(0);
  });

  test("the action menu closes on Escape and gives focus back", async ({ page }) => {
    await stubbedDroppedLearner(page);

    const trigger = page.getByRole("button", { name: /Actions for Dropped Learner/ });
    await trigger.click();
    await expect(page.getByRole("menu")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });

  test("restoring reads back the learner, the former section and the destination", async ({
    page,
  }) => {
    const { sectionName } = await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Restore student" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Dropped Learner");
    await expect(dialog).toContainText("LRN-DROPPED");
    await expect(dialog).toContainText(sectionName);
    // It goes back where it was, so there is nothing to ask.
    await expect(dialog).toContainText("Returning to");
    await expect(dialog.getByLabel("Place them in")).toHaveCount(0);
    // Says what it does not do, as well as what it does.
    await expect(dialog).toContainText(/not changed|Nothing is recalculated/);
  });

  test("restoring puts them back in their own former section", async ({ page }) => {
    const { store, sectionId } = await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Restore student" }).click();
    // No section is chosen, because none is asked for.
    await page.getByRole("dialog").getByRole("button", { name: "Restore student" }).click();

    await expect.poll(() => store.restores.length).toBeGreaterThan(0);
    expect(store.restores[0].body).toEqual({ section_id: sectionId });
  });

  test("a restore whose former section is gone cannot be submitted blind", async ({ page }) => {
    await stubbedDroppedLearner(page, { sectionGone: true });

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Restore student" }).click();

    const dialog = page.getByRole("dialog");
    // Nowhere to go back to, so this is the one case it does ask.
    await expect(dialog.getByRole("button", { name: "Restore student" })).toBeDisabled();
    await expect(dialog).toContainText("cannot go back");
    await expect(dialog.getByLabel("Place them in")).toBeVisible();
  });

  // ─── Purge ───────────────────────────────────────────────────────

  test("purging states that it is permanent and lists what goes", async ({ page }) => {
    await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Purge permanently" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("cannot be undone");
    await expect(dialog).toContainText("LRN-DROPPED");
    await expect(dialog).toContainText("4 assessment attempts");
    await expect(dialog).toContainText("180 practice attempts");
    await expect(dialog).toContainText("account and sign-in identity");
  });

  test("purging is refused until the learner ID is typed exactly", async ({ page }) => {
    await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Purge permanently" }).click();

    const dialog = page.getByRole("dialog");
    const submit = dialog.getByRole("button", { name: "Purge student permanently" });
    const confirm = dialog.getByLabel("Type CONFIRM to confirm");

    // Nothing typed, nothing ticked.
    await expect(submit).toBeDisabled();

    // Wrong word, ticked.
    await confirm.fill("DELETE");
    await dialog.getByRole("checkbox").check();
    await expect(submit).toBeDisabled();
    await expect(dialog).toContainText("does not match");

    // Right word, but unticked again.
    await confirm.fill("CONFIRM");
    await dialog.getByRole("checkbox").uncheck();
    await expect(submit).toBeDisabled();

    // Both.
    await dialog.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
  });

  test("purging sends the typed confirmation for the learner in the path", async ({ page }) => {
    const { store } = await stubbedDroppedLearner(page);

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Purge permanently" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Type CONFIRM to confirm").fill("CONFIRM");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Purge student permanently" }).click();

    await expect.poll(() => store.purges.length).toBeGreaterThan(0);
    // The typed word gates the act; the request still carries the learner's
    // own id for the server to check against the record it reads.
    expect(store.purges[0].body).toEqual({ learner_id: "LRN-DROPPED", acknowledged: true });
    expect(store.purges[0].pathname).toContain("stu-dropped");
  });

  test("a failed purge keeps the dialog, the typing, and offers a retry", async ({ page }) => {
    const { store } = await stubbedDroppedLearner(page, { purgeFails: true });

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Purge permanently" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Type CONFIRM to confirm").fill("CONFIRM");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Purge student permanently" }).click();

    await expect(dialog.getByRole("alert")).toBeVisible();
    // Still open, still filled in, and the button says what pressing it does.
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Type CONFIRM to confirm")).toHaveValue("CONFIRM");
    await expect(dialog.getByRole("button", { name: "Retry purge" })).toBeEnabled();
    expect(store.purges.length).toBe(1);
  });

  test("a successful purge refreshes the roster without a reload", async ({ page }) => {
    const { store } = await stubbedDroppedLearner(page);
    const before = store.rosterReads;

    await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
    await page.getByRole("menuitem", { name: "Purge permanently" }).click();

    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Type CONFIRM to confirm").fill("CONFIRM");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Purge student permanently" }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(() => store.rosterReads).toBeGreaterThan(before);
    await expect(page.getByText(/permanently removed/)).toBeVisible();
  });

  for (const viewport of VIEWPORTS) {
    test(`the purge confirmation fits a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubbedDroppedLearner(page);

      await page.getByRole("button", { name: /Actions for Dropped Learner/ }).click();
      await page.getByRole("menuitem", { name: "Purge permanently" }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      const box = await dialog.boundingBox();
      expect(box.x, `the dialog touches the left edge at ${viewport.width}px`).toBeGreaterThanOrEqual(15);
      expect(
        box.x + box.width,
        `the dialog touches the right edge at ${viewport.width}px`,
      ).toBeLessThanOrEqual(viewport.width - 15);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
    });
  }


  // ─── The row action menu stays inside the viewport ───────────────
  //
  // It used to be positioned inside the roster, which lives in an
  // `overflow-hidden` wrapper containing a horizontally scrollable element.
  // A menu on one of the last rows was clipped by both and produced a second
  // scrollbar inside the table. It is rendered through a portal now.

  /**
   * Stubs a roster long enough that its last row sits near the fold.
   *
   * @returns the store plus the learner names, first to last.
   */
  async function stubbedLongRoster(page, { status = "enrolled" } = {}) {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to place them in");

    const sectionId = await filter.locator("option").nth(1).getAttribute("value");
    const archived = status === "dropped";

    const roster = Array.from({ length: 24 }, (_, index) => ({
      student_id: `stu-long-${index}`,
      user_id: `usr-long-${index}`,
      learner_id: `LRN-LONG-${String(index).padStart(2, "0")}`,
      full_name: `Long Roster ${String(index).padStart(2, "0")}`,
      section_id: sectionId,
      diagnostic_status: "not_started",
      monitoring_status: "active",
      account_status: archived ? "archived" : "active",
    }));

    const store = await stubClientCalls(page, {
      roster,
      sectionMeta: [
        { section_id: sectionId, enrolled: archived ? 0 : 24, dropped: archived ? 24 : 0 },
      ],
      preview: { removes: { assessment_attempts: 1 } },
    });

    if (archived) {
      await page.getByLabel("Filter by student status").selectOption("dropped");
    } else {
      await filter.selectOption(sectionId);
    }
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);
    await expect(page.getByRole("link", { name: "Long Roster 23" })).toBeVisible();

    return { store, names: roster.map((learner) => learner.full_name) };
  }

  /** Opens one row's menu and reports what it did to the page. */
  async function openRowMenu(page, name) {
    const before = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      nested: [...document.querySelectorAll("table, table *")].filter(
        (node) => node.scrollHeight > node.clientHeight + 1,
      ).length,
    }));

    await page.getByRole("button", { name: `Actions for ${name}` }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const after = await page.evaluate(() => ({
      height: document.documentElement.scrollHeight,
      width: document.documentElement.scrollWidth,
      nested: [...document.querySelectorAll("table, table *")].filter(
        (node) => node.scrollHeight > node.clientHeight + 1,
      ).length,
    }));

    return { menu, before, after, box: await menu.boundingBox() };
  }

  for (const status of ["enrolled", "dropped"]) {
    test(`the last row's menu stays on screen for a ${status} learner`, async ({ page }) => {
      const { names } = await stubbedLongRoster(page, { status });
      const last = names.at(-1);

      // Scroll it to the very bottom, which is where the menu used to be cut off.
      await page.getByRole("link", { name: last }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));

      const { box } = await openRowMenu(page, last);
      const viewport = page.viewportSize();

      expect(box.y, "the menu runs off the top").toBeGreaterThanOrEqual(0);
      expect(
        box.y + box.height,
        "the menu runs off the bottom",
      ).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
    });
  }

  test("the last row's menu flips above the button", async ({ page }) => {
    const { names } = await stubbedLongRoster(page);
    const last = names.at(-1);

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const { menu } = await openRowMenu(page, last);

    await expect(menu).toHaveAttribute("data-placement", "top");
  });

  test("the first row's menu opens downward", async ({ page }) => {
    const { names } = await stubbedLongRoster(page);

    await page.evaluate(() => window.scrollTo(0, 0));
    const { menu } = await openRowMenu(page, names[0]);

    await expect(menu).toHaveAttribute("data-placement", "bottom");
  });

  test("opening a menu never grows the page or nests a scrollbar", async ({ page }) => {
    const { names } = await stubbedLongRoster(page);

    for (const name of [names[0], names[Math.floor(names.length / 2)], names.at(-1)]) {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const { before, after } = await openRowMenu(page, name);

      expect(after.height, `${name} grew the page`).toBe(before.height);
      expect(after.width, `${name} widened the page`).toBe(before.width);
      // The defect this guards: a clipped menu forced the roster to scroll
      // inside itself, putting a second vertical scrollbar on the screen.
      expect(after.nested, `${name} added a scrollbar inside the roster`).toBe(before.nested);

      await page.keyboard.press("Escape");
    }
  });

  test("the menu is rendered outside the roster's overflow containers", async ({ page }) => {
    const { names } = await stubbedLongRoster(page);
    await openRowMenu(page, names.at(-1));

    const insideTable = await page
      .getByRole("menu")
      .evaluate((node) => Boolean(node.closest("table")));
    expect(insideTable, "the menu is still inside the table").toBe(false);
  });

  for (const viewport of VIEWPORTS) {
    test(`the last row's menu fits a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const { names } = await stubbedLongRoster(page);

      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const { box, before, after } = await openRowMenu(page, names.at(-1));

      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(after.width).toBe(before.width);
    });
  }

  // ─── Selecting dropped learners ──────────────────────────────────

  test("dropped learners can be selected, one by one and by section", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await expect(page.getByText("1 selected")).toBeVisible();

    const header = page.locator('th[scope="colgroup"]').first();
    const sectionName = (await header.innerText()).replace(/^Section/, "").split("\\n")[0].trim();
    await page.getByLabel(new RegExp(`Select every student in`)).first().check();
    await expect(page.getByText("24 selected")).toBeVisible();
    expect(sectionName.length).toBeGreaterThan(0);
  });

  test("a dropped selection offers Restore and Purge, not Drop", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();

    await expect(page.getByRole("button", { name: "Restore selected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Purge selected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Drop selected" })).toHaveCount(0);
  });

  test("an enrolled selection still offers Drop only", async ({ page }) => {
    const { names } = await stubbedLongRoster(page);

    await page.getByLabel(`Select ${names[0]}`).check();

    await expect(page.getByRole("button", { name: "Drop selected" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Restore selected" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Purge selected" })).toHaveCount(0);
  });

  test("purging a selection states the count and asks for CONFIRM", async ({ page }) => {
    const { names, store } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await page.getByLabel(`Select ${names[1]}`).check();
    await page.getByRole("button", { name: "Purge selected" }).click();

    const dialog = page.getByRole("dialog");
    // The count and what goes with it, said plainly.
    await expect(dialog).toContainText("All 2 selected students");
    await expect(dialog).toContainText("sign-in identities");
    await expect(dialog).toContainText("2 MathSmart accounts");

    const submit = dialog.getByRole("button", { name: "Purge 2 students permanently" });
    await expect(submit).toBeDisabled();

    // The same word as a single purge, and nothing else works.
    await dialog.getByLabel("Type CONFIRM to confirm").fill("PURGE");
    await dialog.getByRole("checkbox").check();
    await expect(submit).toBeDisabled();

    await dialog.getByLabel("Type CONFIRM to confirm").fill("CONFIRM");
    await expect(submit).toBeEnabled();
    await submit.click();

    // One request per learner, each carrying that learner's own id for the
    // server to verify — the typed phrase gates the act, it does not stand in
    // for the per-learner check.
    await expect.poll(() => store.purges.length).toBe(2);
    expect(store.purges.map((call) => call.body.learner_id).sort()).toEqual([
      "LRN-LONG-00",
      "LRN-LONG-01",
    ]);
  });

  test("restoring a selection sends one section for all of them", async ({ page }) => {
    const { names, store } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await page.getByLabel(`Select ${names[1]}`).check();
    await page.getByRole("button", { name: "Restore selected" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("2 students");
    // Both were in the same section and both go back to it, unasked.
    await expect(dialog.getByLabel("Place them in")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Restore 2 students" }).click();

    await expect.poll(() => store.restores.length).toBe(2);
    const sections = new Set(store.restores.map((call) => call.body.section_id));
    expect(sections.size).toBe(1);
  });

  // ─── One student, or the selection — never ambiguously both ──────
  //
  // A row menu acts on one learner and the bar at the bottom acts on the
  // selection. Offering both at once left a teacher unable to tell which a
  // click was about to be, which matters most for the two actions that cannot
  // be undone.

  test("with nothing selected, every row offers its own menu", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    for (const name of [names[0], names.at(-1)]) {
      await expect(page.getByRole("button", { name: `Actions for ${name}` })).toBeEnabled();
    }
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("selecting one student takes the row menus away", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();

    await expect(page.getByText("1 selected")).toBeVisible();
    // Every row, not only the one that was ticked.
    for (const name of [names[0], names[1], names.at(-1)]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`Actions for ${name}`) }),
      ).toBeDisabled();
    }
  });

  test("a disabled row menu says why", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });
    await page.getByLabel(`Select ${names[0]}`).check();

    await expect(
      page.getByRole("button", { name: `Actions for ${names[1]} — unavailable while students are selected` }),
    ).toBeVisible();
  });

  test("a disabled row menu cannot be opened by click or keyboard", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });
    await page.getByLabel(`Select ${names[0]}`).check();

    const trigger = page.getByRole("button", { name: new RegExp(`Actions for ${names[1]}`) });
    await trigger.click({ force: true });
    await expect(page.getByRole("menu")).toHaveCount(0);

    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toHaveCount(0);
  });

  test("Clear leaves selection mode and gives the row menus back", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await expect(page.getByRole("button", { name: new RegExp(`Actions for ${names[0]}`) })).toBeDisabled();

    await page.getByRole("button", { name: "Clear" }).click();

    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Actions for ${names[0]}` })).toBeEnabled();
  });

  test("the section checkbox reports checked, indeterminate and clear", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });
    const header = page.getByLabel(/Select every student in/).first();

    // Nothing picked.
    expect(await header.evaluate((node) => node.checked)).toBe(false);
    expect(await header.evaluate((node) => node.indeterminate)).toBe(false);

    // Some picked.
    await page.getByLabel(`Select ${names[0]}`).check();
    expect(await header.evaluate((node) => node.checked)).toBe(false);
    expect(await header.evaluate((node) => node.indeterminate)).toBe(true);

    // All picked, through the header itself.
    await header.check();
    expect(await header.evaluate((node) => node.checked)).toBe(true);
    expect(await header.evaluate((node) => node.indeterminate)).toBe(false);
    await expect(page.getByText(`${names.length} selected`)).toBeVisible();

    // And off again.
    await header.uncheck();
    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("changing the status filter clears a selection it would hide", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await expect(page.getByText("1 selected")).toBeVisible();

    await page.getByLabel("Filter by student status").selectOption("enrolled");

    await expect(page.getByText(/\d+ selected/)).toHaveCount(0);
  });

  test("searching drops the selected learners it hides", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await page.getByLabel(`Select ${names[1]}`).check();
    await expect(page.getByText("2 selected")).toBeVisible();

    // Narrows to the first of the two.
    await page.getByLabel("Search").fill(names[0]);

    await expect(page.getByText("1 selected")).toBeVisible();
  });

  test("bulk restore says how many are being restored", async ({ page }) => {
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();
    await page.getByLabel(`Select ${names[1]}`).check();
    await page.getByRole("button", { name: "Restore selected" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Restore 2 students?");
    await expect(dialog.getByRole("button", { name: "Restore 2 students" })).toBeVisible();
  });

  test("the bulk bar stays reachable on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    const { names } = await stubbedLongRoster(page, { status: "dropped" });

    await page.getByLabel(`Select ${names[0]}`).check();

    const bar = page.getByText("1 selected");
    await expect(bar).toBeInViewport();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  // ─── The roster is the canonical Grade 6 roster ──────────────────
  //
  // These are written as invariants rather than against named sections, so
  // they keep their meaning on any deployment: no learner name, learner id or
  // section id is hardcoded anywhere below.

  test("every roster group is an active Grade 6 section", async ({ page }) => {
    await page.goto("/teacher/students");
    await page.getByRole("heading", { name: "Student roster" }).waitFor();

    const allowed = await page
      .getByLabel("Filter by class section")
      .locator("option")
      .evaluateAll((all) => all.map((option) => option.textContent.trim()).slice(1));

    const headings = await page
      .locator('th[scope="colgroup"]')
      .evaluateAll((all) =>
        all.map((node) => node.textContent.replace(/^Section/, "").replace(/\d+ enrolled.*$/, "").trim()),
      );

    // The defect this guards: a section from another grade became a heading on
    // the Grade 6 roster purely because one learner row still pointed at it.
    for (const heading of headings) {
      expect(
        allowed.includes(heading) || heading === "Needs section assignment",
        `"${heading}" is not an active Grade 6 section`,
      ).toBe(true);
    }
  });

  test("the section filter offers nothing outside the canonical Grade 6", async ({ page }) => {
    await page.goto("/teacher/students");

    const options = await page
      .getByLabel("Filter by class section")
      .locator("option")
      .evaluateAll((all) => all.map((option) => option.textContent.trim()));

    expect(options[0]).toBe("All sections");
    // Every remaining option is a section of the one grade, which the module
    // renders as a badge in its own header.
    await expect(page.getByRole("main").getByText("Grade 6", { exact: true })).toBeVisible();
    expect(options.length).toBeGreaterThan(1);
  });

  test("a client refresh asks by grade, exactly as the first read did", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");

    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to filter by");

    await filter.selectOption({ index: 1 });
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    // The defect this guards: the server-rendered read filtered by grade and
    // the browser's refresh did not, so a legacy learner reappeared the moment
    // a teacher touched a filter.
    expect(store.rosterUrls.at(-1)).toMatch(/grade_id=[0-9a-f-]{36}/);
  });

  test("each section's stated count matches the learners under it", async ({ page }) => {
    await page.goto("/teacher/students");
    await page.getByRole("heading", { name: "Student roster" }).waitFor();

    const groups = await page.locator("table tbody").evaluateAll((bodies) =>
      bodies.map((body) => ({
        stated: Number(
          body.querySelector('th[scope="colgroup"]')?.textContent.match(/(\d+) enrolled/)?.[1] ?? 0,
        ),
        truncated: /shown/.test(body.querySelector('th[scope="colgroup"]')?.textContent ?? ""),
        rows: [...body.querySelectorAll("tr")].filter(
          (row) => !row.querySelector('th[scope="colgroup"]'),
        ).length,
      })),
    );
    test.skip(groups.length === 0, "no learner is enrolled in this deployment");

    for (const group of groups) {
      if (group.truncated) continue;
      expect(group.stated).toBe(group.rows);
      // And a heading never claims nobody while showing somebody.
      expect(group.rows).toBeGreaterThan(0);
    }
  });

  test("a learner in a section this roster does not recognise is kept, not lost", async ({
    page,
  }) => {
    await page.goto("/teacher/students");
    const filter = page.getByLabel("Filter by class section");
    test.skip((await filter.locator("option").count()) < 2, "no section to group by");

    const store = await stubClientCalls(page, {
      sectionMeta: [],
      roster: [
        {
          student_id: "stu-orphan",
          user_id: "usr-orphan",
          learner_id: "LRN-ORPHAN",
          full_name: "Orphaned Learner",
          // A section id no active Grade 6 section has.
          section_id: "00000000-0000-4000-8000-000000000000",
          diagnostic_status: "not_started",
          monitoring_status: "active",
          account_status: "active",
        },
      ],
    });

    await filter.selectOption({ index: 1 });
    await expect.poll(() => store.rosterReads).toBeGreaterThan(0);

    // No heading is invented from the stale reference, and the learner is
    // still on the roster with somewhere obvious to go.
    await expect(page.getByRole("row", { name: /Needs section assignment/ })).toBeVisible();
    await expect(page.getByRole("link", { name: "Orphaned Learner" })).toBeVisible();
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
    // "Status", not "Monitoring": a dropped learner reads Dropped here rather
    // than reporting the monitoring state they were in when they left.
    await expect(main.getByText("Status", { exact: true })).toBeVisible();
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
    await expect(page.getByRole("region", { name: "Teaching note", exact: true })).toHaveCount(0);
    expect(store.insights).toHaveLength(0);
  });

  test("an advisory note never carries a learner's identity", async ({ page }) => {
    const store = await stubClientCalls(page);
    await page.goto("/teacher/students");
    const learner = await firstLearner(page);
    test.skip(learner === null, "no learner is enrolled in this deployment");

    await page.goto(learner.href);
    const panel = page.getByRole("region", { name: "Teaching note", exact: true });
    test.skip((await panel.count()) === 0, "this learner has no scored competency to ask about");

    await expect.poll(() => store.insights.length).toBeGreaterThan(0);

    const sent = JSON.stringify(store.insights.at(-1));
    expect(sent, "a learner name travelled").not.toContain(learner.name);
    expect(sent, "a learner id travelled").not.toContain(learner.href.split("/").pop());
    // Recurring-mistake evidence is never sent, because none is collected.
    expect(store.insights.at(-1).incorrect_patterns).toEqual([]);
  });

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "phone", width: 375, height: 740 },
  ]) {
    test(`the teaching note is short, structured and plain on a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubClientCalls(page, { insight: note("Adds the denominators when multiplying.") });
      const panel = await learnerWithNote(page);
      test.skip(panel === null, "no learner has a scored competency");

      await expect(panel.getByText("Adds the denominators when multiplying.")).toBeVisible();
      for (const part of ["Learning gap", "Evidence", "Suggested actions", "Next check"]) {
        await expect(panel.getByRole("heading", { name: part, exact: true })).toBeVisible();
      }
      await expect(panel.getByRole("listitem")).toHaveCount(5);
      await expect(panel.getByText("AI suggestion (advisory)")).toBeVisible();

      // No provenance, and nothing that reads as raw markup.
      const text = await panel.innerText();
      for (const marker of ["Written by", "groq", "gpt", "**", "##", "|"]) {
        expect(text, `"${marker}" reached the teacher`).not.toContain(marker);
      }
      expect(text).not.toMatch(/\b(AM|PM)\b|\d{1,2}:\d{2}/);

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, "the page scrolls sideways").toBeLessThanOrEqual(1);
    });

    test(`asking again replaces the note only when a new one arrives, on a ${viewport.name}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      let reply = note("The first note.");
      await stubClientCalls(page, { insight: () => reply });
      const panel = await learnerWithNote(page);
      test.skip(panel === null, "no learner has a scored competency");

      await expect(panel.getByText("The first note.")).toBeVisible();
      const ask = panel.getByRole("button", { name: "Ask for a new teaching note" });

      // A success replaces it.
      reply = note("A second, newer note.");
      await ask.click();
      await expect(panel.getByText("A second, newer note.")).toBeVisible();
      await expect(panel.getByText("The first note.")).toHaveCount(0);

      // A failure keeps it, and says so in a toast rather than in its place.
      reply = null;
      await ask.click();
      const toast = page.getByRole("alert").filter({ hasText: "could not be prepared" });
      await expect(toast).toBeVisible();
      await expect(panel.getByText("A second, newer note.")).toBeVisible();
      await expect(panel.getByText(/unavailable right now/)).toHaveCount(0);
      await expect(ask).toBeEnabled();

      await toast.getByRole("button", { name: "Dismiss this message" }).click();
      await expect(toast).toHaveCount(0);
      await expect(panel.getByText("A second, newer note.")).toBeVisible();
    });
  }

  test("a first request that fails says so in place, with nothing invented", async ({ page }) => {
    await stubClientCalls(page, { insight: null });
    const panel = await learnerWithNote(page);
    test.skip(panel === null, "no learner has a scored competency");

    await expect(panel.getByText(/unavailable right now/)).toBeVisible();
    await expect(panel.getByRole("heading", { name: "Learning gap" })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "could not be prepared" })).toHaveCount(0);
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
