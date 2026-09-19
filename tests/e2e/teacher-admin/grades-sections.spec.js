import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";
import { HOSTED_DATA_SKIP_REASON, isLocalDataEnvironment } from "../support/environment";

/**
 * Behavioural cover for the Grades & Sections workspace.
 *
 * The create/edit/deactivate cycle runs against an intercepted directory API.
 * The interface under test is the real one — the real dialogs, the real client
 * transport, the real refresh after a save — but the rows live in the test's
 * own store, so the cycle can be exercised on any deployment without leaving a
 * grade or a section behind in real school data. The live-stack block at the
 * end repeats the same cycle against the repository's local Supabase, and
 * skips anywhere else.
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
];

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

/**
 * Stands the directory API up in memory for one page.
 *
 * It answers the same envelopes the MathSmart API documents — `{data: …}` on a
 * read or a save, `204` on a deactivation — so the client transport is
 * exercised exactly as it is in production.
 *
 * @returns {{grades: Array, sections: Array}} the store the page is now reading
 */
async function stubDirectory(page, { grades = [], sections = [] } = {}) {
  const store = { grades: [...grades], sections: [...sections] };

  await page.route(
    (url) =>
      url.pathname.includes("/teacher-admin/grades") ||
      url.pathname.includes("/teacher-admin/sections"),
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
      const row = id ? collection.find((entry) => entry[idKey] === id) : null;

      if (method === "GET") {
        return jsonReply(route, 200, { data: collection });
      }

      if (method === "POST") {
        const body = request.postDataJSON();
        const created = {
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
        Object.assign(row, request.postDataJSON());
        return jsonReply(route, 200, { data: row });
      }

      if (method === "DELETE") {
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

/** Creates a grade through the real dialog and waits for it to land. */
async function addGrade(page, name) {
  await page.getByRole("button", { name: "Add grade", exact: true }).click();
  await page.getByLabel("Grade Name").fill(name);
  await page.getByLabel("Level", { exact: true }).selectOption("6");
  await page.getByRole("button", { name: "Add Grade", exact: true }).click();

  await expect(page.getByRole("button", { name: `Edit ${name}` })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Grade Levels" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Class Sections" })).toBeVisible();
  });

  test("every row says what its second action does instead of showing a bare icon", async ({
    page,
  }) => {
    await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    const name = await addGrade(page, uniqueName("Grade 6 QA"));

    const deactivate = page.getByRole("button", { name: `Deactivate ${name}` });
    await expect(deactivate).toBeVisible();
    // The word itself has to be on screen; an icon alone is what this replaced.
    await expect(deactivate).toHaveText(/Deactivate/);
    await expect(page.getByRole("button", { name: `Edit ${name}` })).toHaveText(/Edit/);
  });

  test("a grade level can be created, edited, and deactivated", async ({ page }) => {
    await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    const created = uniqueName("Grade 6 QA");
    await addGrade(page, created);

    const row = page.getByRole("listitem").filter({ hasText: created });
    await expect(row).toContainText("Active");
    await expect(statusLine(page)).toHaveText(`${created} added.`);

    // Edit
    const renamed = `${created} renamed`;
    await page.getByRole("button", { name: `Edit ${created}` }).click();
    await page.getByLabel("Grade Name").fill(renamed);
    await page.getByRole("button", { name: "Save Grade", exact: true }).click();

    await expect(page.getByRole("button", { name: `Edit ${renamed}` })).toBeVisible();
    await expect(statusLine(page)).toHaveText(`${renamed} saved.`);

    // Deactivate
    await page.getByRole("button", { name: `Deactivate ${renamed}` }).click();

    await expect(statusLine(page)).toHaveText(`${renamed} deactivated.`);
    const deactivated = page.getByRole("listitem").filter({ hasText: renamed });
    await expect(deactivated).toContainText("Inactive");
    // The state is legible after the operation: the same control now offers
    // the way back, so the row is not merely gone.
    await expect(page.getByRole("button", { name: `Activate ${renamed}` })).toBeVisible();
  });

  test("a class section can be created under its grade, edited, and deactivated", async ({
    page,
  }) => {
    await stubDirectory(page, { grades: [], sections: [] });
    await page.goto("/teacher/grades-sections");

    // A section needs a grade to belong to, and the dialog offers the grades
    // the page currently holds.
    const gradeName = await addGrade(page, uniqueName("Grade 6 QA"));

    const sectionName = uniqueName("Rizal QA");
    await page.getByRole("button", { name: "Add section", exact: true }).click();
    await page.getByLabel("Section Name").fill(sectionName);
    await page.getByLabel("Grade Level").selectOption({ label: gradeName });
    await page.getByRole("button", { name: "Add Section", exact: true }).click();

    const rowLabel = `${sectionName} (${gradeName})`;
    await expect(page.getByRole("button", { name: `Edit ${rowLabel}` })).toBeVisible();
    await expect(statusLine(page)).toHaveText(`${sectionName} added.`);
    await expect(page.getByRole("listitem").filter({ hasText: sectionName })).toContainText(
      "No adviser",
    );

    // Edit
    const renamed = `${sectionName} renamed`;
    await page.getByRole("button", { name: `Edit ${rowLabel}` }).click();
    await page.getByLabel("Section Name").fill(renamed);
    await page.getByRole("button", { name: "Save Section", exact: true }).click();

    const renamedLabel = `${renamed} (${gradeName})`;
    await expect(page.getByRole("button", { name: `Edit ${renamedLabel}` })).toBeVisible();

    // Deactivate
    await page.getByRole("button", { name: `Deactivate ${renamedLabel}` }).click();

    await expect(statusLine(page)).toHaveText(`${renamed} deactivated.`);
    await expect(page.getByRole("listitem").filter({ hasText: renamed })).toContainText("Inactive");
    await expect(page.getByRole("button", { name: `Activate ${renamedLabel}` })).toBeVisible();
  });

  test("a refused save keeps the dialog open and says why", async ({ page }) => {
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/grades"),
      async (route) => {
        if (route.request().method() === "OPTIONS") {
          return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
        }
        if (route.request().method() === "POST") {
          return jsonReply(route, 422, {
            error: { code: "validation_error", message: "That grade level already exists." },
          });
        }
        return jsonReply(route, 200, { data: [] });
      },
    );
    await page.goto("/teacher/grades-sections");

    await page.getByRole("button", { name: "Add grade", exact: true }).click();
    await page.getByLabel("Grade Name").fill(uniqueName("Grade 6 QA"));
    await page.getByRole("button", { name: "Add Grade", exact: true }).click();

    // Scoped to the dialog, because Next's route announcer is also an alert.
    await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(
      "That grade level already exists.",
    );
    // The person keeps their typing and the dialog stays open to correct it.
    await expect(page.getByLabel("Grade Name")).toBeVisible();
  });

  test("a failed deactivation reports the problem and leaves the row alone", async ({ page }) => {
    const store = await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    const name = await addGrade(page, uniqueName("Grade 6 QA"));
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Active");

    // Refuse only the deactivation, ahead of the store's own handler.
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/grades"),
      async (route) => {
        if (route.request().method() === "DELETE") {
          return jsonReply(route, 409, {
            error: { message: "This grade still has active sections." },
          });
        }
        return route.fallback();
      },
    );

    await page.getByRole("button", { name: `Deactivate ${name}` }).click();

    // Scoped to the workspace, because Next's route announcer is also an alert.
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      "This grade still has active sections.",
    );
    await expect(page.getByRole("listitem").filter({ hasText: name })).toContainText("Active");
    expect(store.grades[0].is_active).toBe(true);
  });

  test("the whole row can be reached and operated from the keyboard alone", async ({ page }) => {
    await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    const name = await addGrade(page, uniqueName("Grade 6 QA"));

    const deactivate = page.getByRole("button", { name: `Deactivate ${name}` });
    await page.getByRole("button", { name: `Edit ${name}` }).focus();
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
    await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    const name = await addGrade(page, uniqueName("Grade 6 QA"));

    // Hold the deactivation open so the pending state can be observed.
    let release;
    const held = new Promise((resolve) => {
      release = resolve;
    });
    await page.route(
      (url) => url.pathname.includes("/teacher-admin/grades"),
      async (route) => {
        if (route.request().method() === "DELETE") {
          await held;
        }
        return route.fallback();
      },
    );

    const deactivate = page.getByRole("button", { name: `Deactivate ${name}` });
    await deactivate.click();

    const pending = page.getByRole("button", { name: `Deactivating… ${name}` });
    await expect(pending).toBeDisabled();
    await expect(pending).toHaveText(/Deactivating/);
    await expect(statusLine(page)).toHaveText(`Deactivating ${name}…`);

    release();
    await expect(statusLine(page)).toHaveText(`${name} deactivated.`);
  });

  for (const viewport of VIEWPORTS) {
    test(`the workspace fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await stubDirectory(page, { grades: [] });
      await page.goto("/teacher/grades-sections");

      const name = await addGrade(page, uniqueName("Grade 6 QA"));

      await expect(page.getByRole("heading", { name: "Grades and Sections" })).toBeVisible();

      // The action wording survives the width; it is not clipped away.
      const deactivate = page.getByRole("button", { name: `Deactivate ${name}` });
      await expect(deactivate).toBeVisible();
      await expect(deactivate).toHaveText(/Deactivate/);

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
      );
      expect(overflows, `the page scrolls sideways at ${viewport.width}px`).toBe(false);

      // The row truncates its name, so the name has to keep enough room to say
      // something. Half the panel is generous; a crushed row leaves it at zero.
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
        expect(
          box.x + box.width,
          "a control runs past the right edge",
        ).toBeLessThanOrEqual(viewport.width + 1);
        expect(box.height, "a control is too short to tap").toBeGreaterThanOrEqual(24);
      }
    });
  }

  test("the create dialog stays usable on a small phone", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await stubDirectory(page, { grades: [] });
    await page.goto("/teacher/grades-sections");

    await page.getByRole("button", { name: "Add grade", exact: true }).click();

    const field = page.getByLabel("Grade Name");
    await expect(field).toBeVisible();
    await expect(page.getByRole("button", { name: "Add Grade", exact: true })).toBeVisible();

    const box = await field.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  });
});

/**
 * The same cycle against the real stack.
 *
 * This writes rows, so it runs only against the local Supabase the repository
 * ships. The rows it creates are left deactivated, which is the only retirement
 * the API offers — there is no delete — and they are named so they are obvious
 * as test data.
 */
const liveDescribe =
  hasAccount(TEACHER_ADMIN_ACCOUNT) && isLocalDataEnvironment()
    ? test.describe
    : test.describe.skip;

liveDescribe("grades and sections against the live directory", () => {
  test.skip(!isLocalDataEnvironment(), HOSTED_DATA_SKIP_REASON);

  test("a grade level created in the real directory survives a reload", async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
    await page.goto("/teacher/grades-sections");

    const created = uniqueName("Grade 6 E2E");
    await addGrade(page, created);
    await expect(statusLine(page)).toHaveText(`${created} added.`);

    await page.reload();
    await expect(page.getByRole("button", { name: `Edit ${created}` })).toBeVisible();

    // Retire it again, which is this test's only cleanup path.
    await page.getByRole("button", { name: `Deactivate ${created}` }).click();
    await expect(statusLine(page)).toHaveText(`${created} deactivated.`);

    await page.reload();
    await expect(page.getByRole("listitem").filter({ hasText: created })).toContainText("Inactive");
  });
});
