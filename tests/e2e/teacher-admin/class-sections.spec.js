import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import { HOSTED_DATA_SKIP_REASON, isLocalDataEnvironment } from "../support/environment";

/**
 * Behavioural cover for the Class Sections workspace.
 *
 * MathSmart teaches DepEd Grade 6 and nothing else, so a teacher manages
 * sections, not grade levels. The grade is context: it appears once as a badge
 * and the server is what puts a section in it — the request carries no grade
 * at all. These tests are mostly about that staying true, and about the
 * adviser being assignable, changeable and removable without the page dropping
 * into an unreadable failure.
 *
 * The cycle runs against an intercepted directory API. The interface under
 * test is the real one — the real dialog, the real client transport, the real
 * refresh after a save — but the rows live in the test's own store, so it runs
 * on any deployment without leaving a section behind in real school data. The
 * live-stack block at the end repeats it against the repository's local
 * Supabase and cleans up after itself; it skips anywhere else.
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

const GRADE_6 = { grade_id: "stub-grade-6", name: "Grade 6", level: 6, is_active: true };
const LEGACY_GRADE = { grade_id: "stub-grade-3", name: "Grade 3", level: 3, is_active: true };
const LEGACY_SECTION = {
  section_id: "stub-section-legacy",
  grade_id: LEGACY_GRADE.grade_id,
  adviser_id: null,
  name: "jayrold",
  is_active: true,
};

const ADVISER_ONE = "stub-teacher-admin-1";
const ADVISER_TWO = "stub-teacher-admin-2";

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

function scopeRefusal(route) {
  return jsonReply(route, 422, {
    error: { code: "grade_scope", message: "MathSmart supports Grade 6 only." },
  });
}

const ADVISER_REFUSAL =
  "That adviser is not an active Teacher/Administrator. " +
  "Choose another, or leave the section unassigned.";

/**
 * Stands the directory API up in memory for one page.
 *
 * It answers the envelopes the MathSmart API documents and enforces the same
 * rules the real one does — no grade on a section request, no unknown adviser,
 * no second grade level — so the interface is never tested against a server
 * more permissive than the one it will meet.
 *
 * @returns {{grades: Array, sections: Array, advisers: Array}} the live store
 */
async function stubDirectory(page, { grades = [GRADE_6], sections = [], advisers = true } = {}) {
  const store = {
    grades: [...grades],
    sections: [...sections],
    //: section_id to how many learners still belong to it.
    learners: {},
    advisers: advisers
      ? [
          {
            user_id: "account-1",
            teacher_admin_id: ADVISER_ONE,
            role: "teacher_admin",
            account_status: "active",
            full_name: "Maria Santos",
          },
          {
            user_id: "account-2",
            teacher_admin_id: ADVISER_TWO,
            role: "teacher_admin",
            account_status: "active",
            full_name: "Jose Cruz",
          },
        ]
      : [],
  };

  await page.route(
    (url) =>
      url.pathname.includes("/teacher-admin/grades") ||
      url.pathname.includes("/teacher-admin/sections") ||
      url.pathname.includes("/teacher-admin/users"),
    async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === "OPTIONS") {
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }

      const { pathname } = new URL(request.url());

      if (pathname.includes("/teacher-admin/users")) {
        return jsonReply(route, 200, { data: store.advisers });
      }

      const isGrade = pathname.includes("/teacher-admin/grades");
      const collection = isGrade ? store.grades : store.sections;
      const idKey = isGrade ? "grade_id" : "section_id";

      const segments = pathname.split("/").filter(Boolean);
      const last = segments.at(-1) === "record" ? segments.at(-2) : segments.at(-1);
      const id = last === "grades" || last === "sections" ? null : last;
      const row = id ? collection.find((entry) => entry[idKey] === id) : null;

      if (method === "GET") {
        return jsonReply(route, 200, { data: isGrade ? store.grades : store.sections });
      }

      const body = method === "POST" || method === "PATCH" ? request.postDataJSON() : null;

      // The section contract has no grade field, so a request carrying one is
      // refused exactly as the real schema refuses it.
      if (!isGrade && body && "grade_id" in body) {
        return jsonReply(route, 422, {
          error: { code: "validation_error", message: "Unexpected field: grade_id." },
        });
      }
      if (!isGrade && body?.adviser_id) {
        const known = store.advisers.some((entry) => entry.teacher_admin_id === body.adviser_id);
        if (!known) {
          return jsonReply(route, 422, {
            error: { code: "adviser_unknown", message: ADVISER_REFUSAL },
          });
        }
      }

      if (method === "POST") {
        if (isGrade) return scopeRefusal(route);

        const grade = store.grades.find((entry) => entry.level === 6);
        if (!grade) {
          return jsonReply(route, 503, {
            error: { code: "mvp_grade_missing", message: "The Grade 6 record is missing." },
          });
        }
        // The server supplies the grade; the client never named one.
        const created = {
          adviser_id: null,
          ...body,
          grade_id: grade.grade_id,
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
        if (isGrade && body.level !== undefined && body.level !== 6) return scopeRefusal(route);
        Object.assign(row, body);
        return jsonReply(route, 200, { data: row });
      }

      if (method === "DELETE") {
        if (isGrade && row.level === 6) return scopeRefusal(route);

        // `/record` removes the row; the plain path only retires it.
        if (!isGrade && pathname.endsWith("/record")) {
          if (row.is_active) {
            return jsonReply(route, 422, {
              error: {
                code: "section_active",
                message: "Deactivate this section before deleting it.",
              },
            });
          }
          if (store.learners[row.section_id]) {
            return jsonReply(route, 422, {
              error: {
                code: "section_in_use",
                message: `${store.learners[row.section_id]} learners still belong to this section.`,
              },
            });
          }
          store.sections = store.sections.filter((entry) => entry !== row);
          return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
        }

        row.is_active = false;
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }

      return route.continue();
    },
  );

  return store;
}

