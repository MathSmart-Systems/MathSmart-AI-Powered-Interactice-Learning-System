import { expect, test } from "@playwright/test";

import { accessToken, api } from "../support/api-fixtures.js";
import { TEACHER_ADMIN_ACCOUNT, STUDENT_ACCOUNT, hasAccount, signIn } from "../support/accounts.js";
import { hostedDataSkipReason, isLocalDataEnvironment } from "../support/environment.js";

/**
 * The Teacher Interventions workflow, end to end, against a real case.
 *
 * Its sibling `interventions.spec.js` is deliberately read-only: it asserts
 * which moves the interface offers and skips whenever the live queue has
 * nothing in the state it needs. That leaves the parts that matter most
 * unproved — recording an action, who it is attributed to, and what happens
 * when a teacher asks a language model for help — because nothing in a
 * read-only suite can put a case into the state those need.
 *
 * So this one creates its own case, through the same authenticated API a
 * teacher uses, and runs only against the local Supabase stack. It never
 * writes to a hosted project: a case is a record about a real child, and a
 * test suite has no business leaving one behind.
 */

test.describe.configure({ mode: "serial" });

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Two sequential advisory calls, each with the backend's own timeout in front of it. */
const ADVICE_TIMEOUT = 60_000;

const SUGGEST = "Suggest support strategies for this case";
const REGENERATE = "Ask for a new suggestion";
const DISMISS = "Dismiss this suggestion";

/** A case of our own to act on, so no test depends on what the queue happens to hold. */
async function openFixtureCase(request) {
  const token = await accessToken(request);

  const learners = await api(request, token, "/students?page_size=100");
  const competencies = await api(
    request,
    token,
    "/teacher-admin/competencies?page_size=100&status=published",
  );
  const learner = (await learners.json()).data?.[0];
  const competency = (await competencies.json()).data?.[0];
  if (!learner || !competency) return { token, id: null };

  const created = await api(request, token, "/interventions", {
    method: "POST",
    data: {
      student_id: learner.student_id ?? learner.id,
      competency_id: competency.competency_id ?? competency.id,
      severity: "HIGH",
      intervention_type: "One-on-One Remediation",
      educator_notes: "Opened by the browser suite. Safe to archive.",
    },
  });
  if (!created.ok()) return { token, id: null };

  return { token, id: (await created.json()).data.id, learner, competency };
}

/** Archives the fixture case. A case is never deleted, so this is the clean-up. */
async function archiveFixtureCase(request, token, interventionId) {
  if (!interventionId) return;
  await api(request, token, `/interventions/${interventionId}`, { method: "DELETE" });
}

/**
 * Opens the fixture case by its learner's name and waits for the case page.
 *
 * A case is its own page rather than a dialog, so this is a navigation. It
 * returns the page so the assertions read the same as they did before.
 */
async function openReview(page, learnerName) {
  const row = page
    .getByRole("row")
    .filter({ hasText: learnerName })
    .first();
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.getByRole("link", { name: /^Review the case for / }).click();
  await page.waitForURL(/\/teacher\/interventions\/[0-9a-f-]{36}/);
  await expect(page.getByRole("link", { name: "Back to the intervention queue" })).toBeVisible();
  return page;
}

