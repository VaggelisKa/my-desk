import { authFile, expect, expectNoToast, expectToast, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";

test.describe("as a guest", () => {
  test.use({ storageState: authFile("guest") });

  test("a desk booked for today cannot be reserved again", async ({
    db,
    desksPage,
  }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.alice.id,
      day: "monday",
    });

    await desksPage.goto();
    let dialog = await desksPage.openDesk(users.alice.firstName);

    await expect(dialog.usedTodayBy).toHaveText("Bob Berg");
    await expect(dialog.reserveForTodayButton).toBeHidden();
  });

  test("the free desks filter disables desks booked for today", async ({
    page,
    db,
    desksPage,
  }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.alice.id,
      day: "monday",
    });

    await desksPage.goto();
    await desksPage.showFreeDesksOnly.check();

    await expect(page).toHaveURL(/show-free=on/);
    await expect(desksPage.desk(users.alice.firstName)).toBeDisabled();
    await expect(desksPage.desk(users.bob.firstName)).toBeEnabled();
  });

  test("a desk taken while the dialog was open is not double booked", async ({
    page,
    db,
    desksPage,
  }) => {
    await desksPage.goto();
    let dialog = await desksPage.openDesk(users.alice.firstName);
    await expect(dialog.reserveForTodayButton).toBeVisible();

    // Someone else books it before the guest confirms.
    await db.addReservation({
      user: "bob",
      deskId: desks.alice.id,
      day: "monday",
    });
    let response = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("index"),
    );
    await dialog.reserveForTodayButton.click();

    expect((await response).status()).toBe(409);
    await expectToast(page, "Desk already reserved");
    await expectNoToast(page, "Reservation added!");
    await expect(dialog.root).toBeVisible();
    await expect(db.reservationsForDesk(desks.alice.id)).resolves.toEqual([
      expect.objectContaining({ userId: users.bob.id, day: "monday" }),
    ]);
  });
});

test.describe("as the desk owner", () => {
  test.use({ storageState: authFile("alice") });

  test("today cannot be reserved once a guest has booked it", async ({
    db,
    desksPage,
  }) => {
    await db.addReservation({
      user: "guest",
      deskId: desks.alice.id,
      day: "monday",
    });

    await desksPage.goto();
    let dialog = await desksPage.openDesk(users.alice.firstName);
    let today = bookingDay("monday").label;

    await expect(dialog.day(today)).toHaveCount(0);
    await expect(dialog.dayStatus(today)).toHaveAccessibleName(/taken by Gary/);
  });

  test("a day taken while the sheet was open is not double booked", async ({
    page,
    db,
    desksPage,
  }) => {
    await desksPage.goto();
    let dialog = await desksPage.openDesk(users.alice.firstName);
    let friday = bookingDay("friday").label;
    await dialog.day(friday).check();

    await db.addReservation({
      user: "bob",
      deskId: desks.alice.id,
      day: "friday",
    });
    let response = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes("index"),
    );
    await dialog.bookButton.click();

    expect((await response).status()).toBe(409);
    await expectToast(page, "Desk already reserved");
    await expect(dialog.dayStatus(friday)).toHaveAccessibleName(/taken by Bob/);
  });
});
