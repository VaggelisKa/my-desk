import type { Page } from "@playwright/test";
import { authFile, expect, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";

// On phones the page scrolls inside `.app-outlet`, not the window.
test.use({
  storageState: authFile("alice"),
  viewport: { width: 390, height: 500 },
});

test("Back returns to where the page was scrolled; a new page starts at the top", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  let outlet = page.locator(".app-outlet");
  let scrollTop = () => outlet.evaluate((el) => el.scrollTop);
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();

  await outlet.evaluate((el) => el.scrollTo(0, 250));
  await expect.poll(scrollTop).toBe(250);

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page).toHaveURL("/bookings");
  await expect.poll(scrollTop).toBe(0);

  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect.poll(scrollTop).toBe(250);
});

test("a tapped tab shows up straight away and fills in once its data arrives", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  let outlet = page.locator(".app-outlet");
  let scrollTop = () => outlet.evaluate((el) => el.scrollTop);
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await outlet.evaluate((el) => el.scrollTo(0, 250));
  await expect.poll(scrollTop).toBe(250);

  // Hold Bookings' data back until the skeleton has been checked.
  let release!: () => void;
  let held = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/bookings.data*", async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unclaimed" })).toHaveCount(0);
  await expect(page).toHaveURL("/");
  await expect.poll(scrollTop).toBe(0);

  release();
  await expect(page).toHaveURL("/bookings");
  await expect(page.getByText("Nothing booked yet")).toBeVisible();

  // The skeleton's scroll to the top did not overwrite where Desks was left.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect.poll(scrollTop).toBe(250);
});

/** Counts view transitions (the tab fade) from here on. */
async function countFades(page: Page) {
  await page.evaluate(() => {
    let doc = document as Document & {
      startViewTransition: (update: () => Promise<void>) => unknown;
    };
    let start = doc.startViewTransition.bind(doc);
    let win = window as unknown as { fades: number };
    win.fades = 0;
    doc.startViewTransition = (update) => {
      win.fades++;
      return start(update);
    };
  });
  return () =>
    page.evaluate(() => (window as unknown as { fades: number }).fades);
}

test("a tab tap fades into its page, and Back does not fade", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  let fades = await countFades(page);

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page).toHaveURL("/bookings");
  await expect(page.getByText("Nothing booked yet")).toBeVisible();
  expect(await fades()).toBe(1);

  await page.goBack();
  await expect(page).toHaveURL("/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  expect(await fades()).toBe(1);
});

test("a tab from the tab cache fades in without a skeleton", async ({
  page,
}) => {
  let warmed = page.waitForResponse(/\/bookings\.data\?.*warm/);
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await page.clock.fastForward(1_000);
  await warmed;

  await page.evaluate(() => {
    let win = window as unknown as { skeletons: number };
    win.skeletons = 0;
    new MutationObserver(() => {
      if (document.querySelector(".animate-pulse")) win.skeletons++;
    }).observe(document.body, { subtree: true, childList: true });
  });

  // Counts the page's entrance animations still to play when the fade takes
  // its picture of the new page.
  await page.evaluate(() => {
    let doc = document as Document & {
      startViewTransition: (update: () => Promise<void>) => unknown;
    };
    let start = doc.startViewTransition.bind(doc);
    doc.startViewTransition = (update) =>
      start(async () => {
        await update();
        (window as unknown as { enterAtLanding: number }).enterAtLanding =
          document
            .getAnimations()
            .filter(
              (animation) =>
                animation instanceof CSSAnimation &&
                animation.animationName === "enter" &&
                animation.playState !== "finished",
            ).length;
      });
  });

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page).toHaveURL("/bookings");
  await expect(page.getByText("Nothing booked yet")).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as unknown as { skeletons: number }).skeletons,
    ),
  ).toBe(0);
  // The fade is its entrance: once the page has rendered for it, the page's
  // own stagger doesn't play on top.
  expect(
    await page.evaluate(() => document.querySelectorAll(".enter").length),
  ).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => (window as unknown as { enterAtLanding: number }).enterAtLanding,
    ),
  ).toBe(0);
});

test("tapping another tab while one loads shows the new tab's skeleton", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await page.route(/\/(bookings|metrics)\.data/, () => {
    // Never answers, so both tabs stay loading.
  });

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();

  await page.getByRole("link", { name: "Metrics" }).last().click();
  await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unclaimed" })).toHaveCount(0);
  await expect(page).toHaveURL("/");
});

test("tapping your own tab while another loads adds no Back step", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await page.getByRole("link", { name: "Metrics" }).last().click();
  await expect(page).toHaveURL("/metrics");
  await page.route(/\/bookings\.data/, () => {
    // Never answers, so Bookings stays loading.
  });

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await page.getByRole("link", { name: "Metrics" }).last().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toHaveCount(0);
  await expect(page).toHaveURL("/metrics");

  await page.goBack();
  await expect(page).toHaveURL("/");
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("a tab tap goes straight to its page without a fade", async ({
    page,
  }) => {
    await gotoHydrated(page, "/");
    await page.getByRole("button", { name: "Unclaimed" }).waitFor();
    let fades = await countFades(page);

    await page.getByRole("link", { name: "Bookings" }).last().click();
    await expect(page).toHaveURL("/bookings");
    await expect(page.getByText("Nothing booked yet")).toBeVisible();
    expect(await fades()).toBe(0);
  });
});

