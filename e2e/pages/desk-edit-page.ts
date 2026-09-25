import type { Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";
import { ReservationsTable } from "./reservations-page";

export class DeskEditPage {
  readonly assignedUserInput;
  readonly saveButton;
  readonly unassignButton;
  readonly reservations;

  constructor(private readonly page: Page) {
    this.assignedUserInput = page.getByLabel("Assigned user id");
    this.saveButton = page.getByRole("button", { name: "Edit", exact: true });
    this.unassignButton = page.getByRole("button", { name: "Unassign desk" });
    this.reservations = new ReservationsTable(page);
  }

  async goto(deskId: number) {
    await gotoHydrated(this.page, `/desks/${deskId}/edit`);
  }

  async assignTo(userId: string) {
    await this.assignedUserInput.fill(userId);
    await this.saveButton.click();
  }

  /** The app asks for confirmation through `window.confirm`. */
  async unassign() {
    this.page.once("dialog", (dialog) => dialog.accept());
    await this.unassignButton.click();
  }
}
