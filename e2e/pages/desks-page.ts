import type { Locator, Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

export class DesksPage {
  readonly accountMenu;
  readonly signOutButton;
  readonly showFreeDesksOnly;

  constructor(private readonly page: Page) {
    this.accountMenu = page.locator("#app-menu");
    this.signOutButton = this.accountMenu.getByRole("button", {
      name: "Sign out",
    });
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

  /** Opens the avatar menu in the masthead (the tests run at desktop size). */
  async openAccountMenu() {
    await this.page.getByRole("button", { name: /^Account menu/ }).click();
    await this.accountMenu.waitFor();
  }

  async menuLink(name: string) {
    await this.openAccountMenu();
    return this.accountMenu.getByRole("link", { name });
  }

  tab(name: string) {
    return this.page
      .locator(".app-masthead")
      .getByRole("link", { name, exact: true });
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
      .locator("xpath=following-sibling::p[1]");
    // The "Today" row: the sitter's name sits in a <p> next to the avatar.
    this.usedTodayBy = root
      .getByText("Today", { exact: true })
      .locator("xpath=following-sibling::*//p");
  }
}