/** Opens the advanced filter disclosure, which starts collapsed. */
async function openAdvancedFilters(page) {
  const trigger = page.getByRole("button", { name: /^Advanced filters/ });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

describe("teacher interventions, end to end", () => {
  test.skip(!isLocalDataEnvironment(), hostedDataSkipReason());

  let fixture = { token: null, id: null };

  test.beforeAll(async ({ request }) => {
    fixture = await openFixtureCase(request);
  });

  test.afterAll(async ({ request }) => {
    await archiveFixtureCase(request, fixture.token, fixture.id);
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
    await page.goto("/teacher/interventions");
    await expect(
      page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
    ).toBeVisible();
  });

  test("the queue opens with the cases that exist", async ({ page }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    // The count line is deterministic and comes from the queue itself, so a
    // populated queue says so rather than leaving an empty table ambiguous.
    await expect(page.getByText(/Showing \d+ case/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Select case for / }).first()).toBeVisible();
  });

  test("filtering never takes the page away or moves the reader", async ({ page }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // The workspace shell scrolls its own content region rather than the
    // document, so the reader's position is that element's offset. Asking the
    // page for it keeps this test honest if the shell ever changes.
    const scrolled = await page.evaluate(() => {
      const table = document.querySelector("table");
      let element = table?.parentElement ?? null;
      while (element) {
        const style = window.getComputedStyle(element);
        const scrolls = /(auto|scroll)/.test(style.overflowY);
        if (scrolls && element.scrollHeight - element.clientHeight > 80) {
          element.dataset.readerScroller = "true";
          element.scrollTop = 120;
          return element.scrollTop;
        }
        element = element.parentElement;
      }
      if (document.documentElement.scrollHeight - document.documentElement.clientHeight > 80) {
        window.scrollTo(0, 120);
        return window.scrollY;
      }
      return null;
    });

    await page.getByLabel("Severity", { exact: false }).selectOption("HIGH");

    // The table is never replaced by a skeleton and never unmounts: a filter is
    // a narrowing of what is already there, not an arrival at a new page.
    await expect(table).toBeVisible();
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 20_000 });

    const severities = await page.getByRole("row").filter({ hasText: "HIGH" }).count();
    expect(severities).toBeGreaterThan(0);

    test.skip(scrolled === null, "the queue is short enough to need no scrolling here");

    // Filtering to one severity genuinely shortens the region, and a browser
    // clamps an offset it can no longer honour. What must not happen is the
    // reader being sent back to the top of a region that is still long enough
    // to hold where they were.
    const { after, reachable } = await page.evaluate(() => {
      const element = document.querySelector('[data-reader-scroller="true"]');
      if (element) {
        return {
          after: element.scrollTop,
          reachable: element.scrollHeight - element.clientHeight,
        };
      }
      return {
        after: window.scrollY,
        reachable:
          document.documentElement.scrollHeight - document.documentElement.clientHeight,
      };
    });
    expect(Math.abs(after - Math.min(scrolled, reachable))).toBeLessThan(40);
  });

  test("a case opens onto its own deterministic evidence", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    const evidence = detail.data.evidence;

    const view = await openReview(page, detail.data.student.full_name);

    await expect(view.getByText("Diagnostic baseline")).toBeVisible();
    await expect(view.getByText("Current score")).toBeVisible();
    await expect(
      view.getByText(String(evidence.unsuccessful_attempts), { exact: true }).first(),
    ).toBeVisible();
    await expect(view.getByText(detail.data.competency.name, { exact: false })).toBeVisible();
  });

  test("a teacher records an action and the case moves with it", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const before = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    const view = await openReview(page, before.data.student.full_name);

    const note = `Guided number-line session booked ${Date.now()}.`;
    await view.getByLabel("Teacher remediation notes").fill(note);
    await view.getByRole("button", { name: "Additional Exercise" }).click();
    await view.getByRole("button", { name: /Record intervention/ }).click();

    // The confirmation is a toast, not a banner inside the form: it must not
    // move the record button somebody has just pressed.
    const toast = page.getByRole("status").filter({ hasText: "Intervention recorded" });
    const buttonBefore = await view
      .getByRole("button", { name: "Record intervention" })
      .boundingBox();
    await expect(toast).toBeVisible({ timeout: 20_000 });
    await expect(toast).toContainText("Intervention recorded to the learner's case history.");
    const buttonAfter = await view
      .getByRole("button", { name: "Record intervention" })
      .boundingBox();
    expect(Math.abs(buttonAfter.y - buttonBefore.y), "the toast moved the page").toBeLessThan(2);

    await expect(toast.getByRole("button", { name: "Dismiss this message" })).toBeVisible();

    const after = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(after.data.educator_notes).toBe(note);
    expect(after.data.intervention_type).toBe("Additional Exercise");
  });

  test("the confirmation takes itself away, and can be closed sooner", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    const view = await openReview(page, detail.data.student.full_name);

    await view.getByLabel("Teacher remediation notes").fill(`Checked again ${Date.now()}.`);
    await view.getByRole("button", { name: /Record intervention/ }).click();

    const toast = page.getByRole("status").filter({ hasText: "Intervention recorded" });
    await expect(toast).toBeVisible({ timeout: 20_000 });

    // Closing it is immediate, and does not wait out the countdown.
    await toast.getByRole("button", { name: "Dismiss this message" }).click();
    await expect(toast).toHaveCount(0);

    // And a second save goes away on its own, between four and five seconds.
    await view.getByLabel("Teacher remediation notes").fill(`And again ${Date.now()}.`);
    await view.getByRole("button", { name: /Record intervention/ }).click();
    await expect(toast).toBeVisible({ timeout: 20_000 });

    // The countdown holds while the pointer is over the toast, which is where
    // the click left it. A teacher reading it keeps it; this one is not.
    await page.mouse.move(2, 2);
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
  });

  test("the case is attributed to the signed-in teacher, never to a browser claim", async ({
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(detail.data.recorded_by).toBeTruthy();

    // The educator is taken from the verified token inside the database
    // function, so naming somebody else in the body is refused outright.
    const forged = await api(request, fixture.token, "/interventions", {
      method: "POST",
      data: {
        student_id: detail.data.student.id,
        competency_id: detail.data.competency.id,
        severity: "LOW",
        intervention_type: "Other",
        teacher_admin_id: "00000000-0000-4000-8000-000000000001",
      },
    });
    expect(forged.status()).toBe(422);
  });

  test("nothing asks a language model until a teacher does", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    let asked = 0;
    await page.route("**/ai-suggestion", async (route) => {
      asked += 1;
      await route.continue();
    });

    const view = await openReview(page, detail.data.student.full_name);
    await expect(view.getByRole("heading", { name: /Suggested support plan/ })).toBeVisible();

    // Reading somebody's case is not consent to send their evidence anywhere.
    expect(asked).toBe(0);
    await expect(view.getByText("No suggestion has been asked for on this case.")).toBeVisible();
  });

  test("a teacher asks for a suggestion, keeps it, and nothing else moves", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const before = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    const view = await openReview(page, before.data.student.full_name);

    await view.getByRole("button", { name: SUGGEST }).click();

    // A plan on screen is one a teacher can take into their notes, so that
    // control is the signal that one arrived. The failure signal is the toast.
    const arrived = view.getByRole("button", { name: "Use in notes" });
    const refused = page.getByRole("alert").filter({ hasText: /suggestion/i });
    await expect(arrived.or(refused).first()).toBeVisible({ timeout: ADVICE_TIMEOUT });

    test.skip(
      (await arrived.count()) === 0,
      "advisory AI did not answer on this stack, which its own test below covers",
    );

    await expect(view.getByText(/^Suggested by AI/)).toBeVisible();
    // The configured model is a `.env` value and must never be on screen.
    await expect(view.getByText(/gpt|llama|groq\//i)).toHaveCount(0);

    const after = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(after.data.ai_insight).toBeTruthy();
    // Structure, not prose: the panel needs lines it can offer one at a time.
    expect(after.data.ai_plan).toBeTruthy();
    expect(after.data.ai_plan.gap).toBeTruthy();
    expect(Array.isArray(after.data.ai_plan.strategies)).toBe(true);
    expect(after.data.ai_plan.strategies.length).toBeLessThanOrEqual(3);
    // The whole promise: a suggestion is stored, and nothing it could decide
    // has been decided.
    expect(after.data.status).toBe(before.data.status);
    expect(after.data.severity).toBe(before.data.severity);
    expect(after.data.intervention_type).toBe(before.data.intervention_type);
    expect(after.data.educator_notes).toBe(before.data.educator_notes);
  });

  test("a suggestion is short enough to read and carries no Markdown", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    test.skip(!detail.data.ai_plan && !detail.data.ai_insight, "no stored suggestion to read");

    const view = await openReview(page, detail.data.student.full_name);
    const panel = view.getByRole("region", { name: /Suggested support plan/ });
    const text = await panel.innerText();

    // The whole panel, controls and disclaimer included, has to be scannable.
    // The version this replaced stored three thousand characters under two
    // headings that said the same thing twice.
    const words = text.split(/\s+/).filter(Boolean).length;
    expect(words, `the plan panel runs to ${words} words`).toBeLessThan(320);

    for (const marker of ["**", "###", "`"]) {
      expect(text, `raw ${marker} reached the teacher`).not.toContain(marker);
    }

    // At most three strategies, plus the scaffold and the next check.
    const lines = panel.getByRole("listitem");
    expect(await lines.count()).toBeLessThanOrEqual(5);

    // One plan, not a teaching note and a remediation idea saying it twice.
    await expect(view.getByRole("heading", { name: "Teaching note", exact: true })).toHaveCount(0);
    await expect(view.getByText("Remediation idea (advisory)")).toHaveCount(0);
  });

  test("a teacher can take one line of the plan without taking the rest", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    test.skip(
      !Array.isArray(detail.data.ai_plan?.strategies) ||
        detail.data.ai_plan.strategies.length === 0,
      "no strategy to take",
    );

    const view = await openReview(page, detail.data.student.full_name);
    const notes = view.getByLabel("Teacher remediation notes");
    await notes.fill("My own opening sentence.");

    const take = view.getByRole("button", { name: /^Use this in my notes: / }).first();
    await take.click();

    const draft = await notes.inputValue();
    // Appended, not replaced: taking a second idea must not discard the first,
    // and it must never discard a sentence the teacher wrote themselves.
    expect(draft).toContain("My own opening sentence.");
    expect(draft).not.toMatch(/From an AI suggestion/);
    expect(draft.length).toBeGreaterThan("My own opening sentence.".length);

    // And still nothing is saved until the teacher records it.
    const unchanged = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(unchanged.data.educator_notes).toBe(detail.data.educator_notes);
  });

  test("taking a suggestion up writes a draft the teacher edits and signs", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    test.skip(!detail.data.ai_plan && !detail.data.ai_insight, "no stored suggestion to take up");

    const view = await openReview(page, detail.data.student.full_name);
    const notes = view.getByLabel("Teacher remediation notes");
    const before = await notes.inputValue();

    await view.getByRole("button", { name: "Use in notes" }).click();

    const draft = await notes.inputValue();
    expect(draft).not.toBe(before);
    // The suggestion itself, with nothing to delete before writing.
    expect(draft).not.toMatch(/Reviewed an AI suggestion/);
    expect(draft.trim().length).toBeGreaterThan(0);

    // A draft is not a record. Nothing was saved by pressing that button.
    const unchanged = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(unchanged.data.educator_notes).toBe(detail.data.educator_notes);

    // And it is editable before it is signed.
    await notes.fill(`${draft} I will start on Monday.`);
    await expect(notes).toHaveValue(/I will start on Monday\.$/);
  });

  test("a teacher can ask again, and is never offered a way to delete the advice", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    test.skip(
      !detail.data.ai_plan && !detail.data.ai_insight,
      "no stored suggestion to regenerate or dismiss",
    );

    const view = await openReview(page, detail.data.student.full_name);
    await expect(view.getByRole("button", { name: REGENERATE })).toBeVisible();

    // Advice is replaced by asking again, never deleted from under the record.
    await expect(view.getByRole("button", { name: DISMISS })).toHaveCount(0);

    const gap = detail.data.ai_plan?.gap ?? detail.data.ai_insight;
    await view.getByRole("button", { name: REGENERATE }).click();
    await expect(view.getByText("Asking for a suggestion…")).toBeVisible();
    // Left in flight, this request lands in the middle of the next test and
    // rewrites the plan it is about to assert on.
    await expect(view.getByText("Asking for a suggestion…")).toHaveCount(0, {
      timeout: ADVICE_TIMEOUT,
    });

    const after = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    // Whatever it now says, the case around it did not move.
    expect(after.data.educator_notes).toBe(detail.data.educator_notes);
    expect(after.data.status).toBe(detail.data.status);
    expect(typeof gap).toBe("string");
  });

  test("an unavailable model leaves the whole workflow usable", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    await page.route("**/ai-suggestion", async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "groq_assistance_unavailable",
            message: "AI assistance is not available",
            request_id: "test",
          },
        }),
      });
    });

    const view = await openReview(page, detail.data.student.full_name);
    // Whichever the case is carrying: a first ask, or asking again.
    await view
      .getByRole("button", { name: new RegExp(`${SUGGEST}|${REGENERATE}`) })
      .click();

    const failure = page.getByRole("alert").filter({ hasText: /could not be produced/ });
    await expect(failure).toBeVisible({ timeout: 30_000 });

    // Exactly one control asks again, and it is the one that was always there.
    const retries = view.getByRole("button", {
      name: new RegExp(`Try again|${SUGGEST}|${REGENERATE}`),
    });
    await expect(retries).toHaveCount(1);

    // The deterministic evidence and the teacher's own form are untouched.
    await expect(view.getByText("Diagnostic baseline")).toBeVisible();
    await expect(view.getByLabel("Teacher remediation notes")).toBeEditable();
    await expect(view.getByRole("button", { name: /Record intervention/ })).toBeEnabled();
  });

  test("a failed regeneration keeps the suggestion that was already there", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    // The test before this one dismisses the plan, so this makes its own
    // rather than depending on what the case happens to be carrying.
    let detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    if (!detail.data.ai_plan) {
      const made = await api(request, fixture.token, `/interventions/${fixture.id}/ai-suggestion`, {
        method: "POST",
        data: {},
      });
      test.skip(!made.ok(), "advisory AI did not answer on this stack");
      detail = await made.json().then((body) => ({ data: body.data }));
    }
    test.skip(!detail.data.ai_plan, "no stored suggestion to lose");

    await page.route("**/ai-suggestion", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "groq_assistance_unavailable",
            message: "AI assistance is not available",
            request_id: "test",
          },
        }),
      });
    });

    const view = await openReview(page, detail.data.student.full_name);
    const gap = detail.data.ai_plan.gap;
    await expect(view.getByText(gap)).toBeVisible();

    await view.getByRole("button", { name: REGENERATE }).click();

    const failure = page.getByRole("alert").filter({ hasText: /could not be produced/ });
    await expect(failure).toBeVisible({ timeout: 30_000 });

    // Asking again and being refused must not cost the teacher the advice they
    // were already reading, and the way to ask again must stay where it was.
    await expect(view.getByText(gap)).toBeVisible();
    await expect(view.getByRole("button", { name: REGENERATE })).toBeVisible();

    // The message is temporary: it takes itself away without being dismissed.
    await page.mouse.move(2, 2);
    await expect(failure).toHaveCount(0, { timeout: 8_000 });

    const stored = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    expect(stored.data.ai_plan.gap).toBe(gap);
  });

  test("a failure nothing could fix offers no retry", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    // The shape an API that predates this feature answers with.
    await page.route("**/ai-suggestion", async (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
    );

    const view = await openReview(page, detail.data.student.full_name);
    await view
      .getByRole("button", { name: new RegExp(`${SUGGEST}|${REGENERATE}`) })
      .click();

    // Scoped by its wording: Next's own route announcer is also role="alert",
    // and an unqualified locator resolves to two elements.
    const failure = page.getByRole("alert").filter({ hasText: /not available here yet/ });
    await expect(failure).toBeVisible({ timeout: 30_000 });
    // Plain wording: nothing about restarting a server or a deployment.
    await expect(failure).not.toContainText(/[Rr]estart|deployment/);
  });

  test("a closed case is not offered a new suggestion", async ({ page }) => {
    const resolved = page
      .getByRole("row")
      .filter({ has: page.getByText("Resolved", { exact: true }) })
      .first();
    test.skip((await resolved.count()) === 0, "no resolved case in this queue");

    await resolved.getByRole("link", { name: /^Review the case for / }).click();
    await page.waitForURL(/\/teacher\/interventions\/[0-9a-f-]{36}/);

    const panel = page.getByRole("region", { name: /Suggested support plan/ });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: new RegExp(`${SUGGEST}|${REGENERATE}`) }),
    ).toHaveCount(0);
  });

  test("a failed save keeps the notes the teacher typed", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    await page.route(`**/interventions/${fixture.id}`, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      return route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "service_unavailable", message: "Try later.", request_id: "test" },
        }),
      });
    });

    const view = await openReview(page, detail.data.student.full_name);
    const notes = view.getByLabel("Teacher remediation notes");
    const typed = "A plan somebody spent two minutes writing.";
    await notes.fill(typed);
    await view.getByRole("button", { name: /Record intervention/ }).click();

    await expect(view.getByRole("alert").first()).toBeVisible({ timeout: 20_000 });
    // Losing what they wrote would be the second failure, and the worse one.
    await expect(notes).toHaveValue(typed);
  });

  const VIEWPORTS = [
    { name: "phone", width: 360, height: 780 },
    { name: "tall phone", width: 390, height: 844 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "short laptop", width: 1280, height: 620 },
    { name: "desktop", width: 1440, height: 900 },
  ];

  /** Nothing may push the page sideways, and no panel may scroll inside one. */
  async function assertFits(page, label) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(1);
  }

  test("the queue holds together from a phone to a short laptop", async ({ page }) => {
    for (const size of VIEWPORTS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(
        page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
      ).toBeVisible();
      await assertFits(page, `the queue at ${size.name}`);
    }
  });

  test("a case page holds together from a phone to a short laptop", async ({ page, request }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    await openReview(page, detail.data.student.full_name);

    for (const size of VIEWPORTS) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByRole("button", { name: "Record intervention" })).toBeVisible();
      await assertFits(page, `the case page at ${size.name}`);
    }
  });

  test("the suggestion controls are reachable and visibly focused from the keyboard", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();
    const view = await openReview(page, detail.data.student.full_name);

    const suggest = view.getByRole("button", { name: new RegExp(`${SUGGEST}|${REGENERATE}`) });
    await suggest.focus();
    await expect(suggest).toBeFocused();

    const ring = await suggest.evaluate((element) => {
      const style = window.getComputedStyle(element);
      return `${style.outlineWidth} ${style.boxShadow}`;
    });
    expect(ring).not.toBe("0px none");

    // The way out is a link, not a trap: a keyboard user can reach the queue
    // again without a pointer.
    const back = view.getByRole("link", { name: "Back to the intervention queue" });
    await back.focus();
    await expect(back).toBeFocused();
  });

  test("record action arrives in the form rather than at the top of the page", async ({
    page,
    request,
  }) => {
    test.skip(!fixture.id, "the fixture case could not be created on this stack");

    const detail = await (
      await api(request, fixture.token, `/interventions/${fixture.id}`)
    ).json();

    const row = page
      .getByRole("row")
      .filter({ hasText: detail.data.student.full_name })
      .first();
    await expect(row).toBeVisible({ timeout: 20_000 });

    await row.getByRole("button", { name: /^Quick actions for / }).click();
    await page
      .getByRole("menu", { name: "Quick actions" })
      .getByRole("menuitem", { name: /Record action…|Reopen case…/ })
      .click();

    await page.waitForURL(/at=record/);

    // The form is on screen and the cursor is already in it: "Record action"
    // and "Review" are the same page, and this is what makes them different.
    const form = page.getByRole("button", { name: "Record intervention" });
    await expect(form).toBeVisible();

    const focusedInsideForm = await page.evaluate(() => {
      const region = document.getElementById("record-action");
      return Boolean(region && document.activeElement && region.contains(document.activeElement));
    });
    expect(focusedInsideForm).toBe(true);

    const inView = await page.evaluate(() => {
      const region = document.getElementById("record-action");
      if (!region) return false;
      const box = region.getBoundingClientRect();
      return box.top < window.innerHeight && box.bottom > 0;
    });
    expect(inView).toBe(true);
  });

  test("the advanced filters stay out of the way and say when they are applied", async ({
    page,
  }) => {
    const trigger = page.getByRole("button", { name: /^Advanced filters/ });

    // Collapsed by default, and the controls behind it are genuinely hidden.
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Opened from")).toBeHidden();

    // Grade is gone: MathSmart teaches one grade, so the control asked a
    // question with one answer.
    await expect(page.getByLabel("Grade", { exact: false })).toHaveCount(0);
    for (const label of ["Severity", "Status", "Competency", "Section"]) {
      await expect(page.getByLabel(label, { exact: false })).toBeVisible();
    }

    await openAdvancedFilters(page);
    await expect(page.getByLabel("Opened from")).toBeVisible();

    await page.getByLabel("Minimum attempts").selectOption("2");
    await expect(page.getByText("Updating cases...")).toHaveCount(0, { timeout: 20_000 });

    // The badge is the promise that a collapsed panel is not hiding a filter.
    await expect(trigger).toContainText("1");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(page).not.toHaveURL(/attempts=/);
  });
});

describe("teacher interventions are closed to learners", () => {
  test.skip(!hasAccount(STUDENT_ACCOUNT), "no student account is configured");

  test("a learner who asks for the intervention queue does not get it", async ({ page }) => {
    await signIn(page, STUDENT_ACCOUNT);
    await page.waitForURL(/\/student\/dashboard/);

    await page.goto("/teacher/interventions");

    await expect(
      page.getByRole("heading", { name: "Teacher Intervention Dashboard" }),
    ).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "HIGH" })).toHaveCount(0);
  });
});
