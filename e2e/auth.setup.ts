import { authFile, expect, test as setup } from "./fixtures";
import { users, type SeedUser } from "./support/db";

// Log in once per seeded user through the real login form and store the
// session, so specs can start already authenticated (`test.use({ storageState })`).
// The cookie only holds the user id, which the per-test reseed keeps stable.
for (let user of Object.keys(users) as SeedUser[]) {
  setup(`authenticate as ${user}`, async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login(users[user].id);

    await expect(page).toHaveURL("/");
    await page.context().storageState({ path: authFile(user) });
  });
}
