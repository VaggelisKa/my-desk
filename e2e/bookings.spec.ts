import { authFile, expect, expectToast, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { bookingDay, desks } from "./support/db";

test.describe("an employee with a desk", () => {
  test.use({ storageState: authFile("alice") });

  test("sees upcoming days grouped by week and removes one", async ({
    page,
    db,
    reservationsPage,
  }) => {
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "monday",
    });
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "wednesday",
      weekOffset: 1,
    });

    await reservationsPage.goto();

    await expect(
      page.getByRole("heading", { name: "Bookings", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /This week/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Next week/ }),
    ).toBeVisible();
    await expect(reservationsPage.rows).toHaveCount(2);
    await expect(reservationsPage.row(bookingDay("monday").date)).toContainText(
      "Today",
    );
    // Each tab is self-contained: booking happens on Desks, not from here.
    await expect(page.getByRole("main").getByRole("link")).toHaveText([
      "Upcoming",
      "Recurring",
    ]);

    await reservationsPage
      .row(bookingDay("monday").date)
      .getByRole("button", { name: /^Remove/ })
      .click();

    await expectToast(page, "Reservation deleted!");
    await expect(reservationsPage.rows).toHaveCount(1);
    await expect(db.reservationsForDesk(desks.alice.id)).resolves.toHaveLength(
      1,
    );
  });

  test("says where bookings come from when nothing is booked", async ({
    reservationsPage,
  }) => {
    await reservationsPage.goto();

    await expect(reservationsPage.emptyState).toBeVisible();
    await expect(reservationsPage.emptyState.locator("..")).toContainText(
      "Desks tab",
    );
  });

  test("sets up, pauses and stops a weekly booking from Recurring", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    await gotoHydrated(page, "/reservations");
    await page
      .getByRole("navigation", { name: "Bookings" })
      .getByRole("link", { name: "Recurring" })
      .click();
    await expect(page).toHaveURL("/automatic-reservations");

    let setUp = page.getByRole("button", { name: "Set up weekly booking" });
    await expect(
      page.getByRole("button", { name: "Pick your days" }),
    ).toBeDisabled();
    await page.getByRole("checkbox", { name: "Mon" }).check();
    await page.getByRole("checkbox", { name: "Thu" }).check();
    await setUp.click();

    await expectToast(
      page,
      "Automatic reservation has been setup successfully!",
    );
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("img", { name: "Mon, booked" })).toBeVisible();
    await expect(page.getByRole("img", { name: "Thu, booked" })).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Tue, not booked" }),
    ).toBeVisible();
    await expect(db.user("emp001")).resolves.toMatchObject({
      autoReservationsCronId: expect.any(String),
    });

    await page.getByRole("button", { name: "Pause" }).click();
    await expectToast(page, "Automatic reservation has been disabled!");
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Stop and remove" }).click();
    await expectToast(page, "Automatic reservation has been deleted!");
    // The setup form comes back with the days that were set.
    await expect(setUp).toBeEnabled();
    await expect(page.getByRole("checkbox", { name: "Mon" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Tue" })).not.toBeChecked();
    await expect(db.user("emp001")).resolves.toMatchObject({
      autoReservationsCronId: null,
    });
    expect((await cronJobOrg.calls()).map((c) => c.method)).toEqual(
      expect.arrayContaining(["PUT", "PATCH", "DELETE"]),
    );
  });
});

test.describe("a guest without a desk", () => {
  test.use({ storageState: authFile("guest") });

  test("has no Recurring segment and is sent back from it", async ({
    page,
    reservationsPage,
  }) => {
    await reservationsPage.goto();

    await expect(reservationsPage.emptyState).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Bookings" }),
    ).toHaveCount(0);

    await page.goto("/automatic-reservations");
    await expect(page).toHaveURL("/reservations");
  });
});
