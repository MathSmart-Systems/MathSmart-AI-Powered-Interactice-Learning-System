import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import { HOSTED_DATA_SKIP_REASON, isLocalDataEnvironment } from "../support/environment";

/**
 * Behavioural cover for the Grades & Sections workspace.
 *
 * MathSmart teaches DepEd Grade 6 and nothing else, so this workspace manages
 * one grade level and the sections under it. These tests are mostly about that
 * boundary holding: no second grade can be added, the level cannot be moved,
 * the name cannot contradict it, and a record that predates the rule is set
 * aside rather than mixed in with the working directory.
 *
 * The create/edit/deactivate cycle runs against an intercepted directory API.
 * The interface under test is the real one — the real dialogs, the real client
 * transport, the real refresh after a save — but the rows live in the test's
 * own store, so the cycle can be exercised on any deployment without leaving a
 * section behind in real school data. The live-stack block at the end repeats
 * the cycle against the repository's local Supabase and cleans up after
 * itself; it skips anywhere else.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Widths the workspace has to stay usable at, from a small phone upward. */
const VIEWPORTS = [
  { name: "small phone", width: 320, height: 720 },
  { name: "phone", width: 360, height: 780 },
  { name: "large phone", width: 414, height: 896 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "small laptop", width: 1024, height: 768 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide desktop", width: 1920, height: 1080 },
];

const GRADE_6 = { grade_id: "stub-grade-6", name: "Grade 6", level: 6, is_active: true };
const LEGACY_GRADE = { grade_id: "stub-grade-3", name: "Grade 3", level: 3, is_active: true };
const LEGACY_SECTION = {
  section_id: "stub-section-legacy",
  grade_id: LEGACY_GRADE.grade_id,
  adviser_id: null,
  name: "jayrold",
  is_active: true,
};

/** A name no other run will collide with, and that reads as test data. */
function uniqueName(prefix) {
  return `${prefix} ${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,content-type,accept",
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

function isDirectoryRequest(url) {
  return (
    url.pathname.includes("/teacher-admin/grades") ||
    url.pathname.includes("/teacher-admin/sections")
  );
}

/**
 * Stands the directory API up in memory for one page.
 *
 * It answers the same envelopes the MathSmart API documents — `{data: …}` on a
 * read or a save, `204` on a deactivation — and it enforces the same Grade 6
 * rule the real API does, so the interface is never tested against a server
 * more permissive than the one it will meet.
 *
 * @returns {{grades: Array, sections: Array}} the store the page is now reading
 */
async function stubDirectory(page, { grades = [GRADE_6], sections = [] } = {}) {
  const store = { grades: [...grades], sections: [...sections] };

  await page.route(
    (url) => isDirectoryRequest(url),
    async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === "OPTIONS") {
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }

      const { pathname } = new URL(request.url());
      const isGrade = pathname.includes("/teacher-admin/grades");
      const collection = isGrade ? store.grades : store.sections;
      const idKey = isGrade ? "grade_id" : "section_id";

      const last = pathname.split("/").filter(Boolean).pop();
      const id = last === "grades" || last === "sections" ? null : last;
      let row = id ? collection.find((entry) => entry[idKey] === id) : null;

      // The first paint comes from the server, which the browser cannot
      // intercept, so the first change to the grade carries an identifier this
      // store has never seen. There is only ever one supported grade, so adopt
      // it onto that row rather than answering a spurious 404.
      if (!row && id && isGrade) {
        row = collection.find((entry) => entry.level === 6);
        if (row) row[idKey] = id;
      }

      if (method === "GET") {
        return jsonReply(route, 200, { data: collection });
      }

      if (method === "POST") {
        const body = request.postDataJSON();
        if (isGrade) {
          // The real API refuses this outright; so does the stub.
          return jsonReply(route, 422, {
            error: { code: "grade_scope", message: "MathSmart supports Grade 6 only." },
          });
        }
        const grade = store.grades.find((entry) => entry.grade_id === body.grade_id);
        if (grade?.level !== 6) {
          return jsonReply(route, 422, {
            error: { code: "grade_scope", message: "MathSmart supports Grade 6 only." },
          });
        }
        const created = {
          adviser_id: null,
          ...body,
          [idKey]: `stub-${idKey}-${collection.length + 1}`,
          is_active: body.is_active !== false,
        };
        collection.push(created);
        return jsonReply(route, 201, { data: created });
      }

      if (id && !row) {
        return jsonReply(route, 404, { error: { message: "No record was found" } });
      }

      if (method === "PATCH") {
        const body = request.postDataJSON();
        if (isGrade && body.level !== undefined && body.level !== 6) {
          return jsonReply(route, 422, {
            error: { code: "grade_scope", message: "MathSmart supports Grade 6 only." },
          });
        }
        Object.assign(row, body);
        return jsonReply(route, 200, { data: row });
      }

      if (method === "DELETE") {
        if (isGrade && row.level === 6) {
          return jsonReply(route, 422, {
            error: { code: "grade_scope", message: "Grade 6 cannot be deactivated." },
          });
        }
        // The API deactivates rather than deletes, and answers with no body.
        row.is_active = false;
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }

      return route.continue();
    },
  );

  return store;
}

/** The page's single live region, where every outcome is reported. */
function statusLine(page) {
  return page.getByTestId("directory-status");
}

const gradePanel = (page) => page.getByRole("region", { name: "Grade Level" });
const sectionPanel = (page) => page.getByRole("region", { name: "Class Sections" });
const outOfScopePanel = (page) =>
  page.getByRole("region", { name: "Outside the Grade 6 curriculum" });

/**
 * Brings the page's own grade list under the stub.
 *
 * The first paint comes from the server, which the browser cannot intercept, so
 * the lists only become the test's own once the page has re-read them. Saving
 * the grade is the workspace's own way of doing that.
 */
async function syncGrades(page, name = "Grade 6") {
  await gradePanel(page)
    .getByRole("button", { name: /^Edit / })
    .click();
  await page.getByLabel("Grade Name").fill(name);
  await page.getByRole("button", { name: "Save Grade", exact: true }).click();
  await expect(statusLine(page)).toHaveText(`${name} saved.`);
}

/** Creates a section through the real dialog and waits for it to land. */
async function addSection(page, name) {
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await page.getByLabel("Section Name").fill(name);
  await page.getByRole("button", { name: "Add Section", exact: true }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Edit ${name} \\(`) })).toBeVisible();
  return name;
}

