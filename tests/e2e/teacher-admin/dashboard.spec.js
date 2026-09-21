import { expect, test } from "@playwright/test";

import { accessToken, api } from "../support/api-fixtures.js";
import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";

/**
 * The Teacher/Administrator dashboard, against the real API.
 *
 * Every figure on the page is compared with what `GET /teacher-admin/dashboard`
 * returns for the same section, so the page is checked for honesty rather than
 * for a particular seeded number. The section filter is exercised for real:
 * it must change the figures, keep the reader's place, and never bring the
 * first-load skeleton back.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

const VIEWPORTS = [
  { name: "phone", width: 360, height: 780 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "short laptop", width: 1280, height: 620 },
  { name: "desktop", width: 1440, height: 900 },
];

async function settled(page) {
  await expect(page.getByRole("heading", { name: "Grade 6 Mathematics" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".animate-pulse")).toHaveCount(0, { timeout: 20_000 });
}

function figure(page, label) {
  return page
    .getByRole("region", { name: "Class summary" })
    .locator("div")
    .filter({ has: page.getByText(label, { exact: true }) })
    .locator("dd")
    .first();
}

describe("teacher dashboard", () => {
  let token = null;

  test.beforeAll(async ({ request }) => {
    token = await accessToken(request);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
    await settled(page);
  });

  test("streams a layout-matching skeleton on first load only", async ({ page }) => {
    // The first response carries the loading shape, streamed before the data.
    const response = await page.request.get("/teacher/dashboard");
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain("Loading the class dashboard");
    expect((html.match(/animate-pulse/g) ?? []).length).toBeGreaterThanOrEqual(8);

    // And it hands over completely once the dashboard arrives.
    await expect(page.getByText("Loading the class dashboard")).toHaveCount(0);
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
  });

  test("the API the page reads carries every dashboard aggregate", async ({ request }) => {
    // A server started before these fields existed answers 200 without them,
    // and the page then shows a dash for each — honestly, but wrongly for a
    // current deployment. This names that failure instead of leaving it to
    // look like missing data.
    const body = await (await api(request, token, "/teacher-admin/dashboard")).json();
    const { totals, diagnostic, interventions } = body.data;

    for (const [name, value] of [
      ["totals.learner_count", totals?.learner_count],
      ["totals.section_count", totals?.section_count],
      ["diagnostic.completed", diagnostic?.completed],
      ["diagnostic.in_progress", diagnostic?.in_progress],
      ["diagnostic.not_started", diagnostic?.not_started],
      ["interventions.needs_intervention", interventions?.needs_intervention],
      ["interventions.in_progress", interventions?.in_progress],
      ["interventions.resolved", interventions?.resolved],
    ]) {
      expect(Number.isInteger(value), `${name} is ${JSON.stringify(value)} — is the API stale?`).toBe(
        true,
      );
      expect(value).toBeGreaterThanOrEqual(0);
    }
    // The diagnostic split accounts for every learner in scope.
    expect(diagnostic.completed + diagnostic.in_progress + diagnostic.not_started).toBe(
      totals.learner_count,
    );
  });

  test("the summary matches what the API says", async ({ page, request }) => {
    const body = await (await api(request, token, "/teacher-admin/dashboard")).json();
    const { totals, diagnostic, interventions } = body.data;

    // No aggregate the API sent is shown as unknown.
    for (const label of ["Students", "Sections", "Diagnostic done"]) {
      await expect(figure(page, label)).not.toHaveText("—");
    }
    await expect(
      page.getByRole("region", { name: "Interventions" }).locator("dd", { hasText: /^—$/ }),
    ).toHaveCount(0);

    await expect(figure(page, "Students")).toHaveText(String(totals.learner_count));
    await expect(figure(page, "Sections")).toHaveText(String(totals.section_count));
    await expect(figure(page, "Diagnostic done")).toHaveText(
      `${diagnostic.completed} of ${totals.learner_count}`,
    );

    const panel = page.getByRole("region", { name: "Interventions" });
    for (const [label, value] of [
      ["Need action", interventions.needs_intervention],
      ["In progress", interventions.in_progress],
      ["Resolved", interventions.resolved],
    ]) {
      // A zero is shown as 0, never hidden.
      await expect(panel.locator("div").filter({ hasText: label }).locator("dd")).toHaveText(
        String(value),
      );
    }
  });

  test("competencies are the published ones, and the privacy note is said once", async ({
    page,
  }) => {
    const panel = page.getByRole("region", { name: "Competencies to watch" });
    await expect(panel).toBeVisible();

    // The old page repeated a privacy badge on every row. Now it is one note
    // for the whole list, at most.
    await expect(panel.getByText("Withheld (Privacy)")).toHaveCount(0);
    expect(await panel.getByText(/groups of fewer than five learners/).count()).toBeLessThanOrEqual(1);
    // Drafts and fixtures were listed before; a draft never reaches this page.
    await expect(panel.getByText("Draft competency fixture")).toHaveCount(0);
  });

  test("a learner who needs support links to their record and their cases", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Students who need support" });
    const record = panel.getByRole("link", { name: /^View the record for / }).first();
    test.skip((await record.count()) === 0, "nobody needs support in this class");

    const recordHref = await record.getAttribute("href");
    expect(recordHref).toMatch(/^\/teacher\/students\/[0-9a-f-]{36}$/);

    const cases = panel.getByRole("link", { name: /^Open the intervention cases for / }).first();
    const casesHref = await cases.getAttribute("href");
    expect(casesHref).toMatch(/^\/teacher\/interventions\?student=[0-9a-f-]{36}$/);

    // The queue actually opens on that one learner.
    await cases.click();
    await page.waitForURL(/\/teacher\/interventions\?student=/);
    const learnerName = await page
      .getByRole("link", { name: /^Review the case for / })
      .first()
      .getAttribute("aria-label");
    const rows = page.getByRole("link", { name: /^Review the case for / });
    const names = await rows.evaluateAll((links) => links.map((link) => link.getAttribute("aria-label")));
    expect(new Set(names).size).toBeLessThanOrEqual(1);
    expect(learnerName).toBeTruthy();
  });

  test("every dashboard action opens its destination", async ({ page, context }) => {
    const hrefs = await page
      .locator("#workspace-content a[href^='/teacher']")
      .evaluateAll((anchors) => [...new Set(anchors.map((anchor) => anchor.getAttribute("href")))]);

    // Each destination is reached from the card it belongs to. There is no
    // separate row of buttons repeating the sidebar.
    await expect(page.getByRole("navigation", { name: "Go to" })).toHaveCount(0);
    for (const [card, name, expected] of [
      ["Students who need support", "All students", "/teacher/students"],
      ["Recent activity", "View assessments", "/teacher/assessments"],
      ["Interventions", "Open the queue", "/teacher/interventions"],
      ["Class summary", "Manage sections", "/teacher/grades-sections"],
      ["Competencies to watch", "Full report", "/teacher/reports-analytics"],
    ]) {
      await expect(
        page.getByRole("region", { name: card }).getByRole("link", { name }),
        `${card} has no "${name}" link`,
      ).toHaveAttribute("href", expected);
    }

    const probe = await context.newPage();
    for (const href of hrefs) {
      const response = await probe.goto(href);
      expect(response?.status(), `${href} answered`).toBeLessThan(400);
      await expect(probe.getByText("This page could not be found")).toHaveCount(0);
    }
    await probe.close();
  });

  test("choosing a section narrows every figure, in the address, without a skeleton or a jump", async ({
    page,
    request,
  }) => {
    const select = page.getByLabel("Section");
    const options = await select.locator("option").evaluateAll((items) =>
      items.map((item) => ({ value: item.value, label: item.textContent })),
    );
    const withLearners = options.find((option) => option.value && /\(\d+ student/.test(option.label) && !/\(0 students/.test(option.label));
    test.skip(!withLearners, "no section with learners to choose");

    // A short screen, scrolled down, so a jump back to the top would show.
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.evaluate(() => window.scrollTo(0, 300));
    const before = await page.evaluate(() => window.scrollY);

    await select.selectOption(withLearners.value);

    // The page never falls back to its first-load skeleton for a filter.
    await expect(page.locator(".animate-pulse")).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`section=${withLearners.value}`));
    await expect(figure(page, "Section")).toBeVisible({ timeout: 20_000 });

    const scoped = await (
      await api(request, token, `/teacher-admin/dashboard?section_id=${withLearners.value}`)
    ).json();
    await expect(figure(page, "Students")).toHaveText(String(scoped.data.totals.learner_count));
    await expect(figure(page, "Diagnostic done")).toHaveText(
      `${scoped.data.diagnostic.completed} of ${scoped.data.totals.learner_count}`,
    );
    const scopedPanel = page.getByRole("region", { name: "Interventions" });
    for (const [label, value] of [
      ["Need action", scoped.data.interventions.needs_intervention],
      ["In progress", scoped.data.interventions.in_progress],
      ["Resolved", scoped.data.interventions.resolved],
    ]) {
      await expect(scopedPanel.locator("div").filter({ hasText: label }).locator("dd")).toHaveText(
        String(value),
      );
    }

    // Where the reader was, or as much of it as the new section's page is tall.
    const { after, reachable } = await page.evaluate(() => ({
      after: window.scrollY,
      reachable: document.documentElement.scrollHeight - document.documentElement.clientHeight,
    }));
    expect(Math.abs(after - Math.min(before, reachable))).toBeLessThan(40);

    // The address holds the section, so a refresh keeps it.
    await page.reload();
    await settled(page);
    await expect(page.getByLabel("Section")).toHaveValue(withLearners.value);
  });

  test("a section with nobody in it says so instead of showing zeros", async ({ page }) => {
    const select = page.getByLabel("Section");
    const empty = await select
      .locator("option")
      .evaluateAll((items) => items.find((item) => /\(0 students\)/.test(item.textContent))?.value ?? null);
    test.skip(!empty, "every section has learners");

    await select.selectOption(empty);
    await expect(page.getByRole("heading", { name: /^No students in / })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("region", { name: "Class summary" })).toHaveCount(0);
  });

  test("the section filter works from the keyboard", async ({ page }) => {
    const select = page.getByLabel("Section");
    await select.focus();
    await expect(select).toBeFocused();

    const ring = await select.evaluate((element) => window.getComputedStyle(element).boxShadow);
    expect(ring).not.toBe("none");
  });

  test("the intervention cards are equal and their counts share one baseline", async ({ page }) => {
    const panel = page.getByRole("region", { name: "Interventions" });

    for (const size of [...VIEWPORTS, { name: "small phone", width: 320, height: 640 }]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(panel).toBeVisible();

      const cards = await panel.locator("dl > div").evaluateAll((items) =>
        items.map((item) => {
          const box = item.getBoundingClientRect();
          const label = item.querySelector("dt").getBoundingClientRect();
          const count = item.querySelector("dd").getBoundingClientRect();
          return {
            width: box.width,
            height: box.height,
            labelHeight: label.height,
            countTop: count.top,
            countBottom: count.bottom,
          };
        }),
      );
      expect(cards, `${size.name} shows three cards`).toHaveLength(3);

      const spread = (key) =>
        Math.max(...cards.map((card) => card[key])) - Math.min(...cards.map((card) => card[key]));
      expect(spread("width"), `${size.name}: card widths differ`).toBeLessThanOrEqual(1);
      expect(spread("height"), `${size.name}: card heights differ`).toBeLessThanOrEqual(1);
      expect(spread("labelHeight"), `${size.name}: label areas differ`).toBeLessThanOrEqual(1);
      expect(spread("countTop"), `${size.name}: counts are not aligned`).toBeLessThanOrEqual(1);
      expect(spread("countBottom"), `${size.name}: counts are not aligned`).toBeLessThanOrEqual(1);
    }
  });

  test("fits every viewport without sideways scroll or inner scrollbars", async ({ page }) => {
    for (const size of VIEWPORTS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(page.getByRole("heading", { name: "Grade 6 Mathematics" })).toBeVisible();

      const { overflow, scrollers } = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        scrollers: [...document.querySelectorAll("#workspace-content *")].filter((element) => {
          const style = window.getComputedStyle(element);
          return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight - element.clientHeight > 4;
        }).length,
      }));
      expect(overflow, `${size.name} scrolls sideways`).toBeLessThanOrEqual(1);
      expect(scrollers, `${size.name} has a scrollbar inside the page`).toBe(0);
    }
  });
});

describe("teacher dashboard is closed to learners", () => {
  test("a learner is refused the dashboard data", async ({ request }) => {
    const { STUDENT_ACCOUNT } = await import("../support/accounts.js");
    test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");
    const { studentAccessToken } = await import("../support/api-fixtures.js");

    const learnerToken = await studentAccessToken(request);
    const response = await api(request, learnerToken, "/teacher-admin/dashboard");

    expect(response.status()).toBe(403);
  });
});
