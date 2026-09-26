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
