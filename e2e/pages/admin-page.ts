import type { Locator, Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

/** The Admin tab: Desks, People and Bookings lists, each row opens a sheet. */
export class AdminPage {
  readonly search;

  constructor(private readonly page: Page) {
    this.search = page.getByRole("searchbox").first();
  }

  async goto(segment: "" | "people" | "bookings" = "") {
    await gotoHydrated(this.page, segment ? `/admin/${segment}` : "/admin");
  }

  segment(name: "Desks" | "People" | "Bookings") {
    return this.page
      .getByRole("navigation", { name: "Admin" })
      .getByRole("link", { name, exact: true });
  }

  // The tests run at desktop size, where the lists are tables. Each row has
  // a Manage button that stretches over the whole row and opens a menu.

  /** A desk's row, by desk number, e.g. "1.1.2". */
  deskRow(label: string) {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: `Manage desk ${label}`, exact: true });
  }

  /** A person's row, by full name. */
  personRow(name: string) {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: `${name}, manage`, exact: true });
  }

  /** A day's bookings, e.g. "Tue 17 Mar". */
  day(label: string) {
    return this.page
      .getByRole("main")
      .locator(`[data-admin-day*="${label}"]:visible`);
  }

  async open(row: Locator) {
    await row.click();
    let sheet = new AdminSheet(this.page.locator("[data-travel-status]"));
    // Interacting before the sheet has come to rest fights its animation.
    await sheet.root.waitFor();
    await this.page.locator("[data-travel-status='idleInside']").waitFor();

    return sheet;
  }

  /**
   * On desktop, opens a row's actions menu, picks `action` and returns the
   * sheet it opens.
   */
  async act(row: Locator, action: string) {
    await row.click();
    await this.page
      .getByRole("menuitem", { name: action, exact: true })
      .click();
    await this.page.locator("[data-travel-status='idleInside']").waitFor();

    return new AdminSheet(this.page.locator("[data-travel-status]"));
  }

  /** On desktop, picks a quick action from a row's menu (no sheet). */
  async quickAction(row: Locator, action: string) {
    await row.click();
    await this.page
      .getByRole("menuitem", { name: action, exact: true })
      .click();
  }

  /** The page stacked on the sheet, once it has come to rest. */
  async stackedPage() {
    await this.page.locator("[data-page-status='idleInside']").waitFor();
    return new AdminSheet(this.page.locator("[data-page-status]"));
  }
}

export class AdminSheet {
  readonly title;
  readonly bookings;

  constructor(readonly root: Locator) {
    this.title = root.getByRole("heading").first();
    this.bookings = root.getByRole("listitem");
  }

  button(name: string | RegExp) {
    return this.root.getByRole("button", {
      name,
      exact: typeof name === "string",
    });
  }

  /** Taps a settings row, e.g. "Owner", and waits for its page. */
  async openPage(row: string) {
    await this.root
      .getByRole("button", { name: new RegExp(`^${row}`) })
      .click();
    let view = this.root.page().locator("[data-page-status]");
    await this.root.page().locator("[data-page-status='idleInside']").waitFor();
    return new AdminSheet(view);
  }

  /** Taps an action, then its confirm button. */
  async confirm(action: string, confirmLabel: string | RegExp) {
    await this.button(action).click();
    await this.button(confirmLabel).click();
  }

  async pick(query: string, name: string | RegExp) {
    await this.root.getByRole("searchbox").fill(query);
    await this.root.getByRole("button", { name }).click();
  }
}
