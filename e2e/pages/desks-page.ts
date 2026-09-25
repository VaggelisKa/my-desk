import type { Locator, Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

export class DesksPage {
  readonly sidebar;
  readonly logoutButton;
  readonly showFreeDesksOnly;

  constructor(private readonly page: Page) {
    this.sidebar = page.locator("[data-sidebar='sidebar']");
    this.logoutButton = page.getByRole("button", { name: "Logout" });
    this.showFreeDesksOnly = page.getByRole("checkbox", {
      name: "Show free desks only",
    });
  }

  async goto(search = "") {
    await gotoHydrated(this.page, `/${search}`);
  }

  /** Desk tiles are labelled with the first name of the assigned user. */
  desk(label: string) {
    return this.page.getByRole("button", { name: label, exact: true });
  }

  sidebarLink(name: string) {
    return this.sidebar.getByRole("link", { name });
  }

  async openDesk(label: string) {
    await this.desk(label).click();
    let dialog = new DeskDialog(this.page.getByRole("dialog"));
    await dialog.root.waitFor();

    return dialog;
  }
}

export class DeskDialog {
  readonly title;
  readonly reserveForTodayButton;
  readonly reserveLink;
  readonly editDeskLink;
  readonly assignedTo;
  readonly usedTodayBy;

  constructor(readonly root: Locator) {
    this.title = root.getByRole("heading");
    this.reserveForTodayButton = root.getByRole("button", {
      name: "Reserve for today",
    });
    this.reserveLink = root.getByRole("link", { name: "Reserve" });
    this.editDeskLink = root.getByRole("link", { name: "Edit desk info" });
    this.assignedTo = root
      .getByText("Assigned to", { exact: true })
      .locator("xpath=following-sibling::p");
    this.usedTodayBy = root
      .getByText("Used for today by", { exact: true })
      .locator("xpath=following-sibling::p");
  }
}
