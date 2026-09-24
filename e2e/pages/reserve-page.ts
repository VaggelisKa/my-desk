import type { Page } from "@playwright/test";
import type { Weekday } from "../support/db";
import { gotoHydrated } from "./hydration";

export class ReservePage {
  readonly weekSelect;
  readonly reserveButton;
  readonly noAvailableDays;

  constructor(private readonly page: Page) {
    this.weekSelect = page.getByRole("combobox");
    this.reserveButton = page.getByRole("button", {
      name: "Reserve",
      exact: true,
    });
    this.noAvailableDays = page.getByText("No available days to reserve!");
  }

  /** Without a desk id the page resolves the logged in user's own desk. */
  async goto(deskId?: number) {
    await gotoHydrated(this.page, deskId ? `/reserve/${deskId}` : "/reserve");
  }

  day(day: Weekday) {
    return this.page.getByRole("checkbox", {
      name: new RegExp(`^${day}`, "i"),
    });
  }

  async selectWeek(week: "Current" | "Next") {
    await this.weekSelect.click();
    await this.page
      .getByRole("option", { name: new RegExp(`^${week} \\(`) })
      .click();
  }

  async reserve(days: Weekday[]) {
    for (let day of days) {
      await this.day(day).check();
    }

    await this.reserveButton.click();
  }
}
