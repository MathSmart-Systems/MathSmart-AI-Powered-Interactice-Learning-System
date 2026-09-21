import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import {
  STUDENT_VIEWPORTS,
  expectKeptPlace,
  expectOrdinaryAction,
  present,
  scrollBelowTheFold,
  verticalScrollers,
} from "../support/student-place.js";

/**
 * Practising an activity, and doing it without losing your place.
 *
 * The player itself was in good shape; what it did badly was everything
 * around answering. Checking an answer, taking a hint and moving between
 * questions all changed the height of the card, and the browser moved the page
 * out from under a learner who had not asked to go anywhere. Retrying threw
 * the whole screen away and rebuilt it from a skeleton. A correct answer took
 * the button that had focus off the page and dropped focus on the document.
 *
 * Each of those is one test below, at phone and desktop width, because the
 * phone is where a lost place costs the most.
 */

/**
 * One learner, one account, one thing happening at a time.
 *
 * These tests share a single seeded learner, and most of them change that
 * learner's standing: starting an attempt moves a paper from "Ready to start"
 * to "In progress", and finishing one moves it again. Run in parallel they
 * rewrite each other's fixtures and skip for reasons that have nothing to do
 * with the code under test.
 */
test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/** Opens the first activity this learner is actually allowed into. */
async function openAnActivity(page) {
  await page.goto("/student/activities");
  await expect(page.getByRole("heading", { name: "Activities", level: 1 })).toBeVisible();

  const open = page
    .locator("ul > li")
    .filter({ hasNot: page.getByText("Opens later") })
    .filter({ has: page.getByRole("link") })
    .filter({ hasText: /practice|activity/i })
    .first();

  // Waited for rather than counted. `count()` is a snapshot, and taken the
  // instant the heading appears it can read zero while the list is still
  // being painted — which skipped the test for a reason that was not true a
  // moment later.
  try {
    await open.waitFor({ state: "attached", timeout: 5_000 });
  } catch {
    return false;
  }

  await open.getByRole("link").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });

  // The attempt is opened after the heading paints. Waiting for the question
  // counter is waiting for the player to be usable rather than merely present.
  await page
    .getByText(/Question \d+/)
    .first()
    .waitFor({ timeout: 20_000 })
    .catch(() => {});
  return true;
}

/**
 * The first answer option on the current question.
 *
 * Found by `aria-pressed`, which every choice carries and nothing else on the
 * screen does. Matching on the letter in front of each option looked tidier
 * and was wrong: the letter and the label are separate elements, so the text
 * reads "A3/4" with no separator to anchor against.
 */
function anOption(page) {
  return page.locator("button[aria-pressed]").first();
}

/**
 * Answers every question and stops on the last one.
 *
 * The finish control only exists there, so a test that answers the first
 * question and reaches for it skips itself on any activity with more than one.
 */
async function answerEveryQuestion(page, { correctly = true } = {}) {
  for (let guard = 0; guard < 20; guard += 1) {
    // The last choice when a failing run is wanted: the retry control only
    // appears to a learner who did not pass, so a test that answers correctly
    // is shown "Continue Learning" and has nothing to retry.
    const choice = correctly
      ? anOption(page)
      : page.locator("button[aria-pressed]").last();
    if (await present(choice, 1_500)) {
      await choice.focus();
      await choice.press("Enter");
    }

    const next = page.getByRole("button", { name: "Next" });
    if (!(await present(next, 1_500))) return;
    await next.click();
  }
}