describe("grades and sections workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  test("the directory opens as its own workspace, not a placeholder", async ({ page }) => {
    await page.goto("/teacher/grades-sections");

    await expect(page.getByRole("heading", { name: "Grades and Sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Grade Level", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Class Sections", exact: true })).toBeVisible();
  });

  // ─── Grade 6 is the whole scope ──────────────────────────────────

  test("there is no way to add a grade level", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await expect(page.getByRole("button", { name: /add grade/i })).toHaveCount(0);
    await expect(gradePanel(page)).toContainText("There is no second grade level to add");
  });

  test("the grade level cannot be deactivated from the working directory", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    // The Grade 6 row offers editing and nothing that would retire it.
    await expect(gradePanel(page).getByRole("button", { name: /^Deactivate / })).toHaveCount(0);
    await expect(gradePanel(page).getByRole("button", { name: /^Edit / })).toBeVisible();
  });

  test("the grade level is fixed at 6 and cannot be chosen", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await gradePanel(page)
      .getByRole("button", { name: /^Edit / })
      .click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("6 — the only level MathSmart supports");
    // There is no control to change it with.
    await expect(dialog.getByRole("combobox")).toHaveCount(0);
    await expect(dialog.locator("select")).toHaveCount(0);
  });

  test("the grade name cannot contradict the level", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await gradePanel(page)
      .getByRole("button", { name: /^Edit / })
      .click();
    await page.getByLabel("Grade Name").fill("Grade 3");
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();

    await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
      "cannot name a different grade",
    );
    // Refused before it was sent: the record is untouched.
    await expect(page.getByLabel("Grade Name")).toBeVisible();
    expect(store.grades[0].name).toBe("Grade 6");
  });

  test("a name that mentions no grade at all is accepted", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await syncGrades(page, "Grade 6 Mathematics");

    await expect(gradePanel(page)).toContainText("Grade 6 Mathematics");
  });

  test("a section dialog states its grade instead of offering a choice", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    await page.getByRole("button", { name: "Add section", exact: true }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Grade 6 — every section belongs to it");
    // The adviser select is the only one left; the grade is not a choice.
    await expect(dialog.locator("select")).toHaveCount(1);
    await expect(dialog.getByLabel("Adviser")).toBeVisible();
  });

  test("records outside Grade 6 are set apart from the working directory", async ({ page }) => {
    await stubDirectory(page, {
      grades: [GRADE_6, LEGACY_GRADE],
      sections: [LEGACY_SECTION],
    });
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const legacy = outOfScopePanel(page);
    await expect(legacy).toBeVisible();
    await expect(legacy).toContainText("Grade 3");

    // They are not mixed into the panels a teacher works in.
    await expect(gradePanel(page)).not.toContainText("Grade 3");
    await expect(sectionPanel(page)).not.toContainText("jayrold");
  });

  test("a record outside Grade 6 can be retired but not edited", async ({ page }) => {
    await stubDirectory(page, { grades: [GRADE_6, LEGACY_GRADE], sections: [] });
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const legacy = outOfScopePanel(page);
    await expect(legacy.getByRole("button", { name: "Edit Grade 3" })).toHaveCount(0);

    await legacy.getByRole("button", { name: "Deactivate Grade 3" }).click();

    await expect(statusLine(page)).toHaveText("Grade 3 deactivated.");
    await expect(legacy.getByRole("listitem").filter({ hasText: "Grade 3" })).toContainText(
      "Inactive",
    );
  });

  test("the panel stays away when every record is in scope", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);
    // Creating a section is how the page re-reads its section list, so both
    // lists are the store's by the time the panel is judged.
    await addSection(page, uniqueName("Rizal QA"));

    await expect(outOfScopePanel(page)).toHaveCount(0);
  });

  // ─── The section lifecycle ───────────────────────────────────────

  test("a class section can be created, edited, and deactivated", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const created = await addSection(page, uniqueName("Rizal QA"));
    await expect(statusLine(page)).toHaveText(`${created} added.`);
    await expect(sectionPanel(page).getByRole("listitem").filter({ hasText: created })).toContainText(
      "Active",
    );

    // Edit
    const renamed = `${created} renamed`;
    await page.getByRole("button", { name: new RegExp(`^Edit ${created} \\(`) }).click();
    await page.getByLabel("Section Name").fill(renamed);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();

    await expect(page.getByRole("button", { name: new RegExp(`^Edit ${renamed} \\(`) })).toBeVisible();
    await expect(statusLine(page)).toHaveText(`${renamed} saved.`);

    // Deactivate
    await page.getByRole("button", { name: new RegExp(`^Deactivate ${renamed} \\(`) }).click();

    await expect(statusLine(page)).toHaveText(`${renamed} deactivated.`);
    await expect(page.getByRole("listitem").filter({ hasText: renamed })).toContainText("Inactive");
    // The state is legible after the operation: the same control now offers
    // the way back, so the row is not merely gone.
    await expect(
      page.getByRole("button", { name: new RegExp(`^Activate ${renamed} \\(`) }),
    ).toBeVisible();
  });

  test("every row says what its second action does instead of showing a bare icon", async ({
    page,
  }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const name = await addSection(page, uniqueName("Rizal QA"));

    const deactivate = page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \\(`) });
    await expect(deactivate).toBeVisible();
    // The word itself has to be on screen; an icon alone is what this replaced.
    await expect(deactivate).toHaveText(/Deactivate/);
    await expect(page.getByRole("button", { name: new RegExp(`^Edit ${name} \\(`) })).toHaveText(
      /Edit/,
    );
  });

  test("a refused save keeps the dialog open and says why", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "POST") {
          return jsonReply(route, 422, {
            error: { code: "validation_error", message: "That section already exists." },
          });
        }
        return route.fallback();
      },
    );

    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section Name").fill(uniqueName("Rizal QA"));
    await page.getByRole("button", { name: "Add Section", exact: true }).click();

    // Scoped to the dialog, because Next's route announcer is also an alert.
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "That section already exists.",
    );
    // The person keeps their typing and the dialog stays open to correct it.
    await expect(page.getByLabel("Section Name")).toBeVisible();
  });

  test("a failed deactivation reports the problem and leaves the row alone", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const name = await addSection(page, uniqueName("Rizal QA"));

    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "DELETE") {
          return jsonReply(route, 409, {
            error: { message: "This section still has learners assigned." },
          });
        }
        return route.fallback();
      },
    );

    await page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \\(`) }).click();

    // Scoped to the workspace, because Next's route announcer is also an alert.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "This section still has learners assigned.",
    );
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Active");
    expect(store.sections[0].is_active).toBe(true);
  });

  test("the whole row can be reached and operated from the keyboard alone", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const name = await addSection(page, uniqueName("Rizal QA"));

    const deactivate = page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \\(`) });
    await page.getByRole("button", { name: new RegExp(`^Edit ${name} \\(`) }).focus();
    await page.keyboard.press("Tab");

    await expect(deactivate).toBeFocused();
    // Focus has to be visible, not merely present. Tab is a keyboard focus, so
    // the button's own :focus-visible ring is what is being measured here.
    const ring = await deactivate.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring, "the focused control shows no ring").not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
  });

  test("a busy deactivation disables its own control while it runs", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    const name = await addSection(page, uniqueName("Rizal QA"));

    // Hold the deactivation open so the pending state can be observed.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "DELETE") {
          await held;
        }
        return route.fallback();
      },
    );

    await page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \\(`) }).click();

    const pending = page.getByRole("button", { name: new RegExp(`^Deactivating… ${name} \\(`) });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveText(/Deactivating/);
    await expect(statusLine(page)).toHaveText(`Deactivating ${name}…`);

    release();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
  });

  // ─── Every viewport ──────────────────────────────────────────────

  for (const viewport of VIEWPORTS) {
    test(`the workspace fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubDirectory(page, { grades: [GRADE_6, LEGACY_GRADE], sections: [LEGACY_SECTION] });
      await page.goto("/teacher/grades-sections");
      await syncGrades(page);

      const name = await addSection(page, uniqueName("Rizal QA"));

      await expect(page.getByRole("heading", { name: "Grades and Sections" })).toBeVisible();
      await expect(outOfScopePanel(page)).toBeVisible();

      // The action wording survives the width; it is not clipped away.
      const deactivate = page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \\(`) });
      await expect(deactivate).toBeVisible();
      await expect(deactivate).toHaveText(/Deactivate/);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `the page scrolls sideways at ${viewport.width}px`).toBe(false);

      // The row truncates its name, so the name has to keep enough room to say
      // something. A quarter of the row is modest; a crushed row leaves zero.
      const room = await page
        .getByRole("listitem")
        .filter({ hasText: name })
        .first()
        .evaluate((row) => {
          const title = row.querySelector("p");
          return { name: title.getBoundingClientRect().width, row: row.clientWidth };
        });
      expect(
        room.name,
        `the name is squeezed to ${Math.round(room.name)}px at ${viewport.width}px`,
      ).toBeGreaterThan(room.row * 0.25);

      // Every control stays inside the viewport and keeps a tappable height.
      const main = page.getByRole("main");
      for (const button of await main.getByRole("button").all()) {
        if (!(await button.isVisible())) continue;
        const box = await button.boundingBox();
        if (!box) continue;
        expect(box.x, "a control starts off the left edge").toBeGreaterThanOrEqual(-1);
        expect(box.x + box.width, "a control runs past the right edge").toBeLessThanOrEqual(
          viewport.width + 1,
        );
        expect(box.height, "a control is too short to tap").toBeGreaterThanOrEqual(24);
      }
    });
  }

  test("the create dialog stays usable on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncGrades(page);

    await page.getByRole("button", { name: "Add section", exact: true }).click();

    const field = page.getByLabel("Section Name");
    await expect(field).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Section", exact: true })).toBeVisible();

    const box = await field.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});

