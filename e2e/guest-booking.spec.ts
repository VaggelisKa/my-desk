import { authFile, expect, expectToast, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";

test.use({ storageState: authFile("guest") });

test("a guest reserves someone else's desk for today", async ({
  page,
  db,
  desksPage,
  reservationsPage,
}) => {
  await desksPage.goto();

  let dialog = await desksPage.openDesk(users.alice.firstName);
  await expect(dialog.title).toHaveText("Desk 1.1.1");
  await expect(dialog.assignedTo).toHaveText("Alice Andersen");
  // Planning ahead is reserved for the desk owner.
  await expect(dialog.reserveLink).toBeHidden();

  await dialog.reserveForTodayButton.click();

  await expectToast(page, "Reservation added!");
  await expect(dialog.usedTodayBy).toHaveText("Gary Guest");
  await expect(dialog.reserveForTodayButton).toBeHidden();

  await expect(db.reservation(desks.alice.id, "monday")).resolves.toMatchObject(
    { userId: users.guest.id, date: bookingDay("monday").date },
  );

  await reservationsPage.goto();
  await expect(reservationsPage.rows).toHaveCount(1);
  await expect(reservationsPage.row(bookingDay("monday").date)).toContainText(
    "Block 1, Row 1, Column 1",
  );
});

test("a guest can reserve an unclaimed desk for today", async ({
  page,
  db,
  desksPage,
}) => {
  await desksPage.goto();

  let dialog = await desksPage.openDesk("Unclaimed");
  await expect(dialog.assignedTo).toContainText("None");

  await dialog.reserveForTodayButton.click();

  await expectToast(page, "Reservation added!");
  await expect(
    db.reservation(desks.unclaimed.id, "monday"),
  ).resolves.toMatchObject({ userId: users.guest.id });
});
