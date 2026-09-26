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

  /** A row in the Desks list, by desk number, e.g. "1.1.2". */
  deskRow(label: string) {
    return this.page
      .getByRole("main")
      .getByRole("button", {
        name: new RegExp(`desk ${label.replace(/\./g, "\\.")}\\b`),
      });
  }

  /** A row in the People list, by full name. */
  personRow(name: string) {
    return this.page
      .getByRole("main")
      .getByRole("button", { name: new RegExp(`^${name}`, "i") });
  }

  /** A day's group in the Bookings list, e.g. "Tue 17 Mar". */
  day(label: string) {
    return this.page
      .getByRole("main")
      .getByRole("region", { name: new RegExp(label) });
  }

  async open(row: Locator) {
    await row.click();
    let sheet = new AdminSheet(this.page.getByRole("dialog"));
    // Interacting before the sheet has come to rest fights its animation.
    await sheet.root.waitFor();
    await this.page.locator("[data-travel-status='idleInside']").waitFor();

    return sheet;
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
