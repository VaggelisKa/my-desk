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
  await expect(page).toHaveURL("/reservations");
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
  await page.route("**/reservations.data*", async (route) => {
    await held;
    await route.continue();
  });

  await page.getByRole("link", { name: "Bookings" }).last().click();
  await expect(page.getByRole("heading", { name: "Bookings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Unclaimed" })).toHaveCount(0);
  await expect(page).toHaveURL("/");
  await expect.poll(scrollTop).toBe(0);

  release();
  await expect(page).toHaveURL("/reservations");
  await expect(page.getByText("Nothing booked yet")).toBeVisible();

  // The skeleton's scroll to the top did not overwrite where Desks was left.
  await page.goBack();
  await expect(page).toHaveURL("/");
  await expect.poll(scrollTop).toBe(250);
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
  await expect(page).toHaveURL("/reservations");
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
