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

  /** The desk sheet opened by a link, once it has come to rest. */
  async dialog() {
    let dialog = new DeskDialog(this.page.getByRole("dialog"));
    await dialog.root.waitFor();
    await this.page.locator("[data-travel-status='idleInside']").waitFor();

    return dialog;
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
  readonly bookButton;
  readonly assignedTo;
  readonly usedTodayBy;

  constructor(readonly root: Locator) {
    this.title = root.getByRole("heading");
    this.reserveForTodayButton = root.getByRole("button", {
      name: "Reserve for today",
    });
    this.bookButton = root.getByRole("button", {
      name: /^(Book \d|Pick days)/,
    });
    this.assignedTo = root
      .getByText("Assigned to", { exact: true })
      .locator("xpath=following-sibling::p[1]");
    // The "Today" row: the sitter's name sits in a <p> next to the avatar.
    this.usedTodayBy = root
      .getByText("Today", { exact: true })
      .locator("xpath=following-sibling::*//p");
  }

  /** A day in the two-week grid, e.g. "Mon 17 Mar". Free days the owner can
   * book are checkboxes; every other day is a readout image. */
  day(label: string) {
    return this.root.getByRole("checkbox", { name: new RegExp(`^${label},`) });
  }

  dayStatus(label: string) {
    return this.root.getByRole("img", { name: new RegExp(`^${label},`) });
  }

  bookableDays() {
    return this.root.getByRole("checkbox");
  }

  async book(labels: string[]) {
    for (let label of labels) {
      await this.day(label).check();
    }
    await this.bookButton.click();
  }
}
