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

  test("moves focus through submission confirmation and back on cancel", async ({ page }) => {
    test.skip(!USE_MOCK, "Confirmation is deterministic only in configured mock mode.");

    await page.goto("/student/assessments/diagnostic");
    const begin = page.getByRole("button", { name: /Begin assessment|Start reassessment/ });
    await expect(begin).toBeVisible();
    await begin.click();

    await page.getByRole("button", { name: /Question 20, blank/ }).click();
    const submitTrigger = page.getByTestId("final-submit-trigger");
    await submitTrigger.click();

    const confirmation = page.getByTestId("submission-confirmation");
    await expect(confirmation).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Confirm assessment submission", level: 2 }),
    ).toBeFocused();
    await expect(confirmation.getByRole("button", { name: "Review Q1" })).toBeVisible();

    await confirmation.getByRole("button", { name: "Cancel and review" }).click();
    await expect(confirmation).toHaveCount(0);
    await expect(submitTrigger).toBeFocused();
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