/** The page's single live region, where every outcome is reported. */
const statusLine = (page) => page.getByTestId("directory-status");
const sectionPanel = (page) => page.getByRole("region", { name: "Sections" });
const adviserSelect = (page) => page.getByLabel("Adviser", { exact: true });
const dialogAlert = (page) => page.getByRole("dialog").getByRole("alert");

const editButton = (page, name) => page.getByRole("button", { name: `Edit ${name}`, exact: true });
const deleteButton = (page, name) =>
  page.getByRole("button", { name: `Delete ${name}`, exact: true });
const retireButton = (page, name) =>
  page.getByRole("button", { name: `Deactivate ${name}`, exact: true });

/** Creates a section through the real dialog and waits for it to land. */
async function addSection(page, name, adviser) {
  await page.getByRole("button", { name: "Add section", exact: true }).click();
  await page.getByLabel("Section Name").fill(name);
  if (adviser) await adviserSelect(page).selectOption(adviser);
  await page.getByRole("button", { name: "Add Section", exact: true }).click();

  await expect(editButton(page, name)).toBeVisible();
  return name;
}

/**
 * Brings the page's lists under the stub.
 *
 * The first paint is server-rendered, so the grade list, the section list and
 * the adviser choices are the deployment's until the page has re-read them.
 * One completed save is the workspace's own way of doing that.
 */
async function syncDirectory(page) {
  const seed = uniqueName("Sync");
  await addSection(page, seed);
  await retireButton(page, seed).click();
  await expect(statusLine(page)).toHaveText(`${seed} deactivated.`);
}

/** Opens a section's edit dialog. */
async function openEdit(page, name) {
  await editButton(page, name).click();
  await page.getByLabel("Section Name").waitFor();
}

