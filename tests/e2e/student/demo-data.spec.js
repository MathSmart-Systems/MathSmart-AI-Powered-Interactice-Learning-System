import { expect, test } from "@playwright/test";

import { STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";
import { present } from "../support/student-place.js";

/**
 * What a demonstrator sees after `npm run seed:demo`.
 *
 * The suites beside this one prove the rules: a control that is offered opens,
 * a locked module stays locked, a paper that cannot be delivered is never
 * called ready. They pass just as well against an empty workspace, because an
 * empty list breaks no rule.
 *
 * This asks the other question. A demonstration is worth nothing if the
 * lesson has no explanation in it, the practice has no question, the report
 * has no competencies and the progress screen is four zeroes. So this reads
 * the screens the way the person standing in front of the room will, and
 * fails when there is nothing on them worth looking at.
 */

test.describe.configure({ mode: "serial" });

const { describe, beforeEach } = test;

/** The mark every seeded record carries, and nothing a teacher wrote does. */
const DEMO = "DEMO";

/**
 * The learner `npm run seed:demo` enrols, and whose evidence this reads.
 *
 * `DEMO_LEARNER_EMAIL` follows the same variable the seed takes, so a
 * demonstration built around an address you already sign in with is checked
 * against that address rather than skipped.
 */
const DEMO_LEARNER_EMAIL = (
  process.env.DEMO_LEARNER_EMAIL || "demo.learner@example.com"
).toLowerCase();

/**
 * Whether the suite is signed in as the demonstration learner.
 *
 * These assertions are about one learner's seeded history — a finished lesson,
 * a locked one, an attempt with exactly one right answer in it. Run against
 * the ordinary fixture learner they fail, and the failure says nothing except
 * that the wrong person was signed in. So the suite states who it needs.
 */
function isDemoLearner() {
  return STUDENT_ACCOUNT.email?.toLowerCase() === DEMO_LEARNER_EMAIL;
}

describe("the seeded demonstration", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());
  test.skip(
    !isDemoLearner(),
    `set E2E_STUDENT_EMAIL to ${DEMO_LEARNER_EMAIL} and run npm run seed:demo first`,
  );

  beforeEach(async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);
  });

  test("the learning path carries lessons in more than one state", async ({ page }) => {
    await page.goto("/student/my-learning");
    await expect(page.getByRole("heading", { name: "My Learning", level: 1 })).toBeVisible();

    const seeded = page.locator("li").filter({ hasText: DEMO });
    expect(await seeded.count(), "no seeded lessons reached My Learning").toBeGreaterThan(2);

    // A path where everything says the same thing demonstrates nothing. The
    // seed finishes one lesson, opens the next and leaves the rest shut, so
    // the progression rule is visible without anyone having to sit a paper.
    const path = await page.locator("main").innerText();
    expect(path).toMatch(/Completed|Finished/i);
    expect(path).toMatch(/Locked|Opens (?:later|after)/i);
  });

  test("a lesson opens onto real teaching, not an empty page", async ({ page }) => {
    await page.goto("/student/my-learning");

    const lesson = page
      .locator("li")
      .filter({ hasText: DEMO })
      .getByRole("link")
      .first();
    await expect(lesson).toBeVisible();
    await lesson.click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    const body = await page.locator("main").innerText();

    // Prose, not a stub. Four hundred characters is roughly an objective, an
    // explanation and one worked example — below that there is nothing to read.
    expect(body.length, "the lesson page is too thin to demonstrate").toBeGreaterThan(400);
    expect(body).not.toContain("The request could not be completed");
  });

  test("a practice opens onto a real question with real choices", async ({ page }) => {
    await page.goto("/student/activities");

    const practice = page
      .locator("ul > li")
      .filter({ hasText: DEMO })
      .getByRole("link")
      .first();
    test.skip(!(await present(practice, 5_000)), "no seeded practice is open to this learner");
    await practice.click();

    // Either a question to answer or a finished attempt to look back at;
    // both are real content, and an empty player is neither.
    const question = page.getByText(/Question \d+/).first();
    const finished = page.getByRole("button", {
      name: /Try the Activity Again|Back to Activities/,
    });
    await expect(question.or(finished).first()).toBeVisible({ timeout: 20_000 });

    if (await present(question, 2_000)) {
      // The player draws its choices as pressed-state buttons inside the
      // fieldset, not as radios, so they are counted the way they are built.
      const choices = page.locator("fieldset button[aria-pressed]");
      expect(await choices.count(), "the question offers nothing to choose").toBeGreaterThan(1);
    }
  });

  test("the assessment report shows a score and the competencies behind it", async ({ page }) => {
    await page.goto("/student/assessments");

    const finished = page
      .locator("ul > li")
      .filter({ hasText: /Finished/ })
      .getByRole("link")
      .first();
    test.skip(!(await present(finished, 5_000)), "the demo learner has sat no paper");
    await finished.click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 20_000 });
    const report = await page.locator("main").innerText();

    // A percentage, and the competency names it was worked out from. A report
    // with a number and no breakdown is the one nobody can talk through.
    expect(report, "the report shows no score").toMatch(/\d+\s*%/);
    expect(report, "the report shows no competencies").toContain(DEMO);
  });

  test("progress reports evidence rather than four zeroes", async ({ page }) => {
    await page.goto("/student/progress");
    await expect(page.getByRole("heading", { name: /Progress/, level: 1 })).toBeVisible();

    const body = await page.locator("main").innerText();
    const numbers = [...body.matchAll(/(\d+)\s*%/g)].map((match) => Number(match[1]));
    expect(numbers.length, "progress shows no measurements at all").toBeGreaterThan(0);
    expect(
      numbers.some((value) => value > 0),
      "every measurement on the progress screen is zero",
    ).toBe(true);
  });

  test("only a wrong answer is offered an explanation", async ({ page }) => {
    await page.goto("/student/assessments");

    const finished = page
      .locator("ul > li")
      .filter({ hasText: /Finished/ })
      .getByRole("link")
      .first();
    test.skip(!(await present(finished, 5_000)), "the demo learner has sat no paper");
    await finished.click();

    await page.getByRole("button", { name: "Review my answers" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Answer review")).toBeVisible();

    const answers = dialog.locator("ol > li");
    await expect(answers.first()).toBeVisible({ timeout: 20_000 });
    const total = await answers.count();
    expect(total, "the review is empty").toBeGreaterThan(0);

    // The rule the user asked to keep exactly as it is: help is offered for
    // a question that went wrong, and never beside one that went right.
    let wrong = 0;
    let right = 0;
    for (let index = 0; index < total; index += 1) {
      const answer = answers.nth(index);
      const explain = answer.getByRole("button", { name: "Explain this one" });
      const text = await answer.innerText();

      if (text.includes("Not correct")) {
        wrong += 1;
        await expect(explain, `question ${index + 1} went wrong with no way to ask why`)
          .toHaveCount(1);
      } else if (text.includes("Correct")) {
        right += 1;
        await expect(explain, `question ${index + 1} was right and was offered an explanation`)
          .toHaveCount(0);
      }
    }

    // Both halves of the rule were exercised, rather than one of them being
    // vacuously true because the seeded attempt happened to be all wrong.
    expect(wrong, "no wrong answer to check the offer against").toBeGreaterThan(0);
    expect(right, "no right answer to check the absence against").toBeGreaterThan(0);
  });
});
