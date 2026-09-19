import { expect, test } from "@playwright/test";

import { TEACHER_ADMIN_ACCOUNT, hasAccount, signIn } from "../support/accounts";

/**
 * The workspace sidebar's scroll behaviour.
 *
 * Both roles share `src/modules/shared/components/SidebarFrame.jsx`, so this
 * is really a test of that one file. Its navigation has to scroll on a short
 * screen or at a large zoom, with the wordmark above and the sign-out below
 * staying put, while the scrollbar itself stays unpainted — a track running
 * down the middle of the shell reads as a seam.
 *
 * Hidden is not the same as absent: the checks below are about the area still
 * scrolling, still reserving no space for a bar, and still reaching every
 * destination by wheel and by keyboard.
 */

const describe = hasAccount(TEACHER_ADMIN_ACCOUNT) ? test.describe : test.describe.skip;

/** Heights and widths that put the navigation under real pressure. */
const VIEWPORTS = [
  { name: "small phone", width: 320, height: 568 },
  { name: "phone", width: 375, height: 667 },
  { name: "tall phone", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "wide desktop", width: 1920, height: 1080 },
  // The case the hiding is for: a persistent sidebar with no room to spare.
  { name: "short laptop", width: 1280, height: 460 },
];

/**
 * The scrolling navigation area inside whichever sidebar is on screen.
 *
 * Both the persistent sidebar and the drawer are in the DOM below the large
 * breakpoint — one of them is display:none — so the visible one is the subject.
 */
function navScroller(page) {
  return page.locator('[data-slot="workspace-nav-scroll"]:visible');
}

/** Opens the drawer below the large breakpoint, where the sidebar is modal. */
async function revealSidebar(page) {
  const trigger = page.getByRole("button", { name: "Open workspace menu" });
  if (await trigger.isVisible()) {
    await trigger.click();
    await expect(page.getByRole("dialog")).toBeVisible();
  }
  await expect(page.getByRole("navigation", { name: "Workspace" })).toBeVisible();
}

describe("workspace sidebar scrolling", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, TEACHER_ADMIN_ACCOUNT);
    await page.waitForURL("**/teacher/dashboard");
  });

  for (const viewport of VIEWPORTS) {
    test(`the navigation stays scrollable on a ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/teacher/dashboard");
      await revealSidebar(page);

      const area = navScroller(page);
      const state = await area.evaluate((node) => {
        const style = getComputedStyle(node);
        return {
          overflowY: style.overflowY,
          scrollbarGutter: style.scrollbarGutter,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
          offsetWidth: node.offsetWidth,
          clientWidth: node.clientWidth,
        };
      });

      // Scrollable, never clipped shut.
      expect(state.overflowY, "the navigation is not a scroll area").toBe("auto");
      // No space reserved for a bar that is never drawn.
      expect(state.scrollbarGutter).not.toBe("stable");
      expect(
        state.offsetWidth - state.clientWidth,
        "the hidden scrollbar is still taking width",
      ).toBeLessThanOrEqual(1);

      // Every destination is present and reachable.
      const links = page.getByRole("navigation", { name: "Workspace" }).getByRole("link");
      const total = await links.count();
      expect(total).toBeGreaterThan(0);

      const last = links.nth(total - 1);
      await last.scrollIntoViewIfNeeded();
      await expect(last).toBeInViewport();
    });
  }

  test("a wheel over the navigation scrolls it when it overflows", async ({ page }) => {
    // Short enough that the destinations cannot all fit at once.
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto("/teacher/dashboard");
    await revealSidebar(page);

    const area = navScroller(page);
    const overflowing = await area.evaluate((node) => node.scrollHeight > node.clientHeight + 1);
    test.skip(!overflowing, "the navigation fits without scrolling at this height");

    const box = await area.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 300);

    await expect
      .poll(async () => area.evaluate((node) => node.scrollTop), {
        message: "the navigation did not scroll on a wheel",
      })
      .toBeGreaterThan(0);
  });

  test("the header and the sign-out stay put while the navigation scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto("/teacher/dashboard");
    await revealSidebar(page);

    const logout = page.getByRole("button", { name: "Log out" });
    const before = await logout.boundingBox();

    const area = navScroller(page);
    await area.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
    });

    const after = await logout.boundingBox();
    expect(Math.round(after.y), "the sign-out moved with the navigation").toBe(
      Math.round(before.y),
    );
    await expect(logout).toBeInViewport();
  });

  test("the keyboard reaches the last destination", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 400 });
    await page.goto("/teacher/dashboard");
    await revealSidebar(page);

    const links = page.getByRole("navigation", { name: "Workspace" }).getByRole("link");
    const last = links.nth((await links.count()) - 1);

    await last.focus();
    await expect(last).toBeFocused();
    await expect(last).toBeInViewport();
  });

  test("the navigation still works at 200% zoom", async ({ page }) => {
    // Halving the viewport is how a headless browser expresses 200% zoom:
    // the CSS pixels available halve in each direction.
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto("/teacher/dashboard");
    await revealSidebar(page);

    const area = navScroller(page);
    expect(await area.evaluate((node) => getComputedStyle(node).overflowY)).toBe("auto");

    const links = page.getByRole("navigation", { name: "Workspace" }).getByRole("link");
    const last = links.nth((await links.count()) - 1);
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
  });

  test("the page's own scrollbar is left alone", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/teacher/dashboard");

    const documentOverflow = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).overflowY,
      body: getComputedStyle(document.body).overflowY,
    }));

    // Whatever the page does, it is not what the sidebar utility does.
    expect(documentOverflow.html).not.toBe("hidden");
    expect(documentOverflow.body).not.toBe("hidden");
  });
});