test("a role an admin gave you shows once a tab refreshes", async ({
  page,
  db,
}) => {
  // Bookings is loaded into the tab cache in the background.
  let warmed = page.waitForResponse(/\/bookings\.data\?.*warm/);
  await gotoHydrated(page, "/");
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await page.clock.fastForward(1_000);
  await warmed;

  await db.setRole("alice", "admin");
  await page.clock.fastForward(6_000);
  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page).toHaveURL("/bookings");

  await expect(page.getByRole("link", { name: "Admin" }).last()).toBeVisible();

  // The newly opened tab is loaded in the background like the others.
  let adminWarmed = page.waitForRequest(/\/admin\.data\?.*warm/);
  await page.clock.fastForward(1_000);
  await adminWarmed;
});

test("the dock tucks into icons while scrolling down and opens again on the way up", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  let dock = page.getByRole("navigation", { name: "Main" }).last();
  await page.getByRole("button", { name: "Unclaimed" }).waitFor();
  await expect(dock).not.toHaveAttribute("data-compact");

  await page.mouse.move(195, 250);
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, 60);
  }
  await expect(dock).toHaveAttribute("data-compact", "true");
  // The labels fold away but still name the links.
  await expect(dock.getByRole("link", { name: "Bookings" })).toBeVisible();

  await page.mouse.wheel(0, -40);
  await expect(dock).not.toHaveAttribute("data-compact");

  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, 60);
  }
  await expect(dock).toHaveAttribute("data-compact", "true");
  await dock.getByRole("link", { name: "Bookings" }).click();
  await expect(page).toHaveURL("/bookings");
  await expect(dock).not.toHaveAttribute("data-compact");
});

test("the dock steps aside for the keyboard and comes back after Back", async ({
  page,
}) => {
  await gotoHydrated(page, "/");
  let dock = page.getByRole("navigation", { name: "Main" }).last();

  // On phones the account menu sits in the dock as "You".
  await dock.getByRole("button", { name: "You" }).click();
  await page
    .locator("#app-menu")
    .getByRole("link", { name: "Edit profile" })
    .click();
  await expect(page).toHaveURL("/users/edit/emp001");

  await page.getByLabel("First name").focus();
  await expect(dock).toHaveAttribute("data-hidden", "true");

  // The field goes away with its page while it still has focus. Chromium
  // reports that as a focusout; Safari does not, which app-shell.test.tsx
  // covers.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect(dock).not.toHaveAttribute("data-hidden");
});

// Safari zooms into any field with text under 16px when it gets focus.
test.describe("text fields are at least 16px so phones don't zoom", () => {
  async function expectFontSizes(fields: import("@playwright/test").Locator[]) {
    for (let field of fields) {
      let size = await field.evaluate((el) =>
        parseFloat(getComputedStyle(el).fontSize),
      );
      expect(
        size,
        await field.evaluate((el) => el.outerHTML),
      ).toBeGreaterThanOrEqual(16);
    }
  }

  test("on the profile", async ({ page }) => {
    await gotoHydrated(page, "/users/edit/emp001");
    await expectFontSizes([
      page.getByLabel("First name"),
      page.getByLabel("Last name"),
    ]);
  });

  test.describe("on sign in and registration", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("sign in", async ({ page }) => {
      await gotoHydrated(page, "/login");
      await expectFontSizes([page.getByLabel("User ID")]);
    });

    test("registration", async ({ page }) => {
      await gotoHydrated(page, "/login/guest");
      await expectFontSizes(await page.locator("input:visible").all());
    });
  });

  test.describe("in the Admin tab", () => {
    test.use({ storageState: authFile("admin") });

    test("search", async ({ page }) => {
      await gotoHydrated(page, "/admin/people");
      await expectFontSizes([page.getByRole("searchbox").first()]);
    });
  });
});

test.describe("haptic tick on dock taps", () => {
  let hapticSwitch = (page: import("@playwright/test").Page) =>
    page.locator('nav[aria-label="Main"] input[switch]');

  test.describe("on a touch screen", () => {
    test.use({ hasTouch: true, isMobile: true });

    test("the other tabs carry a switch to tap, and a tap still navigates", async ({
      page,
    }) => {
      await gotoHydrated(page, "/");
      // Every tab but the current one.
      await expect(hapticSwitch(page)).toHaveCount(2);
      await expect(hapticSwitch(page).first()).toBeVisible();

      await page.getByRole("link", { name: "Bookings" }).last().tap();
      await expect(page).toHaveURL("/bookings");
    });
  });

  test("with a mouse the tabs stay plain links", async ({ page }) => {
    await gotoHydrated(page, "/");
    await expect(hapticSwitch(page).first()).toBeHidden();
  });
});
