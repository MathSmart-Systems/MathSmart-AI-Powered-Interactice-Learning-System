import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts";

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "true";

async function apiIsReachable(request) {
  if (!API_BASE_URL) return false;

  try {
    const base = API_BASE_URL.replace(/\/+$/, "");
    return (await request.get(`${base}/health`, { timeout: 5000 })).ok();
  } catch {
    return false;
  }
}

async function signInAsStudent(page) {
  await signIn(page, STUDENT_ACCOUNT);
  await page.waitForURL("**/student/dashboard");
}

describe("student assessments", () => {
  test.beforeEach(async ({ page }) => {
    await signInAsStudent(page);
  });

  test("shows diagnostic discovery and successful attempt history", async ({ page }) => {
    await page.goto("/student/assessments");

    await expect(page.getByRole("heading", { name: "Assessments", level: 1 })).toBeVisible();
    await expect(page.getByText("Diagnostic assessment", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open diagnostic" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent attempt history" })).toBeVisible();

    const emptyState = page.getByText("No assessment attempts yet");
    const rows = page.locator("section[aria-labelledby='attempt-history-heading'] li");
    await expect.poll(async () => (await emptyState.count()) + (await rows.count())).toBeGreaterThan(0);
    await expect(page.getByText("Attempt history could not be loaded")).toHaveCount(0);
  });

  test("loads a historical report without discovering a currently published diagnostic", async ({
    page,
  }) => {
    test.skip(USE_MOCK, "Historical API routing needs a live authenticated session.");

    const attemptId = "123e4567-e89b-42d3-a456-426614174000";
    let catalogueRequests = 0;
    await page.route("**/api/v1/assessments?**", async (route) => {
      catalogueRequests += 1;
      await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    });
    await page.route(`**/api/v1/assessment-attempts/${attemptId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            attempt_id: attemptId,
            assessment_id: "30e7f94d-0daa-4c0d-9a4b-908e47029a51",
            status: "scored",
            overall_score: 75,
            competency_results: [
              {
                competency_id: "13ec5f06-746e-45fb-a58a-92f4ce42621c",
                competency_name: "Fractions",
                raw_score: 3,
                max_score: 4,
                percentage: 75,
                mastery_band: "Developing",
              },
            ],
            recommended_learning_path: [],
            next_action: { type: "dashboard", label: "Return to Dashboard" },
          },
        }),
      });
    });

    await page.goto(`/student/assessments/diagnostic?attempt=${attemptId}`);
    await expect(page.getByText("Diagnostic gap report")).toBeVisible();
    await expect(page.getByText("75%", { exact: true }).first()).toBeVisible();
    expect(catalogueRequests).toBe(0);
  });

  test("shows a controlled state for malformed, empty, and repeated attempt links", async ({
    page,
  }) => {
    for (const query of ["attempt=not-a-uuid", "attempt=", "attempt=first&attempt=second"]) {
      await page.goto(`/student/assessments/diagnostic?${query}`);
      await expect(
        page.getByRole("heading", { name: "Invalid assessment link", level: 1 }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
    }
  });

  test("writes a durable local draft before navigation", async ({ page }) => {
    test.skip(!USE_MOCK, "Draft recovery is deterministic only in configured mock mode.");

    await page.goto("/student/assessments/diagnostic");
    const begin = page.getByRole("button", { name: /Begin assessment|Start reassessment/ });
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(page.getByRole("group", { name: "Choose one answer for question 1" })).toBeVisible();

    const firstChoice = page.locator("fieldset button").first();
    await expect(firstChoice).toHaveAttribute("aria-pressed", "false");
    await firstChoice.click();
    await expect(firstChoice).toHaveAttribute("aria-pressed", "true");
    const draft = await page.evaluate(() => {
      const key = Object.keys(localStorage).find((entry) =>
        entry.startsWith("mathsmart:diagnostic-draft:"),
      );
      return key ? JSON.parse(localStorage.getItem(key)) : null;
    });
    expect(draft).toEqual({ q1: "-10" });

    await page.goto("/student/dashboard");
  });

  test("traps confirmation focus, blocks shortcuts, and restores focus", async ({ page }) => {
    test.skip(!USE_MOCK, "Confirmation is deterministic only in configured mock mode.");

    await page.goto("/student/assessments/diagnostic");
    await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith("mathsmart:diagnostic-")) localStorage.removeItem(key);
      }
    });
    await page.reload();
    const begin = page.getByRole("button", { name: /Begin assessment|Start reassessment/ });
    await expect(begin).toBeVisible();
    await begin.click();
    await expect(page.getByRole("group", { name: "Choose one answer for question 1" })).toBeVisible();

    await page.getByRole("button", { name: /Question 40, blank/ }).click();
    const choices = page.locator("fieldset button");
    await expect(page.locator("fieldset button[aria-pressed='true']")).toHaveCount(0);

    const submitTrigger = page.getByTestId("final-submit-trigger");
    await submitTrigger.click();

    const confirmation = page.getByRole("alertdialog", {
      name: "Confirm assessment submission",
    });
    await expect(confirmation).toBeVisible();
    await expect(confirmation).toContainText("blank");
    await expect(confirmation.getByRole("button", { name: "Review Q1", exact: true })).toBeFocused();

    await page.keyboard.press("1");
    await expect(choices.locator("[aria-pressed='true']")).toHaveCount(0);

    for (let step = 0; step < 25; step += 1) await page.keyboard.press("Tab");
    await expect(confirmation.locator(":focus")).toHaveCount(1);

    await page.keyboard.press("Escape");
    await expect(confirmation).toHaveCount(0);
    await expect(submitTrigger).toBeFocused();

    await submitTrigger.click();
    await confirmation.getByRole("button", { name: "Review Q1", exact: true }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(page.getByText("Question 1", { exact: true })).toBeVisible();
    await expect(page.locator("[data-slot='card']").filter({ has: page.locator("fieldset") })).toBeFocused();
  });
});

describe("student assessment API integration", () => {
  let apiUp = false;

  test.beforeAll(async ({ request }) => {
    apiUp = await apiIsReachable(request);
  });

  test.beforeEach(async ({ page }) => {
    test.skip(!apiUp, "The MathSmart API is not running.");
    await signInAsStudent(page);
  });

  test("diagnostic does not render the generic failure", async ({ page }) => {
    await page.goto("/student/assessments/diagnostic");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", { name: "Something went wrong" })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  });
});
