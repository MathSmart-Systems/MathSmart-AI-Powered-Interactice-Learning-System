import { expect } from "@playwright/test";

/**
 * What every MathSmart dialog has to do at every width.
 *
 * The dialogs are built from one primitive, `src/components/ui/dialog.jsx`, so
 * these checks belong in one place too: both role suites point at the same
 * assertions, and a regression in the primitive fails in both.
 */

/** The widths a dialog has to survive, from the narrowest phone upward. */
export const DIALOG_VIEWPORTS = [
  { name: "320x568", width: 320, height: 568 },
  { name: "375x667", width: 375, height: 667 },
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
];

/** The gutter the surface keeps between itself and the edge of the screen. */
export const MIN_GUTTER = 16;

// Sub-pixel rounding on a translated, centred box is expected; a missing
// gutter is not. One pixel of slack separates the two.
const SLACK = 1;

/**
 * Asserts the open dialog fits the viewport and stays operable.
 *
 * @param {import("@playwright/test").Page} page
 * @param {{width: number, height: number}} viewport
 * @param {{fullScreen?: boolean, baselineScrollWidth?: number}} [options]
 *   `fullScreen` exempts a dialog that is deliberately edge-to-edge from the
 *   gutter check, but not from the rest. `baselineScrollWidth` is how wide the
 *   page already was before the dialog opened.
 */
export async function expectDialogFits(
  page,
  viewport,
  { fullScreen = false, baselineScrollWidth = viewport.width } = {},
) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  const box = await dialog.boundingBox();
  expect(box, "the dialog has no box to measure").not.toBeNull();

  if (!fullScreen) {
    expect(box.x, `left gutter at ${viewport.width}px`).toBeGreaterThanOrEqual(
      MIN_GUTTER - SLACK,
    );
    expect(
      viewport.width - (box.x + box.width),
      `right gutter at ${viewport.width}px`,
    ).toBeGreaterThanOrEqual(MIN_GUTTER - SLACK);
    expect(box.y, `top gutter at ${viewport.height}px tall`).toBeGreaterThanOrEqual(
      MIN_GUTTER - SLACK,
    );
    expect(
      viewport.height - (box.y + box.height),
      `bottom gutter at ${viewport.height}px tall`,
    ).toBeGreaterThanOrEqual(MIN_GUTTER - SLACK);
  }

  // Opening a dialog may not push the page sideways. The comparison is
  // against the page's own width, not against zero: a page that already
  // overflows at this width is its own defect, and failing here for it would
  // say the dialog caused something it did not.
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(
    width,
    `opening the dialog widened the page at ${viewport.width}px`,
  ).toBeLessThanOrEqual(baselineScrollWidth);

  // The title and the close control are the two things a person needs to
  // orient themselves and get out again.
  await expect(dialog.getByRole("heading").first()).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close dialog" });
  if ((await close.count()) > 0) {
    await expect(close.first()).toBeVisible();
  }

  // A body taller than the surface scrolls inside it, which is what keeps the
  // header and the footer where they are. Scrolling it to the bottom is the
  // state that would strand them if the surface grew instead.
  const body = dialog.locator('[data-slot="dialog-body"]');
  if ((await body.count()) > 0) {
    await body.first().evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    const header = dialog.locator('[data-slot="dialog-header"]');
    if ((await header.count()) > 0) {
      await expect(header.first(), "the header scrolled out of reach").toBeInViewport();
    }
    const footer = dialog.locator('[data-slot="dialog-footer"]');
    if ((await footer.count()) > 0) {
      await expect(footer.first(), "the footer scrolled out of reach").toBeInViewport();
    }
  }

  // Every control inside the dialog stays on screen and stays tappable.
  for (const control of await dialog.getByRole("button").all()) {
    if (!(await control.isVisible())) continue;
    const controlBox = await control.boundingBox();
    if (!controlBox) continue;
    expect(controlBox.x, "a dialog control starts off the left edge").toBeGreaterThanOrEqual(
      -SLACK,
    );
    expect(
      controlBox.x + controlBox.width,
      "a dialog control runs past the right edge",
    ).toBeLessThanOrEqual(viewport.width + SLACK);
  }
}

/**
 * Asserts the dialog still behaves like a dialog: focus goes in, stays in,
 * Escape closes it, and focus comes back to whatever opened it.
 *
 * @param {import("@playwright/test").Page} page
 * @param {import("@playwright/test").Locator} trigger the control that opened it
 */
export async function expectDialogBehaviour(page, trigger) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // Focus is inside the surface, not left behind on the page.
  const startsInside = await dialog.evaluate((node) => node.contains(document.activeElement));
  expect(startsInside, "focus did not move into the dialog").toBe(true);

  // Tabbing all the way round never escapes it.
  for (let step = 0; step < 15; step += 1) {
    await page.keyboard.press("Tab");
    const stillInside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(stillInside, `focus left the dialog after ${step + 1} tabs`).toBe(true);
  }

  // A wheel over the dialog does not take the page behind it with it. This
  // uses a real wheel event, because that is the gesture a scroll lock exists
  // to catch — a programmatic scroll is not the same thing.
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.move(10, 10);
  await page.mouse.wheel(0, 300);
  const after = await page.evaluate(() => window.scrollY);
  expect(after, "the page behind the dialog scrolled").toBe(before);

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
}
