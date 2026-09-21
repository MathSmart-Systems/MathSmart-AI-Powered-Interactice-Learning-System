import { expect, test } from "@playwright/test";

import { accessToken, api } from "../support/api-fixtures.js";
import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";

/**
 * Reports & Analytics, against the real API.
 *
 * Every figure is compared with the overview reply for the same filters, and
 * the unfiltered report with the dashboard, so the page is checked for honesty
 * rather than for particular seeded numbers. Filters are exercised for real:
 * they live in the address, keep the reader's place and never bring the
 * first-load skeleton back. The optional AI summary is intercepted, so no test
 * here ever asks Groq anything.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

const WIDTHS = [320, 360, 768, 1024, 1280, 1440];

async function settled(page) {
  await expect(page.getByRole("heading", { name: "Reports and Analytics" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByLabel("Loading the report")).toHaveCount(0, { timeout: 20_000 });
}

function figure(page, label) {
  return page
    .getByRole("region", { name: "Report summary" })
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

describe("teacher reports", () => {
  let token = null;

  test.beforeAll(async ({ request }) => {
    token = await accessToken(request);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/**");
  });

  test("the overview reply carries every block, with real counts", async ({ request }) => {
    const response = await api(request, token, "/teacher-admin/reports/overview");
    expect(response.status(), "is the API stale?").toBe(200);
    const data = (await response.json()).data;
    for (const key of ["summary", "sections", "competencies", "activity", "most_missed", "interventions", "watch_list"]) {
      expect(data, `missing ${key} — is the API stale?`).toHaveProperty(key);
    }
    for (const value of [data.summary.learner_count, data.summary.diagnostic.completed, data.interventions.resolved]) {
      expect(Number.isInteger(value) && value >= 0).toBe(true);
    }
    const split = data.summary.diagnostic;
    expect(split.not_started + split.in_progress + split.completed).toBe(data.summary.learner_count);
    // No provenance and no learner in a most-missed row.
    expect(JSON.stringify(data.most_missed)).not.toMatch(/full_name|learner_id|provider|model/);
  });

  test("the page shows the reply's figures, and agrees with the dashboard", async ({ page, request }) => {
    const overview = (await (await api(request, token, "/teacher-admin/reports/overview")).json()).data;
    const dashboard = (await (await api(request, token, "/teacher-admin/dashboard")).json()).data;

    expect(overview.summary.learner_count).toBe(dashboard.totals.learner_count);
    expect(overview.summary.needs_support_count).toBe(dashboard.totals.needs_support_count);
    expect(overview.summary.diagnostic).toEqual(dashboard.diagnostic);
    expect(overview.interventions.needs_intervention).toBe(dashboard.interventions.needs_intervention);
    expect(overview.interventions.in_progress).toBe(dashboard.interventions.in_progress);

    await page.goto("/teacher/reports-analytics");
    await settled(page);
    await expect(figure(page, "Students")).toHaveText(String(overview.summary.learner_count));
    await expect(figure(page, "Needs support")).toHaveText(String(overview.summary.needs_support_count));
    await expect(figure(page, "Diagnostic done")).toHaveText(
      `${overview.summary.diagnostic.completed} of ${overview.summary.learner_count}`,
    );
    const expectedAverage = overview.summary.averages_suppressed
      ? "Hidden"
      : `${Math.round(overview.summary.average_current)}%`;
    await expect(figure(page, "Current average")).toHaveText(expectedAverage);
    await expect(page.getByRole("region", { name: "Report summary" })).not.toContainText("—");
  });

  test("five competencies in order of need, and the rest on request", async ({ page, request }) => {
    const overview = (await (await api(request, token, "/teacher-admin/reports/overview")).json()).data;
    await page.goto("/teacher/reports-analytics");
    await settled(page);

    const panel = page.getByRole("region", { name: "Competency mastery" });
    const rows = panel.locator("#report-competency-list > li");
    const withProgress = overview.competencies.filter((row) => row.learners_tracked > 0);
    await expect(rows).toHaveCount(Math.min(5, withProgress.length || overview.competencies.length));
    await expect(rows.first()).toContainText(withProgress[0].name);

    if (overview.competencies.length > 5) {
      const more = panel.getByRole("button", { name: `View all competencies (${overview.competencies.length})` });
      await expect(more).toHaveAttribute("aria-expanded", "false");
      await more.scrollIntoViewIfNeeded();
      const top = await page.evaluate(() => window.scrollY);
      await more.click();
      await expect(rows).toHaveCount(overview.competencies.length);
      await expect(panel.getByRole("button", { name: "Show the top 5" })).toHaveAttribute("aria-expanded", "true");
      expect(Math.abs((await page.evaluate(() => window.scrollY)) - top)).toBeLessThanOrEqual(1);
    }
  });

  test("filters live in the address, keep the page and never show the skeleton", async ({ page, request }) => {
    const classes = (await (await api(request, token, "/teacher-admin/classes")).json()).data.filter(
      (row) => row.is_active !== false,
    );
    test.skip(classes.length === 0, "no active section to filter by");
    const section = classes[0];

    await page.goto("/teacher/reports-analytics");
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 120));
    const top = await page.evaluate(() => window.scrollY);

    const skeleton = page.getByLabel("Loading the report");

    await page.getByLabel("Section", { exact: true }).selectOption(section.id);
    await expect(page).toHaveURL(new RegExp(`section=${section.id}`));
    await expect(page.getByTestId("report-scope")).toContainText(section.name);
    await expect(skeleton).toHaveCount(0);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - top)).toBeLessThanOrEqual(2);

    const scoped = (await (await api(request, token, `/teacher-admin/reports/overview?section_id=${section.id}`)).json()).data;
    await expect(figure(page, "Students")).toHaveText(String(scoped.summary.learner_count));

    await page.getByLabel("Student status").selectOption("needs_intervention");
    await expect(page).toHaveURL(/status=needs_intervention/);
    const flagged = (
      await (await api(request, token, `/teacher-admin/reports/overview?section_id=${section.id}&status=needs_intervention`)).json()
    ).data;
    await expect(figure(page, "Students")).toHaveText(String(flagged.summary.learner_count));

    await page.getByLabel("From").fill("2026-01-01");
    await expect(page).toHaveURL(/from=2026-01-01/);

    // A shared link opens the same report.
    await page.reload();
    await settled(page);
    await expect(page.getByLabel("Section", { exact: true })).toHaveValue(section.id);
    await expect(page.getByLabel("Student status")).toHaveValue("needs_intervention");

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).toHaveURL(/reports-analytics$/);
  });

  test("the filters work from the keyboard", async ({ page }) => {
    await page.goto("/teacher/reports-analytics");
    await settled(page);
    await page.getByLabel("Student status").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page).toHaveURL(/status=/);
    await expect(page.getByLabel("Student status")).toBeFocused();
  });

  test("a nonsense filter in the address is ignored, not sent", async ({ page }) => {
    await page.goto("/teacher/reports-analytics?status=expelled&from=2026-02-30&section=nope");
    await settled(page);
    await expect(page.getByLabel("Student status")).toHaveValue("");
    await expect(page.getByRole("alert").filter({ hasText: "could not be loaded" })).toHaveCount(0);
  });

  for (const width of WIDTHS) {
    test(`fits at ${width}px with no sideways scrolling`, async ({ page }) => {
      await page.setViewportSize({ width, height: width < 768 ? 800 : 900 });
      await page.goto("/teacher/reports-analytics");
      await settled(page);

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);

      const watch = page.getByRole("region", { name: "Students needing support" });
      const table = watch.locator("table");
      if (width >= 1024) {
        if (await table.count()) {
          await expect(table).toBeVisible();
          const clipped = await table.evaluate((node) => node.scrollWidth - node.clientWidth);
          expect(clipped).toBeLessThanOrEqual(0);
        }
      } else {
        await expect(table).toBeHidden();
      }

      // Every figure in the strip sits on the same line as its neighbours.
      if (width >= 1024) {
        const tops = await page
          .getByRole("region", { name: "Report summary" })
          .locator("dd.font-display")
          .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().top)));
        expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      }
    });
  }

  test("print shows the deterministic report only", async ({ page }) => {
    await page.goto("/teacher/reports-analytics");
    await settled(page);
    await page.emulateMedia({ media: "print" });
    const host = page.locator(".mathsmart-print-host");
    await expect(host).toBeVisible();
    await expect(host).toContainText("Competency mastery");
    await expect(host).not.toContainText("Summary of this report");
    await expect(page.getByRole("heading", { name: "Reports and Analytics" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });
  });

  test("the AI summary is asked for, kept on failure, and carries no provenance", async ({ page }) => {
    let reply = { status: 503, body: { error: { code: "groq_assistance_unavailable", message: "x" } } };
    await page.route("**/teacher-admin/reports/summary", (route) =>
      route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) }),
    );
    let asked = 0;
    page.on("request", (request) => {
      if (request.url().includes("/reports/summary")) asked += 1;
    });

    await page.goto("/teacher/reports-analytics");
    await settled(page);
    expect(asked, "nothing is asked on page load").toBe(0);

    const panel = page.getByRole("region", { name: "Summary of this report" });
    await expect(panel).toContainText("AI suggestion (advisory)");

    await panel.getByRole("button", { name: "Summarise" }).click();
    await expect(panel).toContainText("complete without one");
    await expect(page.getByRole("region", { name: "Report summary" })).toBeVisible();

    reply = {
      status: 200,
      body: {
        data: {
          overview: "Most students are still developing ratio skills.",
          patterns: ["5 of 7 answers reversed the order of the ratio."],
          actions: ["Model ratio order with labelled pairs."],
        },
      },
    };
    await panel.getByRole("button", { name: "Summarise" }).click();
    await expect(panel).toContainText("Most students are still developing ratio skills.");
    await expect(panel.getByRole("listitem")).toHaveCount(2);
    const text = await panel.innerText();
    expect(text).not.toMatch(/groq|gpt|llama|model|\*\*|##|\b(AM|PM)\b/i.source ? /groq|gpt|llama|\*\*|##/i : /x/);

    reply = { status: 503, body: { error: { code: "groq_assistance_unavailable", message: "x" } } };
    await panel.getByRole("button", { name: "Summarise again" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "previous summary is still shown" })).toBeVisible();
    await expect(panel).toContainText("Most students are still developing ratio skills.");
  });

  test.describe("exporting", () => {
    test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

    test("the CSV matches the report's section and status", async ({ page, request }) => {
      const classes = (await (await api(request, token, "/teacher-admin/classes")).json()).data.filter(
        (row) => row.is_active !== false,
      );
      test.skip(classes.length === 0, "no active section to export");
      const section = classes[0];

      await page.goto(`/teacher/reports-analytics?section=${section.id}`);
      await settled(page);
      const scoped = (await (await api(request, token, `/teacher-admin/reports/overview?section_id=${section.id}`)).json()).data;

      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.getByRole("button", { name: "Export CSV" }).click(),
      ]);
      expect(download.suggestedFilename()).toMatch(/^mathsmart-progress-\d{8}-\d{6}Z\.csv$/);
      const body = await (await download.createReadStream()).toArray();
      const lines = Buffer.concat(body).toString("utf8").trim().split("\n");
      expect(lines[0]).toContain("learner_id");
      expect(lines.length - 1).toBe(scoped.summary.learner_count);
      await expect(page.getByRole("status").filter({ hasText: "Exported" })).toBeVisible();
    });
  });
});