describe("student activities", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  test("a locked activity is not offered as a link", async ({ page }) => {
    await page.goto("/student/activities");
    await expect(page.getByRole("heading", { name: "Activities", level: 1 })).toBeVisible();

    const locked = page.locator("ul > li").filter({ hasText: "Opens later" });
    test.skip(!(await present(locked, 3_000)), "nothing is locked for this learner");

    // The card is shown — a learner should see what is coming — but it is not
    // a way in. The database refuses the attempt as well; this is only the
    // half of it a learner can see.
    await expect(locked.first().getByRole("link")).toHaveCount(0);
  });

  test("selecting an answer keeps the reader's place", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const option = anOption(page);
    test.skip(!(await present(option)), "this activity has no multiple-choice question");

    await expectOrdinaryAction(page, {
      anchor: page.getByRole("heading", { level: 1 }),
      description: "selecting an answer",
      act: async () => {
        await option.focus();
        await option.press("Enter");
      },
    });
  });

  test("checking an answer keeps the reader's place and the screen", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const option = anOption(page);
    test.skip(!(await present(option)), "this activity has no multiple-choice question");
    await option.focus();
    await option.press("Enter");

    const check = page.getByRole("button", { name: "Check answer" });
    test.skip(!(await present(check, 3_000)), "this answer was already checked");

    await expectOrdinaryAction(page, {
      anchor: page.getByRole("heading", { level: 1 }),
      description: "checking an answer",
      act: async () => {
        await check.focus();
        await check.press("Enter");
        await page.getByText(/Correct|Not quite/).first().waitFor({ timeout: 15_000 });
      },
    });
  });

  test("a correct answer hands focus on rather than dropping it", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const option = anOption(page);
    test.skip(!(await present(option)), "this activity has no multiple-choice question");
    await option.focus();
    await option.press("Enter");

    const check = page.getByRole("button", { name: "Check answer" });
    test.skip(!(await present(check, 3_000)), "this answer was already checked");
    await check.focus();
    await check.press("Enter");
    await page.getByText(/Correct|Not quite/).first().waitFor({ timeout: 15_000 });

    // The check button removes itself once the answer is right. Focus used to
    // fall to <body>, so the next Tab started again from the top of the page.
    const focused = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
    expect(focused, "focus was dropped on the document").not.toBe("BODY");
  });

  test("asking for a hint keeps the reader's place", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const hint = page.getByRole("button", { name: /Need a hint\?/ });
    test.skip(!(await present(hint)), "this question offers no hint");

    await expectOrdinaryAction(page, {
      anchor: page.getByRole("heading", { level: 1 }),
      description: "asking for a hint",
      act: async () => {
        await hint.focus();
        await hint.press("Enter");
        await page.getByText(/Hint|did not arrive|no hint/i).first().waitFor({ timeout: 15_000 });
      },
    });
  });

  test("the authored hint arrives even with Groq switched off", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const hint = page.getByRole("button", { name: /Need a hint\?/ });
    test.skip(!(await present(hint)), "this question offers no hint");
    await hint.click();

    // The authored hint is the one that counts and it is never replaced. The
    // AI rewording is optional, and this run has GROQ_ENABLED=false, so its
    // absence here is the fallback working rather than a failure.
    await expect(page.getByText(/Look at the bottom numbers first|Hint/).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("moving between questions keeps the reader's place", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const next = page.getByRole("button", { name: "Next" });
    test.skip(!(await present(next, 3_000)), "this activity has only one question");

    await expectOrdinaryAction(page, {
      anchor: page.getByRole("heading", { level: 1 }),
      description: "moving to the next question",
      act: async () => {
        await next.focus();
        await next.press("Enter");
      },
    });
  });

  test("finishing keeps the reader's place and never shows a skeleton", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    await answerEveryQuestion(page);

    const finish = page.getByRole("button", { name: /Finish activity/ });
    test.skip(!(await present(finish, 3_000)), "the activity offers no way to finish");

    const before = await scrollBelowTheFold(page);
    await finish.focus();
    await finish.press("Enter");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    // The screen changes, but it is never blanked to a skeleton on the way.
    await expect(page.getByText("Loading your activity…")).toHaveCount(0);
    await expectKeptPlace(page, before, "finishing the activity");
  });

  test("retrying keeps the content on screen instead of a skeleton", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    // Finished first, and finished badly, in this test rather than borrowed
    // from the one before it: retrying is only offered to a learner who did
    // not pass, and a test that depends on its predecessor's leftovers skips
    // the first time it is run on its own.
    await answerEveryQuestion(page, { correctly: false });

    const finish = page.getByRole("button", { name: /Finish activity/ });
    test.skip(!(await present(finish, 3_000)), "the activity offers no way to finish");
    await finish.click();

    const again = page.getByRole("button", { name: /Try the Activity Again|Try again/ });
    test.skip(!(await present(again, 15_000)), "this activity is not finished");

    const before = await scrollBelowTheFold(page);
    await again.focus();
    await again.press("Enter");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expectKeptPlace(page, before, "retrying the activity");
  });

  test("the list fits every width without a horizontal scrollbar", async ({ page }) => {
    for (const viewport of STUDENT_VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/student/activities");
      await expect(page.getByRole("heading", { name: "Activities", level: 1 })).toBeVisible();

      const overflows = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(overflows, `the activity list overflows sideways at ${viewport.name}`).toBe(false);
    }
  });

  test("the player owns no scroll container of its own", async ({ page }) => {
    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");
    await scrollBelowTheFold(page);

    const scrollers = (await verticalScrollers(page)).filter(
      (name) => !name.includes("workspace-nav"),
    );
    expect(scrollers, `unexpected scroll containers: ${scrollers.join(", ")}`).toEqual([]);
  });
});

describe("student activities on a phone", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  test("checking an answer keeps the reader's place at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 640 });
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);

    test.skip(!(await openAnActivity(page)), "no activity is open to this learner");

    const option = anOption(page);
    test.skip(!(await present(option)), "this activity has no multiple-choice question");
    await option.focus();
    await option.press("Enter");

    const check = page.getByRole("button", { name: "Check answer" });
    test.skip(!(await present(check, 3_000)), "this answer was already checked");

    const before = await scrollBelowTheFold(page);
    await check.focus();
    await check.press("Enter");
    await page.getByText(/Correct|Not quite/).first().waitFor({ timeout: 15_000 });
    await expectKeptPlace(page, before, "checking an answer on a phone");
  });
});
