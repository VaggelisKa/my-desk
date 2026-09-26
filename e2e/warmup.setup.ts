import { expect, test as setup } from "./fixtures";
import { waitForHydration } from "./pages/hydration";
import { users } from "./support/db";

// The dev server bundles dependencies lazily: the first visit to a page that
// imports a new package triggers a re-optimization and a full page reload,
// which would randomly interrupt whichever test hits it first. Crawl every
// page once up front so the tests run against a warm server.
setup("warm up the dev server", async ({ page, loginPage }) => {
  setup.setTimeout(180_000);

  let pages = [
    "/",
    "/reservations",
    "/admin",
    "/admin/people",
    "/admin/bookings",
    `/users/edit/${users.admin.id}`,
    "/automatic-reservations",
    "/metrics",
  ];

  // A cold optimizer reload can leave the first document unhydrated. Retry
  // navigation here, before any test actions, instead of exhausting the whole
  // setup timeout and relying on CI's test retries (local runs have none).
  async function warmPage(url: string) {
    await expect(async () => {
      await page.goto(url, { timeout: 15_000 });
      await waitForHydration(page, 15_000);
    }).toPass({ timeout: 60_000, intervals: [1_000] });
  }

  await warmPage("/login");
  await loginPage.login(users.admin.id);
  await expect(page).toHaveURL("/");

  // A second pass catches pages whose first load was cut short by a reload.
  for (let pass = 0; pass < 2; pass++) {
    for (let url of pages) {
      await warmPage(url);
    }
  }

  await page.goto("/login/guest");
});
