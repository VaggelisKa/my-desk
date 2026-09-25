import type { Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

/** The reservations table, shared by "My reservations" and the desk edit page. */
export class ReservationsTable {
  readonly rows;

  constructor(private readonly page: Page) {
    this.rows = page.getByRole("row").filter({ has: page.getByRole("cell") });
  }

  /** `date` in the app's `dd.MM.yyyy` format. */
  row(date: string) {
    return this.rows.filter({ hasText: `(${date})` });
  }

  async delete(date: string) {
    await this.row(date)
      .getByRole("button", { name: "Delete reservation" })
      .click();
  }
}

/** The Bookings page's Upcoming list, grouped by week. */
export class ReservationsPage {
  readonly rows;
  readonly emptyState;

  constructor(private readonly currentPage: Page) {
    this.rows = currentPage.getByRole("listitem");
    this.emptyState = currentPage.getByRole("heading", {
      name: "Nothing booked yet",
    });
  }

  /** `date` in the app's `dd.MM.yyyy` format. */
  row(date: string) {
    return this.currentPage.locator(`li[data-date="${date}"]`);
  }

  async goto() {
    await gotoHydrated(this.currentPage, "/reservations");
  }
}
