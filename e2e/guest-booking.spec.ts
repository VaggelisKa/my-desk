import { authFile, expect, expectToast, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";

test.use({ storageState: authFile("guest") });

test("a guest reserves someone else's desk for today", async ({
  page,
  db,
  desksPage,
  bookingsPage,
}) => {
  await desksPage.goto();

  let dialog = await desksPage.openDesk(users.alice.firstName);
  await expect(dialog.title).toHaveText("Desk 1.1.1");
  await expect(dialog.assignedTo).toHaveText("Alice Andersen");
  // Planning ahead is reserved for the desk owner.
  await expect(dialog.bookableDays()).toHaveCount(0);

  await dialog.reserveForTodayButton.click();

  await expectToast(page, "Desk booked");
  await expect(dialog.usedTodayBy).toHaveText("Gary Guest");
  await expect(dialog.reserveForTodayButton).toBeHidden();

  await expect(db.reservation(desks.alice.id, "monday")).resolves.toMatchObject(
    { userId: users.guest.id, date: bookingDay("monday").date },
  );

  await bookingsPage.goto();
  await expect(bookingsPage.rows).toHaveCount(1);
  await expect(bookingsPage.row(bookingDay("monday").date)).toContainText(
    "Alice's desk",
  );
  await expect(bookingsPage.row(bookingDay("monday").date)).toContainText(
    "borrowed",
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

  await expectToast(page, "Desk booked");
  await expect(
    db.reservation(desks.unclaimed.id, "monday"),
  ).resolves.toMatchObject({ userId: users.guest.id });
});

test("a guest holds two desks for today at most", async ({ page, db }) => {
  let today = bookingDay("monday").date;
  let book = (deskId: number) =>
    page.request.post("/?index", {
      form: { deskId: String(deskId), date: today },
    });

  expect((await book(desks.alice.id)).ok()).toBe(true);
  expect((await book(desks.unclaimed.id)).ok()).toBe(true);

  let third = await book(desks.bob.id);

  expect(third.status()).toBe(409);
  await expect(db.reservationsForDesk(desks.bob.id)).resolves.toEqual([]);
});