describe("class sections workspace", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  // ─── The page is about sections, not grades ──────────────────────

  test("the workspace opens as Class Sections", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await expect(page.getByRole("heading", { name: "Class Sections" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sections", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
  });

  test("the sidebar calls the destination Class Sections", async ({ page }) => {
    await page.goto("/teacher/dashboard");

    const nav = page.getByRole("navigation", { name: "Workspace" });
    await expect(nav.getByRole("link", { name: "Class Sections" })).toBeVisible();
    await expect(nav.getByRole("link", { name: "Grades and Sections" })).toHaveCount(0);
  });

  test("the grade is context, not something to manage", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    // Shown once, as a badge.
    await expect(page.getByRole("main").getByText("Grade 6", { exact: true })).toBeVisible();

    // And nowhere as a control.
    await expect(page.getByRole("heading", { name: "Grade Level" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /grade/i })).toHaveCount(0);
    await expect(page.getByText("There is no second grade level")).toHaveCount(0);
  });

  test("a section name is not suffixed with the grade", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    const row = sectionPanel(page).getByRole("listitem").filter({ hasText: name });

    await expect(row).not.toContainText("(Grade 6)");
  });

  test("records outside Grade 6 never appear", async ({ page }) => {
    await stubDirectory(page, { grades: [GRADE_6, LEGACY_GRADE], sections: [LEGACY_SECTION] });
    await page.goto("/teacher/grades-sections");
    await addSection(page, uniqueName("Rizal QA"));

    await expect(page.getByRole("main")).not.toContainText("jayrold");
    await expect(page.getByRole("main")).not.toContainText("Grade 3");
    await expect(page.getByText("Outside the Grade 6 curriculum")).toHaveCount(0);
  });

  test("the dialog offers no grade field on create or on edit", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await page.getByRole("button", { name: "Add section", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Grade Level")).toHaveCount(0);
    // The adviser select is the only one; the grade is not a choice.
    await expect(dialog.locator("select")).toHaveCount(1);
    await page.keyboard.press("Escape");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await openEdit(page, name);
    await expect(page.getByRole("dialog").getByText("Grade Level")).toHaveCount(0);
    await expect(page.getByRole("dialog").locator("select")).toHaveCount(1);
  });

  test("a section request carries no grade at all", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const bodies = [];
    page.on("request", (request) => {
      if (!request.url().includes("/teacher-admin/sections")) return;
      if (request.method() !== "POST" && request.method() !== "PATCH") return;
      bodies.push(request.postDataJSON());
    });

    const name = await addSection(page, uniqueName("Rizal QA"));
    await openEdit(page, name);
    await page.getByLabel("Section Name").fill(`${name} renamed`);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();
    await expect(editButton(page, `${name} renamed`)).toBeVisible();

    expect(bodies.length).toBeGreaterThan(0);
    for (const body of bodies) {
      expect(body, "a request named a grade").not.toHaveProperty("grade_id");
    }
  });

  // ─── The section lifecycle ───────────────────────────────────────

  test("a section can be created, edited, and deactivated", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const created = await addSection(page, uniqueName("Rizal QA"));
    await expect(statusLine(page)).toHaveText(`${created} added.`);
    await expect(
      sectionPanel(page).getByRole("listitem").filter({ hasText: created }),
    ).toContainText("Active");

    const renamed = `${created} renamed`;
    await openEdit(page, created);
    await page.getByLabel("Section Name").fill(renamed);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();
    await expect(editButton(page, renamed)).toBeVisible();
    await expect(statusLine(page)).toHaveText(`${renamed} saved.`);

    await retireButton(page, renamed).click();
    await expect(statusLine(page)).toHaveText(`${renamed} deactivated.`);
    await expect(page.getByRole("listitem").filter({ hasText: renamed })).toContainText("Inactive");
    await expect(
      page.getByRole("button", { name: `Activate ${renamed}`, exact: true }),
    ).toBeVisible();
  });

  // ─── The adviser, which is where this module broke ───────────────

  test("a section is created with no adviser", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));

    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("No adviser");
    expect(store.sections.at(-1).adviser_id).toBeFalsy();
  });

  test("a section is created with an adviser chosen", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncDirectory(page);

    const name = await addSection(page, uniqueName("Rizal QA"), ADVISER_ONE);

    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText(
      "Adviser: Maria Santos",
    );
    // The id that travelled is the adviser profile's, not the account's.
    expect(store.sections.at(-1).adviser_id).toBe(ADVISER_ONE);
  });

  test("an adviser can be assigned, changed, and removed", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await syncDirectory(page);
    const name = await addSection(page, uniqueName("Rizal QA"));

    await openEdit(page, name);
    await adviserSelect(page).selectOption(ADVISER_ONE);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText(
      "Adviser: Maria Santos",
    );

    await openEdit(page, name);
    await adviserSelect(page).selectOption(ADVISER_TWO);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText(
      "Adviser: Jose Cruz",
    );

    await openEdit(page, name);
    await adviserSelect(page).selectOption("");
    await page.getByRole("button", { name: "Save Section", exact: true }).click();
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("No adviser");
    expect(store.sections.at(-1).adviser_id).toBeNull();
  });

  test("the adviser list offers the profile id a section points at", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");
    await syncDirectory(page);
    await page.getByRole("button", { name: "Add section", exact: true }).click();

    const values = await adviserSelect(page)
      .locator("option")
      .evaluateAll((options) => options.map((option) => option.value));

    expect(values).toContain(ADVISER_ONE);
    // The account id is a different value and must never be offered.
    expect(values).not.toContain("account-1");
  });

  test("an adviser the API rejects is reported, not swallowed", async ({ page }) => {
    await stubDirectory(page, { advisers: false });
    await page.goto("/teacher/grades-sections");

    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "POST") {
          return jsonReply(route, 422, {
            error: { code: "adviser_unknown", message: ADVISER_REFUSAL },
          });
        }
        return route.fallback();
      },
    );

    const typed = uniqueName("Rizal QA");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section Name").fill(typed);
    await page.getByRole("button", { name: "Add Section", exact: true }).click();

    await expect(dialogAlert(page)).toContainText("not an active Teacher/Administrator");
    // The person keeps their typing and the dialog stays open to correct it.
    await expect(page.getByLabel("Section Name")).toHaveValue(typed);
  });

  test("a network failure keeps the form and says something useful", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "POST") return route.abort("connectionrefused");
        return route.fallback();
      },
    );

    const typed = uniqueName("Rizal QA");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section Name").fill(typed);
    await page.getByRole("button", { name: "Add Section", exact: true }).click();

    await expect(dialogAlert(page)).toContainText("Service unavailable");
    await expect(page.getByLabel("Section Name")).toHaveValue(typed);
    // The retry path is the same button, still enabled.
    await expect(page.getByRole("button", { name: "Add Section", exact: true })).toBeEnabled();
  });

  test("a missing Grade 6 record stops section creation safely", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    // The API refuses rather than inventing a grade to hang the section off.
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "POST") {
          return jsonReply(route, 503, {
            error: {
              code: "mvp_grade_missing",
              message:
                "The Grade 6 record is missing from this deployment, so a section cannot be " +
                "created. Restore it from the database seed.",
            },
          });
        }
        return route.fallback();
      },
    );

    const typed = uniqueName("Rizal QA");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section Name").fill(typed);
    await page.getByRole("button", { name: "Add Section", exact: true }).click();

    await expect(dialogAlert(page)).toContainText("Grade 6 record is missing");
    await expect(page.getByLabel("Section Name")).toHaveValue(typed);
  });

  // ─── States and access ───────────────────────────────────────────

  test("a failed deactivation reports the problem and leaves the row alone", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

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

    await retireButton(page, name).click();

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

    const name = await addSection(page, uniqueName("Rizal QA"));

    await editButton(page, name).focus();
    await page.keyboard.press("Tab");

    const retire = retireButton(page, name);
    await expect(retire).toBeFocused();
    const ring = await retire.evaluate((node) => getComputedStyle(node).boxShadow);
    expect(ring, "the focused control shows no ring").not.toBe("none");

    await page.keyboard.press("Enter");
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
  });

  test("a busy deactivation disables its own control while it runs", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));

    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/sections"),
      async (route) => {
        if (route.request().method() === "DELETE") await held;
        return route.fallback();
      },
    );

    await retireButton(page, name).click();

    const pending = page.getByRole("button", { name: `Deactivating… ${name}`, exact: true });
    await expect(pending).toBeDisabled();
    await expect(statusLine(page)).toHaveText(`Deactivating ${name}…`);

    release();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
  });

  // ─── Deleting a retired section ──────────────────────────────────

  test("a live section offers no delete", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));

    await expect(deleteButton(page, name)).toHaveCount(0);
    await expect(retireButton(page, name)).toBeVisible();
  });

  test("a deactivated section offers delete", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await retireButton(page, name).click();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);

    await expect(deleteButton(page, name)).toBeVisible();
    await expect(deleteButton(page, name)).toHaveText(/Delete/);
  });

  test("deleting asks first, and keeping it changes nothing", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await retireButton(page, name).click();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);

    await deleteButton(page, name).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("there is no undo");
    await expect(dialog).toContainText(name);

    await dialog.getByRole("button", { name: "Keep it", exact: true }).click();
    await expect(dialog).toBeHidden();

    // Nothing was sent, and the row is still there.
    expect(store.sections.some((entry) => entry.name === name)).toBe(true);
    await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
  });

  test("confirming removes the section from the directory", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await retireButton(page, name).click();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);

    await deleteButton(page, name).click();
    await page.getByRole("button", { name: "Delete section", exact: true }).click();

    await expect(statusLine(page)).toHaveText(`${name} deleted.`);
    await expect(page.getByRole("listitem").filter({ hasText: name })).toHaveCount(0);
    expect(store.sections.some((entry) => entry.name === name)).toBe(false);
  });

  test("a section a learner still belongs to is refused, readably", async ({ page }) => {
    const store = await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await retireButton(page, name).click();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);

    // Three learners arrive between the page loading and the delete.
    const target = store.sections.find((entry) => entry.name === name);
    store.learners[target.section_id] = 3;

    await deleteButton(page, name).click();
    await page.getByRole("button", { name: "Delete section", exact: true }).click();

    // The refusal stays where the decision is being made.
    await expect(dialogAlert(page)).toContainText("3 learners still belong");
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(store.sections.some((entry) => entry.name === name)).toBe(true);
  });

  test("the delete dialog is reachable and dismissable from the keyboard", async ({ page }) => {
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    const name = await addSection(page, uniqueName("Rizal QA"));
    await retireButton(page, name).click();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);

    const trigger = deleteButton(page, name);
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  // ─── Every viewport ──────────────────────────────────────────────

  for (const viewport of VIEWPORTS) {
    test(`the workspace fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubDirectory(page, { grades: [GRADE_6, LEGACY_GRADE], sections: [LEGACY_SECTION] });
      await page.goto("/teacher/grades-sections");

      const name = await addSection(page, uniqueName("Rizal QA"));

      await expect(page.getByRole("heading", { name: "Class Sections" })).toBeVisible();

      const retire = retireButton(page, name);
      await expect(retire).toBeVisible();
      await expect(retire).toHaveText(/Deactivate/);

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

      for (const control of await page.getByRole("main").getByRole("button").all()) {
        if (!(await control.isVisible())) continue;
        const box = await control.boundingBox();
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
    await page.setViewportSize({ width: 320, height: 568 });
    await stubDirectory(page);
    await page.goto("/teacher/grades-sections");

    await page.getByRole("button", { name: "Add section", exact: true }).click();

    const field = page.getByLabel("Section Name");
    await expect(field).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Section", exact: true })).toBeVisible();

    const box = await field.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(16);
    expect(box.x + box.width).toBeLessThanOrEqual(304);
  });
});

/**
 * The same cycle against the real stack.
 *
 * This writes rows, so it runs only against the local Supabase the repository
 * ships, which `npm run db:reset` restores from the seed. It cleans up after
 * itself as far as the product allows: the section it creates is deactivated,
 * which is the only retirement the API offers — a real section carries learner
 * history, so there is deliberately no delete. The name is prefixed with E2E
 * so an interrupted run is still obvious as test data, and the cleanup runs
 * even when an assertion has already failed.
 */
const liveDescribe =
  hasAccount(TEACHER_ADMIN_ACCOUNT) && isLocalDataEnvironment()
    ? test.describe
    : test.describe.skip;

liveDescribe("class sections against the live directory", () => {
  test.skip(!isLocalDataEnvironment(), HOSTED_DATA_SKIP_REASON);

  test("a section created in the real directory survives a reload", async ({ page }) => {
    const created = uniqueName("E2E Section");

    try {
      await signIn(page, TEACHER_ADMIN_ACCOUNT);
      await page.waitForURL("**/teacher/dashboard");
      await page.goto("/teacher/grades-sections");

      await addSection(page, created);
      await expect(statusLine(page)).toHaveText(`${created} added.`);

      await page.reload();
      await expect(editButton(page, created)).toBeVisible();

      await retireButton(page, created).click();
      await expect(statusLine(page)).toHaveText(`${created} deactivated.`);

      await page.reload();
      await expect(page.getByRole("listitem").filter({ hasText: created })).toContainText(
        "Inactive",
      );
    } finally {
      await retireSection(page, created);
    }
  });

  test("an adviser can be assigned and removed against the real API", async ({ page }) => {
    const created = uniqueName("E2E Adviser");

    try {
      await signIn(page, TEACHER_ADMIN_ACCOUNT);
      await page.waitForURL("**/teacher/dashboard");
      await page.goto("/teacher/grades-sections");

      await addSection(page, created);

      await openEdit(page, created);
      const options = await adviserSelect(page)
        .locator("option")
        .evaluateAll((all) => all.map((option) => option.value).filter(Boolean));
      test.skip(options.length === 0, "no adviser in this directory");

      await adviserSelect(page).selectOption(options[0]);
      await page.getByRole("button", { name: "Save Section", exact: true }).click();
      await expect(dialogAlert(page)).toHaveCount(0);
      await expect(page.getByRole("listitem").filter({ hasText: created })).toContainText(
        "Adviser:",
      );

      await openEdit(page, created);
      await adviserSelect(page).selectOption("");
      await page.getByRole("button", { name: "Save Section", exact: true }).click();
      await expect(page.getByRole("listitem").filter({ hasText: created })).toContainText(
        "No adviser",
      );
    } finally {
      await retireSection(page, created);
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
async function retireSection(page, name) {
  try {
    await page.goto("/teacher/grades-sections");
    const retire = retireButton(page, name);
    if ((await retire.count()) > 0) {
      await retire.first().click();
      await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
    }
  } catch {
    // Never fail a run on cleanup alone; say what is left instead.
    console.warn(`Could not retire the test section ${name}; retire it by hand.`);
  }
}
