import type { Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

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
