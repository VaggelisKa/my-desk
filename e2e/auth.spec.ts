import { authFile, expect, test } from "./fixtures";
import { GuestRegistrationPage } from "./pages/login-page";
import { users } from "./support/db";

test.describe("logged out", () => {
  test("protected pages redirect to the login page", async ({
    page,
    loginPage,
  }) => {
    await page.goto("/reservations");

    await expect(page).toHaveURL("/login");
    await expect(loginPage.heading).toBeVisible();
  });

  test("an employee logs in with their user id", async ({
    page,
    loginPage,
    desksPage,
  }) => {
    await loginPage.goto();
    await loginPage.login(users.alice.id.toUpperCase());

    await expect(page).toHaveURL("/");
    await expect(desksPage.logoutButton).toBeVisible();
    await expect(desksPage.sidebarLink("Add reservation")).toBeVisible();
    await expect(desksPage.sidebarLink("Edit profile")).toHaveAttribute(
      "href",
      `/users/edit/${users.alice.id}`,
    );
  });

  test("an unknown user id is rejected", async ({ page, loginPage }) => {
    await loginPage.goto();
    await loginPage.login("zzz999");

    await expect(page.getByText("No user found")).toBeVisible();
    await expect(page).toHaveURL("/login");
    await expect(loginPage.userIdInput).toBeEmpty();
    await expect(loginPage.userIdInput).toBeFocused();
  });

  test("a user id with the wrong length is rejected", async ({
    page,
    loginPage,
  }) => {
    await loginPage.goto();
    await loginPage.login("emp");

    await expect(page.getByText("Invalid employee number")).toBeVisible();
    await expect(page).toHaveURL("/login");
  });

  test("a guest registers a new account and is logged in", async ({
    page,
    db,
    loginPage,
    desksPage,
  }) => {
    let registration = new GuestRegistrationPage(page);

    await loginPage.goto();
    await loginPage.registerLink.click();
    await expect(registration.heading).toBeVisible();

    await registration.register({
      id: "GST777",
      firstName: "Grace",
      lastName: "Visitor",
    });

    await expect(page).toHaveURL("/");
    await expect(desksPage.logoutButton).toBeVisible();
    // Guests have no permanent desk, so they cannot plan reservations ahead.
    await expect(desksPage.sidebarLink("Add reservation")).toBeHidden();
    await expect(db.user("gst777")).resolves.toMatchObject({
      firstName: "Grace",
      lastName: "Visitor",
      role: "user",
    });
  });
});

test.describe("logged in", () => {
  test.use({ storageState: authFile("alice") });

  test("visiting the login page redirects home", async ({ page }) => {
    await page.goto("/login");

    await expect(page).toHaveURL("/");
  });

  test("logging out ends the session", async ({
    page,
    desksPage,
    loginPage,
  }) => {
    await desksPage.goto();
    await desksPage.logoutButton.click();

    await expect(page).toHaveURL("/login");
    await expect(loginPage.heading).toBeVisible();

    await page.goto("/");
    await expect(page).toHaveURL("/login");
  });
});
