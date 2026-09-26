import { authFile, expect, expectToast, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { bookingDay, desks, users } from "./support/db";

// The clock is pinned to a Monday morning, so Monday is "today" and every
// other weekday of the week is after today.

test.describe("as an admin", () => {
  test.use({ storageState: authFile("admin") });

  test("finds the Admin tab beside Metrics", async ({ page, desksPage }) => {
    await desksPage.goto();

    await desksPage.tab("Admin").click();

    await expect(page).toHaveURL("/admin");
    await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  });

  test("gives an unclaimed desk to someone", async ({
    page,
    db,
    adminPage,
    desksPage,
  }) => {
    await adminPage.goto();

    let sheet = await adminPage.open(adminPage.deskRow("2.1.1"));
    await sheet.button("Give to someone").click();
    await sheet.pick("gary", /^Gary Guest/i);
    await expect(sheet.root).toContainText("Gary gets desk 2.1.1");
    await sheet.button("Move desk to Gary").click();

    await expectToast(page, "Moved desk 2.1.1 to Gary");
    await expect(db.desk(desks.unclaimed.id)).resolves.toMatchObject({
      userId: users.guest.id,
    });

    await desksPage.goto();
    await expect(desksPage.desk(users.guest.firstName)).toBeVisible();
  });

  test("moves a desk to someone who already has one, and says what changes first", async ({
    page,
    db,
    cronJobOrg,
    adminPage,
  }) => {
    await db.setCronId("bob", "4242");
    // Bob sits at his desk today and has booked it ahead.
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "monday",
    });
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });
    // Alice booked her own desk ahead, which she is about to give up.
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "wednesday",
    });

    await adminPage.goto();
    let sheet = await adminPage.open(adminPage.deskRow("1.1.2"));
    await sheet.button("Change owner").click();
    await sheet.pick("alice", /^Alice Andersen/i);

    await expect(sheet.root).toContainText(
      "Bob loses desk 1.1.2 and 1 booked day on it after today. Their weekly booking stops.",
    );
    await expect(sheet.root).toContainText(
      "Alice's desk 1.1.1 becomes unclaimed. 1 booked day on it after today is cancelled.",
    );
    await sheet.button("Move desk to Alice").click();

    await expectToast(page, "Moved desk 1.1.2 to Alice");
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.alice.id,
    });
    // Nobody ends up with two desks.
    await expect(db.desk(desks.alice.id)).resolves.toMatchObject({
      userId: null,
    });
    // Today stays, the days after it go.
    await expect(db.reservation(desks.bob.id, "monday")).resolves.toMatchObject(
      {
        userId: users.bob.id,
      },
    );
    await expect(
      db.reservation(desks.bob.id, "tuesday"),
    ).resolves.toBeUndefined();
    await expect(
      db.reservation(desks.alice.id, "wednesday"),
    ).resolves.toBeUndefined();
    await expect(db.user(users.bob.id)).resolves.toMatchObject({
      autoReservationsCronId: null,
    });
    await expect(cronJobOrg.calls()).resolves.toEqual([
      { method: "DELETE", path: "/jobs/4242" },
    ]);
  });

  test("goes straight to picking a person from a desk's Reassign button", async ({
    page,
    db,
    adminPage,
  }) => {
    await adminPage.goto();

    let sheet = await adminPage.open(adminPage.reassign("1.1.2"));
    await expect(sheet.root.getByText("Give this desk to")).toBeVisible();
    await sheet.pick("gary", /^Gary Guest/i);
    await sheet.button("Move desk to Gary").click();

    await expectToast(page, "Moved desk 1.1.2 to Gary");
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.guest.id,
    });
  });

  test("sorts the desks table by a column", async ({ page, db, adminPage }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "wednesday",
    });
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "tuesday",
    });

    await adminPage.goto();
    let manage = page
      .getByRole("main")
      .getByRole("button", { name: /^Manage desk / });
    await expect(manage.first()).toHaveAccessibleName("Manage desk 1.1.1");

    let booked = page.getByRole("columnheader", { name: "Booked" });
    await booked.getByRole("button").click();

    // Most booked first on the first tap.
    await expect(booked).toHaveAttribute("aria-sort", "descending");
    await expect(manage.first()).toHaveAccessibleName("Manage desk 1.1.2");
    await expect(manage.nth(1)).toHaveAccessibleName("Manage desk 1.1.1");

    await booked.getByRole("button").click();
    await expect(booked).toHaveAttribute("aria-sort", "ascending");
    await expect(manage.last()).toHaveAccessibleName("Manage desk 1.1.2");
  });

  test("unassigns a desk after asking", async ({
    page,
    db,
    cronJobOrg,
    adminPage,
  }) => {
    await db.setCronId("bob", "4242");

    await adminPage.goto();
    let sheet = await adminPage.open(adminPage.deskRow("1.1.2"));
    await sheet.button("Unassign").click();
    await expect(sheet.root).toContainText(
      "Bob loses this desk. Their weekly booking stops.",
    );
    await sheet.button("Keep").click();
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.bob.id,
    });

    await sheet.confirm("Unassign", "Unassign desk");

    await expectToast(page, "Desk 1.1.2 is unclaimed now");
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: null,
    });
    await expect(cronJobOrg.calls()).resolves.toEqual([
      { method: "DELETE", path: "/jobs/4242" },
    ]);
  });

  test("clears a whole day", async ({ page, db, adminPage }) => {
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "guest",
      deskId: desks.unclaimed.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "wednesday",
    });

    await adminPage.goto("bookings");
    let tuesday = adminPage.day(bookingDay("tuesday").label);
    await expect(tuesday.getByRole("button", { name: /^Cancel / })).toHaveCount(
      2,
    );

    await tuesday.getByRole("button", { name: "Clear day" }).click();
    await tuesday.getByRole("button", { name: "Clear 2 bookings" }).click();

    await expectToast(page, "Cleared 2 bookings");
    await expect(tuesday).toHaveCount(0);
    await expect(db.reservationsForDesk(desks.alice.id)).resolves.toEqual([]);
    await expect(
      db.reservation(desks.bob.id, "wednesday"),
    ).resolves.toBeDefined();
  });

  test("cancels one booking", async ({ page, db, adminPage }) => {
    await db.addReservation({
      user: "guest",
      deskId: desks.alice.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "wednesday",
    });

    await adminPage.goto("bookings");
    await page
      .getByRole("button", {
        name: `Cancel gary guest's booking on ${bookingDay("tuesday").label}, desk 1.1.1`,
      })
      .click();

    await expectToast(page, "Booking cancelled");
    await expect(
      db.reservation(desks.alice.id, "tuesday"),
    ).resolves.toBeUndefined();
    await expect(
      db.reservation(desks.alice.id, "wednesday"),
    ).resolves.toBeDefined();
  });

  test("clears everything a person booked", async ({ page, db, adminPage }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "thursday",
    });
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "thursday",
    });

    await adminPage.goto("people");
    let sheet = await adminPage.open(adminPage.personRow("Bob Berg"));
    await expect(sheet.bookings).toHaveCount(2);
    await sheet.confirm("Clear all", "Clear 2 bookings");

    await expectToast(page, "Cleared 2 bookings");
    await expect(db.reservationsForDesk(desks.bob.id)).resolves.toEqual([]);
    await expect(
      db.reservation(desks.alice.id, "thursday"),
    ).resolves.toBeDefined();
  });

  test("renames someone and makes them an admin", async ({
    page,
    db,
    adminPage,
  }) => {
    await adminPage.goto("people");
    let sheet = await adminPage.open(adminPage.personRow("Alice Andersen"));

    await sheet.root.getByLabel("First name").fill("Alicia");
    await sheet.button("Save name").click();
    await expectToast(page, "Saved Alicia Andersen");

    await sheet.confirm("Make admin", "Make admin");
    await expectToast(page, "Alicia is an admin now");

    await expect(db.user(users.alice.id)).resolves.toMatchObject({
      firstName: "Alicia",
      role: "admin",
    });
  });

  test("edits another user's profile", async ({ page, db }) => {
    await gotoHydrated(page, `/users/edit/${users.alice.id}`);

    await page.getByLabel("First name").fill("Alicia");
    await page.getByLabel("Last name").fill("Anders");
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page).toHaveURL(`/users/edit/${users.alice.id}`);
    await expectToast(page, "Saved Alicia Anders's profile");
    await expect(
      page.getByRole("heading", { name: "Alicia's profile" }),
    ).toBeVisible();
    await expect(db.user(users.alice.id)).resolves.toMatchObject({
      firstName: "Alicia",
      lastName: "Anders",
    });
  });
});

