import { authFile, expect, expectToast, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { bookingDay, desks, users } from "./support/db";

test.describe("an employee with a desk", () => {
  test.use({ storageState: authFile("alice") });

  test("sees upcoming days grouped by week and removes one", async ({
    page,
    db,
    bookingsPage,
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

    await bookingsPage.goto();

    await expect(
      page.getByRole("heading", { name: "Bookings", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /This week/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Next week/ }),
    ).toBeVisible();
    await expect(bookingsPage.rows).toHaveCount(2);
    await expect(bookingsPage.row(bookingDay("monday").date)).toContainText(
      "Today",
    );
    // Each tab is self-contained: booking happens on Desks, not from here.
    await expect(page.getByRole("main").getByRole("link")).toHaveText([
      "Upcoming",
      "Recurring",
    ]);

    await bookingsPage
      .row(bookingDay("monday").date)
      .getByRole("button", { name: /^Remove/ })
      .click();

    await expectToast(page, "Booking removed");
    await expect(bookingsPage.rows).toHaveCount(1);
    await expect(db.reservationsForDesk(desks.alice.id)).resolves.toHaveLength(
      1,
    );
  });

  test("says where bookings come from when nothing is booked", async ({
    bookingsPage,
  }) => {
    await bookingsPage.goto();

    await expect(bookingsPage.emptyState).toBeVisible();
    await expect(bookingsPage.emptyState.locator("..")).toContainText(
      "Desks tab",
    );
  });

  test("sets up, pauses and stops a weekly booking from Recurring", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    await gotoHydrated(page, "/bookings");
    await page
      .getByRole("navigation", { name: "Bookings" })
      .getByRole("link", { name: "Recurring" })
      .click();
    await expect(page).toHaveURL("/bookings/recurring");

    let setUp = page.getByRole("button", { name: "Set up weekly booking" });
    await expect(
      page.getByRole("button", { name: "Pick your days" }),
    ).toBeDisabled();
    await page.getByRole("checkbox", { name: "Mon" }).check();
    await page.getByRole("checkbox", { name: "Thu" }).check();
    await setUp.click();

    await expectToast(page, "Weekly booking set up");
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Mon" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Thu" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Tue" })).not.toBeChecked();
    await expect(db.user("emp001")).resolves.toMatchObject({
      autoReservationsCronId: expect.any(String),
    });

    await page.getByRole("button", { name: "Pause" }).click();
    await expectToast(page, "Weekly booking paused");
    await expect(page.getByText("Paused", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Stop and remove" }).click();
    await expectToast(page, "Weekly booking stopped");
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

  test("cannot pause, resume or remove someone else's weekly booking", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    await db.setCronId("bob", "777");

    for (let intent of ["DISABLE", "ENABLE", "DELETE", "CHANGE_DAYS"]) {
      let response = await page.request.post("/bookings/recurring", {
        form: { intent, cronId: "777", day: "monday" },
      });
      // Alice has no weekly booking of her own to change.
      expect(response.status()).toBe(404);
    }

    expect(await cronJobOrg.calls()).toEqual([]);
    await expect(db.user("emp002")).resolves.toMatchObject({
      autoReservationsCronId: "777",
    });
  });

  test("says so when the scheduler cannot be reached, and changes nothing", async ({
    page,
    db,
  }) => {
    await db.setCronId("alice", "down-1");

    await gotoHydrated(page, "/bookings/recurring");
    await expect(
      page.getByText("Could not reach the scheduler, so its status is unknown"),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Pause" })).toHaveCount(0);

    for (let intent of ["DISABLE", "DELETE"]) {
      let response = await page.request.post("/bookings/recurring", {
        form: { intent },
      });
      expect(response.status()).toBe(502);
    }
    // The job is still hers, since cron-job.org never removed it.
    await expect(db.user(users.alice.id)).resolves.toMatchObject({
      autoReservationsCronId: "down-1",
    });
  });

  test("sets up only one weekly booking, for her own desk", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    let setUp = () =>
      page.request.post("/bookings/recurring", {
        form: { intent: "ADD", day: "monday", deskId: String(desks.bob.id) },
      });

    expect((await setUp()).status()).toBe(200);
    expect((await setUp()).status()).toBe(409);

    let calls = await cronJobOrg.calls();
    expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1);
    let jobId = (await db.user("emp001"))?.autoReservationsCronId;
    expect(jobId).toEqual(expect.any(String));
    await page.goto("/bookings/recurring");
    await expect(page.getByRole("checkbox", { name: "Mon" })).toBeChecked();
  });

  test("changes the days of her weekly booking in place", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    await gotoHydrated(page, "/bookings/recurring");
    await page.getByRole("checkbox", { name: "Mon" }).check();
    await page.getByRole("button", { name: "Set up weekly booking" }).click();
    await expectToast(page, "Weekly booking set up");
    let jobId = (await db.user("emp001"))?.autoReservationsCronId;

    let save = page.getByRole("button", { name: "Save days" });
    // Nothing to save until the days differ from what is set.
    await expect(save).toBeDisabled();
    await page.getByRole("checkbox", { name: "Mon" }).uncheck();
    await expect(
      page.getByRole("button", { name: "Pick your days" }),
    ).toBeDisabled();
    await page.getByRole("checkbox", { name: "Wed" }).check();
    await page.getByRole("checkbox", { name: "Fri" }).check();
    await save.click();

    await expectToast(page, "Weekly booking updated");
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Mon" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Wed" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Fri" })).toBeChecked();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    // Same job, changed in place: never removed and set up again.
    await expect(db.user("emp001")).resolves.toMatchObject({
      autoReservationsCronId: jobId,
    });
    let calls = (await cronJobOrg.calls()).map((c) => c.method);
    expect(calls.filter((m) => m === "PUT")).toHaveLength(1);
    expect(calls).not.toContain("DELETE");
    expect(calls).toContain("PATCH");
  });
});

test.describe("a guest without a desk", () => {
  test.use({ storageState: authFile("guest") });

  test("has no Recurring segment and is sent back from it", async ({
    page,
    bookingsPage,
  }) => {
    await bookingsPage.goto();

    await expect(bookingsPage.emptyState).toBeVisible();
    await expect(
      page.getByRole("navigation", { name: "Bookings" }),
    ).toHaveCount(0);

    await page.goto("/bookings/recurring");
    await expect(page).toHaveURL("/bookings");
  });
});
