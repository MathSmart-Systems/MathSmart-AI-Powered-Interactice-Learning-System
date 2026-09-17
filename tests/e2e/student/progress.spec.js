import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts";

const describe = hasAccount(STUDENT_ACCOUNT) ? test.describe : test.describe.skip;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

async function apiIsReachable(request) {
  if (!API_BASE_URL) return false;
  try {
    return (await request.get(`${API_BASE_URL.replace(/\/+$/, "")}/health`, { timeout: 5000 })).ok();
  } catch {
    return false;
  }
}

describe("student progress", () => {
  let apiUp = false;

  test.beforeAll(async ({ request }) => {
    apiUp = await apiIsReachable(request);
  });

  async function openProgress(page) {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL("**/student/dashboard");
    await page.goto("/student/progress");
  }

  test("renders progress returned for the authenticated learner", async ({ page }) => {
    test.skip(!apiUp, "MathSmart API is not running.");
    await openProgress(page);

    await expect(
      page.getByRole("heading", { name: "My Mathematics Competency Progress" }),
    ).toBeVisible();
    await expect(page.getByText("Overall Progress", { exact: true })).toBeVisible();
    await expect(page.getByText("Modules Completed", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Competency Mastery Data" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "UI in progress" })).toHaveCount(0);
  });

  test("shows a recoverable state when authenticated transport is unavailable", async ({ page }) => {
    test.skip(apiUp, "MathSmart API is running, so network-failure state does not apply.");
    await openProgress(page);

    await expect(page.getByRole("heading", { name: "Unable to Load Progress" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try Again" })).toBeVisible();
  });
});