// The UI hides the tab from regular users; the direct requests make sure the
// server enforces the same rules.
test.describe("as a regular user", () => {
  test.use({ storageState: authFile("alice") });

  test("has no Admin tab", async ({ desksPage }) => {
    await desksPage.goto();

    await expect(desksPage.tab("Metrics")).toBeVisible();
    await expect(desksPage.tab("Admin")).toHaveCount(0);
  });

  test("is sent back when opening the Admin tab", async ({ page }) => {
    await page.goto("/admin");

    await expect(page).toHaveURL("/");
    await expectToast(page, "Unauthorized!");
  });

  test("cannot reassign a desk or clear a day", async ({ page, db }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });

    let forms: Record<string, string>[] = [
      {
        intent: "reassign",
        deskId: String(desks.bob.id),
        userId: users.alice.id,
      },
      { intent: "clear-day", date: bookingDay("tuesday").date },
    ];

    for (let form of forms) {
      let response = await page.request.post("/admin", {
        form,
        maxRedirects: 0,
      });

      expect(response.status()).toBe(302);
      expect(response.headers()["location"]).toBe("/");
    }

    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.bob.id,
    });
    await expect(
      db.reservation(desks.bob.id, "tuesday"),
    ).resolves.toBeDefined();
  });

  test("cannot delete another user's reservation", async ({ page, db }) => {
    await db.addReservation({
      user: "guest",
      deskId: desks.alice.id,
      day: "tuesday",
    });

    // Even when the form claims to be the reservation's owner.
    let response = await page.request.delete("/reservations", {
      form: {
        "reservation-date": bookingDay("tuesday").date,
        "reservation-user-id": users.guest.id,
        "reservation-day": "tuesday",
        "desk-id": String(desks.alice.id),
      },
    });

    expect(response.status()).toBe(404);
    await expect(
      db.reservation(desks.alice.id, "tuesday"),
    ).resolves.toMatchObject({ userId: users.guest.id });
  });

  test("cannot edit another user's profile", async ({ page, db }) => {
    await page.goto(`/users/edit/${users.bob.id}`);

    await expect(
      page.getByText("You are not allowed to edit this information"),
    ).toBeVisible();
    await expect(page.getByLabel("First name")).toHaveCount(0);

    let response = await page.request.put(`/users/edit/${users.bob.id}`, {
      form: {
        "user-id": users.bob.id,
        firstName: "Hacked",
        lastName: "Hacked",
      },
      maxRedirects: 0,
    });

    expect(response.ok()).toBe(false);
    await expect(db.user(users.bob.id)).resolves.toMatchObject({
      firstName: users.bob.firstName,
      lastName: users.bob.lastName,
    });
  });

  test("can edit their own profile", async ({ page, db }) => {
    await gotoHydrated(page, `/users/edit/${users.alice.id}`);

    let save = page.getByRole("button", { name: "Save changes" });
    await expect(save).toBeDisabled();

    await page.getByLabel("First name").fill("Ali");
    await save.click();

    await expectToast(page, "Profile saved");
    await expect(
      page.getByRole("main").getByText("Ali Andersen"),
    ).toBeVisible();
    await expect(save).toBeDisabled();
    await expect(db.user(users.alice.id)).resolves.toMatchObject({
      firstName: "Ali",
    });
  });
});
