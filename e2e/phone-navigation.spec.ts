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