/**
 * The same cycle against the real stack.
 *
 * This writes rows, so it runs only against the local Supabase the repository
 * ships, which `npm run db:reset` restores from the seed.
 *
 * It cleans up after itself as far as the product allows: the section it
 * creates is deactivated, which is the only retirement the API offers — a real
 * section carries learner history, so there is deliberately no delete. The name
 * is prefixed with E2E so an interrupted run is still obvious as test data, and
 * the cleanup runs even when an assertion has already failed.
 */
const liveDescribe =
  hasAccount(TEACHER_ADMIN_ACCOUNT) && isLocalDataEnvironment()
    ? test.describe
    : test.describe.skip;

liveDescribe("grades and sections against the live directory", () => {
  test.skip(!isLocalDataEnvironment(), HOSTED_DATA_SKIP_REASON);

  test("a Grade 6 section created in the real directory survives a reload", async ({ page }) => {
    const created = uniqueName("E2E Section");
    let sectionId = null;

    // Remember the identifier the API assigns, so cleanup can name it exactly.
    page.on("response", async (response) => {
      const request = response.request();
      if (request.method() !== "POST") return;
      if (!request.url().includes("/teacher-admin/sections")) return;
      try {
        sectionId = (await response.json())?.data?.section_id ?? sectionId;
      } catch {
        /* a failed create has nothing to clean up */
      }
    });

    try {
      await signIn(page, TEACHER_ADMIN_ACCOUNT);
      await page.waitForURL("**/teacher/dashboard");
      await page.goto("/teacher/grades-sections");

      await addSection(page, created);
      await expect(statusLine(page)).toHaveText(`${created} added.`);

      await page.reload();
      await expect(
        page.getByRole("button", { name: new RegExp(`^Edit ${created} \\(`) }),
      ).toBeVisible();

      await page.getByRole("button", { name: new RegExp(`^Deactivate ${created} \\(`) }).click();
      await expect(statusLine(page)).toHaveText(`${created} deactivated.`);

      await page.reload();
      await expect(page.getByRole("listitem").filter({ hasText: created })).toContainText(
        "Inactive",
      );
    } finally {
      await retireSection(page, created, sectionId);
    }
  });
});

/**
 * Retires a section this spec created, whatever happened to the test.
 *
 * Deactivation is the retirement the product offers; there is no delete,
 * because a real section carries learner history. Running it here means an
 * assertion that failed halfway does not leave an active test section behind.
 */
async function retireSection(page, name, sectionId) {
  if (!sectionId) return;

  try {
    await page.goto("/teacher/grades-sections");
    const retire = page.getByRole("button", { name: new RegExp(`^Deactivate ${name} \(`) });
    if ((await retire.count()) > 0) {
      await retire.first().click();
      await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
    }
  } catch {
    // Never fail a run on cleanup alone; say what is left instead.
    console.warn(`Could not retire the test section ${name} (${sectionId}); retire it by hand.`);
  }
}
