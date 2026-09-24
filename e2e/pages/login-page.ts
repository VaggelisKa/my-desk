import type { Page } from "@playwright/test";
import { gotoHydrated } from "./hydration";

export class LoginPage {
  readonly heading;
  readonly userIdInput;
  readonly loginButton;
  readonly registerLink;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Login to profile" });
    this.userIdInput = page.getByLabel("User ID");
    this.loginButton = page.getByRole("button", { name: "Login" });
    this.registerLink = page.getByRole("link", { name: "Click here" });
  }

  async goto() {
    await gotoHydrated(this.page, "/login");
  }

  async login(userId: string) {
    await this.userIdInput.fill(userId);
    await this.loginButton.click();
  }
}

export class GuestRegistrationPage {
  readonly heading;
  readonly userIdInput;
  readonly firstNameInput;
  readonly lastNameInput;
  readonly submitButton;

  constructor(private readonly page: Page) {
    this.heading = page.getByRole("heading", { name: "Register new account" });
    this.userIdInput = page.getByLabel("User ID");
    this.firstNameInput = page.getByLabel("First name");
    this.lastNameInput = page.getByLabel("Last name");
    this.submitButton = page.getByRole("button", { name: "Login" });
  }

  async register(user: { id: string; firstName: string; lastName: string }) {
    await this.userIdInput.fill(user.id);
    await this.firstNameInput.fill(user.firstName);
    await this.lastNameInput.fill(user.lastName);
    await this.submitButton.click();
  }
}
