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
      name: "Free only",
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
    // The sheet slides in; interacting with it before it has come to rest
    // fights the animation (and Playwright's scroll-into-view can dismiss it).
    await dialog.root.waitFor();
    await this.page.locator("[data-travel-status='idleInside']").waitFor();

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
    this.reserveLink = root.getByRole("link", { name: "Book days" });
    this.editDeskLink = root.getByRole("link", { name: "Edit desk info" });
    this.assignedTo = root
      .getByText("Assigned to", { exact: true })
      .locator("xpath=following-sibling::p");
    // The "Today" row: the sitter's name sits in a <p> next to the avatar.
    this.usedTodayBy = root
      .getByText("Today", { exact: true })
      .locator("xpath=following-sibling::*//p");
  }
}
