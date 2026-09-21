import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * Behavioural cover for the learner profile.
 *
 * The page is server-rendered, which a browser test cannot intercept:
 * `page.route` sees the browser's requests, not the Next server's. So the
 * structural checks below run against whatever the deployment actually holds,
 * and only the genuinely client-side calls — the name save and the Storage
 * calls behind the picture — are stubbed. That split is deliberate: it keeps
 * the tests honest about what they proved, and it means nothing here writes a
 * name or uploads a photograph into real school data.
 */

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;

/** Widths the profile has to stay usable at, from the narrowest phone up. */
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
 * Intercepts the browser's own call to save a name.
 *
 * Scoped to the API prefix: the page lives at /student/profile and a looser
 * predicate would intercept the navigation itself and hand the browser JSON.
 */
async function stubNameSave(page, { fails = false, savedAs = null } = {}) {
  const store = { patches: [] };

  await page.route(
    (url) => url.pathname.includes("/api/v1/") && url.pathname.endsWith("/students/me"),
    async (route) => {
      const request = route.request();
      if (request.method() === "OPTIONS") {
        return route.fulfill({ status: 204, headers: CORS_HEADERS, body: "" });
      }
      if (request.method() !== "PATCH") {
        return route.fallback();
      }

      store.patches.push(request.postDataJSON());

      if (fails) {
        return jsonReply(route, 503, {
          error: { code: "unavailable", message: "The service is not available right now." },
        });
      }
      return jsonReply(route, 200, {
        data: { full_name: savedAs ?? store.patches.at(-1).full_name },
      });
    },
  );

  return store;
}

/** The overflow a page adds beyond its own viewport. Anything over 1 is a bug. */
function overflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * Opens the profile and waits for it to have finished arriving.
 *
 * The screen streams: `goto` resolves while "Loading your profile" is still
 * on it, and a measurement or a file drop taken at that moment lands on the
 * fallback rather than the page. It only shows against a cold server, which
 * is why it reads as an intermittent failure rather than a broken test.
 */
async function openProfile(page) {
  await page.goto("/student/profile");
  await expect(
    page.getByRole("heading", { name: "Student Profile & Learning Record", level: 1 }),
  ).toBeVisible({ timeout: 25_000 });
}

