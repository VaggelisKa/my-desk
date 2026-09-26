import { test as base, expect, type Page } from "@playwright/test";
import { AdminPage } from "./pages/admin-page";
import { DesksPage } from "./pages/desks-page";
import { trackHydration } from "./pages/hydration";
import { LoginPage } from "./pages/login-page";
import { ReservationsPage } from "./pages/reservations-page";
import { CronJobOrgStub } from "./support/cron";
import { TestDatabase, type SeedUser } from "./support/db";
import { NOW } from "./support/env";

/** Storage state saved by `auth.setup.ts` for each seeded user. */
export function authFile(user: SeedUser) {
  return `e2e/.auth/${user}.json`;
}

type Fixtures = {
  db: TestDatabase;
  cronJobOrg: CronJobOrgStub;
  loginPage: LoginPage;
  desksPage: DesksPage;
  reservationsPage: ReservationsPage;
  adminPage: AdminPage;
};

export const test = base.extend<Fixtures>({
  // Every test starts from the same seeded database. Auto so that tests which
  // only use `page` are isolated too.
  db: [
    async ({}, use) => {
      let db = await TestDatabase.connect();
      await db.reset();
      await use(db);
      db.close();
    },
    { auto: true },
  ],

  cronJobOrg: async ({}, use) => {
    let stub = new CronJobOrgStub();
    await stub.clear();
    await use(stub);
  },

  // The server clock is pinned by the preload script; pin the browser clock to
  // the same instant so client-rendered dates match the server. The init
  // scripts power `waitForHydration` and `expectToast`.
  page: async ({ page }, use) => {
    await page.clock.install({ time: NOW });
    await page.addInitScript(trackHydration);
    await page.addInitScript(recordToasts);
    await use(page);
  },

  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  desksPage: async ({ page }, use) => use(new DesksPage(page)),
  reservationsPage: async ({ page }, use) => use(new ReservationsPage(page)),
  adminPage: async ({ page }, use) => use(new AdminPage(page)),
});

export { expect };

declare global {
  interface Window {
    __e2eToasts: string[];
  }
}

/**
 * Success toasts dismiss themselves after 3 seconds, which a slow run can
 * outlast before the assertion gets to look. Record every toast the page
 * renders instead, so assertions do not race the auto-dismiss timer.
 */
function recordToasts() {
  window.__e2eToasts = [];
  let last = "";

  // A new toast can replace the one on screen in place, so look at the
  // toast's text after every change rather than only at added nodes.
  new MutationObserver(() => {
    let text = document.querySelector("[data-toast]")?.textContent ?? "";
    if (text && text !== last) {
      window.__e2eToasts.push(text);
    }
    last = text;
  }).observe(document, { childList: true, subtree: true, characterData: true });
}

function shownToasts(page: Page) {
  return page.evaluate(() => window.__e2eToasts);
}

/** Asserts that a toast containing the given text was shown. */
export async function expectToast(page: Page, text: string) {
  await expect
    .poll(() => shownToasts(page), {
      message: `Expected a toast with "${text}"`,
    })
    .toContainEqual(expect.stringContaining(text));
}

/** Asserts that no toast containing the given text has been shown. */
export async function expectNoToast(page: Page, text: string) {
  expect(await shownToasts(page)).not.toContainEqual(
    expect.stringContaining(text),
  );
}
