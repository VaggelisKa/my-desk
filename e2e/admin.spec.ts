import { authFile, expect, expectToast, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { bookingDay, desks, users } from "./support/db";

test.describe("as an admin", () => {
  test.use({ storageState: authFile("admin") });

  test("can open the edit page from any desk", async ({
    page,
    desksPage,
    deskEditPage,
  }) => {
    await desksPage.goto();

    let dialog = await desksPage.openDesk(users.bob.firstName);
    await dialog.editDeskLink.click();

    await expect(page).toHaveURL(`/desks/${desks.bob.id}/edit`);
    await expect(deskEditPage.assignedUserInput).toHaveValue(users.bob.id);
  });

  test("assigns an unclaimed desk to a user", async ({
    page,
    db,
    desksPage,
    deskEditPage,
  }) => {
    await deskEditPage.goto(desks.unclaimed.id);
    await expect(deskEditPage.assignedUserInput).toBeEmpty();

    await deskEditPage.assignTo(users.guest.id.toUpperCase());

    await expect(page).toHaveURL("/");
    await expectToast(page, "Desk updated successfully!");
    await expect(desksPage.desk(users.guest.firstName)).toBeVisible();
    await expect(desksPage.desk("Unclaimed")).toHaveCount(0);
    await expect(db.desk(desks.unclaimed.id)).resolves.toMatchObject({
      userId: users.guest.id,
    });
  });

  test("reassigns an owned desk and cancels the previous owner's automatic reservations", async ({
    page,
    db,
    cronJobOrg,
    desksPage,
    deskEditPage,
  }) => {
    await db.setCronId("bob", "4242");

    await deskEditPage.goto(desks.bob.id);
    await deskEditPage.assignTo(users.guest.id);

    await expect(page).toHaveURL("/");
    await expectToast(page, "Desk updated successfully!");
    await expect(desksPage.desk(users.guest.firstName)).toBeVisible();
    await expect(desksPage.desk(users.bob.firstName)).toHaveCount(0);
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.guest.id,
    });
    await expect(db.user(users.bob.id)).resolves.toMatchObject({
      autoReservationsCronId: null,
    });
    await expect(cronJobOrg.calls()).resolves.toEqual([
      { method: "DELETE", path: "/jobs/4242" },
    ]);
  });

  test("unassigns a desk and cancels the owner's automatic reservations", async ({
    page,
    db,
    cronJobOrg,
    desksPage,
    deskEditPage,
  }) => {
    await db.setCronId("bob", "4242");

    await deskEditPage.goto(desks.bob.id);
    await expect(deskEditPage.assignedUserInput).toHaveValue(users.bob.id);
    await deskEditPage.unassign();

    await expect(page).toHaveURL("/");
    await expectToast(page, "Desk updated successfully!");
    await expect(desksPage.desk(users.bob.firstName)).toHaveCount(0);
    // Bob's desk joins the one that was already unclaimed.
    await expect(desksPage.desk("Unclaimed")).toHaveCount(2);
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: null,
    });
    await expect(db.user(users.bob.id)).resolves.toMatchObject({
      autoReservationsCronId: null,
    });
    await expect(cronJobOrg.calls()).resolves.toEqual([
      { method: "DELETE", path: "/jobs/4242" },
    ]);
  });

  test("deletes another user's reservation", async ({
    page,
    db,
    deskEditPage,
  }) => {
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

    await deskEditPage.goto(desks.alice.id);
    let tuesday = bookingDay("tuesday").date;
    await expect(deskEditPage.reservations.rows).toHaveCount(2);
    await expect(deskEditPage.reservations.row(tuesday)).toContainText(
      "Gary Guest",
    );

    await deskEditPage.reservations.delete(tuesday);

    await expectToast(page, "Reservation deleted!");
    await expect(deskEditPage.reservations.rows).toHaveCount(1);
    await expect(deskEditPage.reservations.row(tuesday)).toHaveCount(0);
    await expect(
      db.reservation(desks.alice.id, "tuesday"),
    ).resolves.toBeUndefined();
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

// The UI hides these actions from regular users; the direct requests make
// sure the server enforces the same rules.
test.describe("as a regular user", () => {
  test.use({ storageState: authFile("alice") });

  test("does not see admin actions on desks", async ({ desksPage }) => {
    await desksPage.goto();

    let dialog = await desksPage.openDesk(users.bob.firstName);

    await expect(dialog.title).toBeVisible();
    await expect(dialog.editDeskLink).toHaveCount(0);
  });

  test("is sent back when opening an admin page", async ({
    page,
    deskEditPage,
  }) => {
    await deskEditPage.goto(desks.bob.id);

    await expect(page).toHaveURL("/");
    await expectToast(page, "Unauthorized!");
  });

  test("cannot reassign a desk", async ({ page, db }) => {
    let response = await page.request.put(`/desks/${desks.bob.id}/edit`, {
      form: { "user-id": users.alice.id },
      maxRedirects: 0,
    });

    expect(response.status()).toBe(302);
    expect(response.headers()["location"]).toBe("/");
    await expect(db.desk(desks.bob.id)).resolves.toMatchObject({
      userId: users.bob.id,
    });
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