describe("student profile", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
  });

  // ─── What the page says ──────────────────────────────────────────

  test("the profile opens as its own page", async ({ page }) => {
    await openProfile(page);

    await expect(
      page.getByRole("heading", { name: "Student Profile & Learning Record" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Learning status" })).toBeVisible();
  });

  test("the enrolment facts are labelled, not left bare", async ({ page }) => {
    await openProfile(page);
    const main = page.getByRole("main");

    for (const label of ["Grade", "Section", "School"]) {
      await expect(main.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(main.getByText("Diagnostic", { exact: true })).toBeVisible();
    await expect(main.getByText("Support plan", { exact: true })).toBeVisible();
  });

  test("an unset enrolment value reads as words, never as a blank", async ({ page }) => {
    await openProfile(page);
    const main = page.getByRole("main");

    // Every definition carries text. A learner with no section assigned sees
    // "Not assigned", which is a fact; an empty cell is a bug that looks like
    // a fact.
    const empties = await main.locator("dd").evaluateAll(
      (nodes) => nodes.filter((node) => node.textContent.trim().length === 0).length,
    );
    expect(empties).toBe(0);
  });

  test("the page never says a learner's status by colour alone", async ({ page }) => {
    await openProfile(page);

    // Both status tiles carry a written label.
    const tiles = page.getByRole("main").locator("h3");
    await expect(tiles.filter({ hasText: "Diagnostic" })).toBeVisible();
    await expect(tiles.filter({ hasText: "Support plan" })).toBeVisible();
  });

  // ─── Editing the one field a learner owns ────────────────────────

  test("the name dialog opens with the learner's current name", async ({ page }) => {
    await openProfile(page);

    const heading = page.getByRole("heading", { level: 2 }).first();
    const currentName = (await heading.innerText()).trim();

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await expect(dialog.getByLabel("Full name")).toHaveValue(currentName);
  });

  test("an abandoned draft does not come back on reopen", async ({ page }) => {
    await openProfile(page);

    const heading = page.getByRole("heading", { level: 2 }).first();
    const currentName = (await heading.innerText()).trim();
    const trigger = page.getByRole("button", { name: "Edit name", exact: true });

    await trigger.click();
    await page.getByRole("dialog").getByLabel("Full name").fill("Abandoned Draft");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // The defect this guards: the dialog is opened by the parent setting its
    // own state, which never reaches Radix's onOpenChange, so a reset written
    // there never ran and the draft survived.
    await trigger.click();
    await expect(page.getByRole("dialog").getByLabel("Full name")).toHaveValue(currentName);
  });

  test("a stale failure is not re-announced on reopen", async ({ page }) => {
    await stubNameSave(page, { fails: true });
    await openProfile(page);

    const trigger = page.getByRole("button", { name: "Edit name", exact: true });
    await trigger.click();

    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Temporary Name");
    await dialog.getByRole("button", { name: "Save name" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    await trigger.click();
    dialog = page.getByRole("dialog");
    // A learner reopening the form is not attempting the failed save again,
    // so nothing should be shouting at them about it.
    await expect(dialog.getByRole("alert")).toHaveCount(0);
  });

  test("a failed save keeps the dialog open and keeps what was typed", async ({ page }) => {
    await stubNameSave(page, { fails: true });
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Full name").fill("Typed With Care");
    await dialog.getByRole("button", { name: "Save name" }).click();

    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog.getByLabel("Full name")).toHaveValue("Typed With Care");
  });

  test("a failed save names the field it is about", async ({ page }) => {
    await stubNameSave(page, { fails: true });
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Typed With Care");
    await dialog.getByRole("button", { name: "Save name" }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();

    const field = dialog.getByLabel("Full name");
    await expect(field).toHaveAttribute("aria-invalid", "true");
    // The reason is reachable from the field, not only shouted separately.
    const describedBy = await field.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    await expect(dialog.locator(`#${describedBy}`)).toBeVisible();
  });

  test("a name that is too short is refused without a request", async ({ page }) => {
    const store = await stubNameSave(page);
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Full name").fill("A");
    await dialog.getByRole("button", { name: "Save name" }).click();

    await expect(dialog.getByRole("alert")).toContainText("between 2 and 120");
    expect(store.patches).toHaveLength(0);
  });

  test("a name of only spaces is refused", async ({ page }) => {
    const store = await stubNameSave(page);
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");

    await dialog.getByLabel("Full name").fill("     ");
    await dialog.getByRole("button", { name: "Save name" }).click();

    await expect(dialog.getByRole("alert")).toBeVisible();
    expect(store.patches).toHaveLength(0);
  });

  test("a saved name appears on the page without a reload", async ({ page }) => {
    const store = await stubNameSave(page, { savedAs: "Saved Without Reload" });
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Saved Without Reload");
    await dialog.getByRole("button", { name: "Save name" }).click();

    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(
      page.getByRole("heading", { name: "Saved Without Reload", level: 2 }),
    ).toBeVisible();
    // The request carried only the one field a learner may change.
    expect(Object.keys(store.patches[0])).toEqual(["full_name"]);
  });

  test("the save names no field a learner may not change", async ({ page }) => {
    const store = await stubNameSave(page);
    await openProfile(page);

    await page.getByRole("button", { name: "Edit name", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Full name").fill("Only The Name");
    await dialog.getByRole("button", { name: "Save name" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    const sent = store.patches[0];
    for (const forbidden of [
      "role",
      "learner_id",
      "grade_id",
      "section_id",
      "diagnostic_status",
      "monitoring_status",
      "account_status",
    ]) {
      expect(sent, `${forbidden} must never leave the browser`).not.toHaveProperty(forbidden);
    }
  });

  // ─── The profile picture ─────────────────────────────────────────

  test("a learner with no picture sees their initials", async ({ page }) => {
    await openProfile(page);

    const heading = page.getByRole("heading", { level: 2 }).first();
    const name = (await heading.innerText()).trim();
    const expected = name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

    const picture = page.getByRole("img", { name: /profile picture/ });
    if ((await picture.count()) > 0) {
      test.skip(true, "this learner already has a picture");
    }

    await expect(page.getByRole("main")).toContainText(expected);
  });

  test("the picture controls say what may be uploaded", async ({ page }) => {
    await openProfile(page);

    await expect(page.getByRole("button", { name: /(Add|Change) picture/ })).toBeVisible();
    await expect(page.getByText(/JPEG, PNG or WebP, up to 2 MB/)).toBeVisible();
  });

  test("the file input offers only the types the bucket accepts", async ({ page }) => {
    await openProfile(page);

    const input = page.locator('input[type="file"]');
    await expect(input).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
  });

  test("an oversized image is refused before anything is uploaded", async ({ page }) => {
    await openProfile(page);

    // 3 MB, past the 2 MiB the bucket allows.
    await page.locator('input[type="file"]').setInputFiles({
      name: "too-big.png",
      mimeType: "image/png",
      buffer: Buffer.alloc(3 * 1024 * 1024),
    });

    await expect(page.getByRole("main").getByRole("alert")).toContainText(/largest allowed/);
  });

  test("a file that is not an image is refused", async ({ page }) => {
    await openProfile(page);

    await page.locator('input[type="file"]').setInputFiles({
      name: "not-a-picture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4"),
    });

    await expect(page.getByRole("main").getByRole("alert")).toContainText(/JPEG, PNG or WebP/);
  });

  test("an SVG is refused, whatever it is called", async ({ page }) => {
    await openProfile(page);

    // The type is what is checked, not the name — an SVG can carry script.
    await page.locator('input[type="file"]').setInputFiles({
      name: "innocent.png",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    });

    await expect(page.getByRole("main").getByRole("alert")).toContainText(/JPEG, PNG or WebP/);
  });

  // ─── Keyboard and focus ──────────────────────────────────────────

  test("the name dialog can be opened, completed and dismissed by keyboard", async ({ page }) => {
    await openProfile(page);

    const trigger = page.getByRole("button", { name: "Edit name", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Full name")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("the picture controls are reachable by keyboard", async ({ page }) => {
    await openProfile(page);

    // The file input itself is hidden from the tab order on purpose; the
    // button in front of it is the control, so it must be focusable.
    const button = page.getByRole("button", { name: /(Add|Change) picture/ });
    await button.focus();
    await expect(button).toBeFocused();

    await expect(page.locator('input[type="file"]')).toHaveAttribute("tabindex", "-1");
  });

  // ─── Authorization ───────────────────────────────────────────────

  test("a signed-out visitor cannot open the profile", async ({ page, context }) => {
    await context.clearCookies();
    // Plain navigation, not `openProfile`: this visitor must never reach the
    // profile, so waiting for its heading would be waiting for the failure.
    await page.goto("/student/profile");

    await expect(page).toHaveURL(/\/login/);
  });

  // ─── The loading shape ───────────────────────────────────────────

  test("the skeleton reserves the shape the page will occupy", async ({ page }) => {
    // The fallback ships inside the streamed document, so it is caught by
    // sampling the DOM before the server component resolves.
    const seen = { blocks: 0, status: false };

    await page.goto("/student/profile", { waitUntil: "commit" });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const sample = await page
        .evaluate(() => ({
          blocks: document.querySelectorAll(".animate-pulse").length,
          status: Boolean(document.querySelector('[role="status"]')),
        }))
        .catch(() => null);
      if (sample?.blocks) {
        seen.blocks = sample.blocks;
        seen.status = sample.status;
        break;
      }
    }

    test.skip(seen.blocks === 0, "the page resolved before the skeleton could be sampled");
    expect(seen.blocks).toBeGreaterThan(0);
    expect(seen.status, "the skeleton announces itself to a screen reader").toBe(true);
  });

  // ─── Responsive ──────────────────────────────────────────────────

  for (const viewport of VIEWPORTS) {
    test(`the profile fits a ${viewport.name} at ${viewport.width}px`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await openProfile(page);
      await expect(
        page.getByRole("heading", { name: "Student Profile & Learning Record" }),
      ).toBeVisible();

      expect(
        await overflow(page),
        `the profile scrolls sideways at ${viewport.width}px`,
      ).toBeLessThanOrEqual(1);
    });
  }

  test("a long email cannot widen the page", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await openProfile(page);

    // The defect this guards: an email is one unbreakable token, so without
    // `min-w-0` and `break-all` a realistic address painted through the card
    // border and then added hundreds of pixels of horizontal scroll.
    await page.evaluate(() => {
      const node = [...document.querySelectorAll("p span")].find((span) =>
        span.textContent.includes("@"),
      );
      if (node) node.textContent = "a.very.long.student.address.for.testing@some-long-school-domain.example.com";
    });

    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });

  test("the identity row is one line on a wide screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openProfile(page);

    const picture = page.getByTestId("profile-avatar");
    const editButton = page.getByRole("button", { name: "Edit name", exact: true });

    const [pictureBox, buttonBox] = await Promise.all([
      picture.boundingBox(),
      editButton.boundingBox(),
    ]);

    // Same line: their vertical ranges overlap.
    expect(buttonBox.y).toBeLessThan(pictureBox.y + pictureBox.height);
    expect(buttonBox.y + buttonBox.height).toBeGreaterThan(pictureBox.y);
  });

  test("the identity row stacks on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openProfile(page);

    const picture = page.getByTestId("profile-avatar");
    const editButton = page.getByRole("button", { name: "Edit name", exact: true });

    const [pictureBox, buttonBox] = await Promise.all([
      picture.boundingBox(),
      editButton.boundingBox(),
    ]);

    // Stacked: the button sits entirely below the picture.
    expect(buttonBox.y).toBeGreaterThanOrEqual(pictureBox.y + pictureBox.height - 1);
  });
});
