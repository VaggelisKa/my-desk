import { authFile, expect, expectToast, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";

test.use({ storageState: authFile("alice") });

test("an employee books their desk for several days across both weeks from the sheet", async ({
  page,
  db,
  desksPage,
  reservationsPage,
}) => {
  await desksPage.goto();
  let dialog = await desksPage.openDesk("Alice");
  await expect(dialog.title).toHaveText("Desk 1.1.1");
  await expect(dialog.bookButton).toHaveText("Pick days to book");
  await expect(dialog.bookButton).toBeDisabled();

  let booked = [
    bookingDay("monday"),
    bookingDay("wednesday"),
    bookingDay("tuesday", 1),
    bookingDay("thursday", 1),
    bookingDay("friday", 1),
  ];

  await dialog.book(booked.map(({ label }) => label));

  await expectToast(page, "Reservation added!");
  // The sheet stays open and the booked days turn into "yours".
  await expect(dialog.root).toBeVisible();
  for (let { label } of booked) {
    await expect(dialog.dayStatus(label)).toHaveAccessibleName(
      `${label}, reserved by you`,
    );
  }
  await expect(dialog.bookableDays()).toHaveCount(10 - booked.length);

  await reservationsPage.goto();
  await expect(reservationsPage.rows).toHaveCount(booked.length);
  for (let { date, label } of booked) {
    // "Mon 17" from "Mon 17 Mar".
    await expect(reservationsPage.row(date)).toContainText(
      label.split(" ").slice(0, 2).join(" "),
    );
    await expect(reservationsPage.row(date)).toContainText("Your desk");
    await expect(reservationsPage.row(date)).toContainText("1.1.1");
  }

  // The dates the server stored match the days picked in the UI.
  let stored = await db.reservationsForDesk(desks.alice.id);
  expect(
    stored.map(({ date, day, week, userId }) => ({ date, day, week, userId })),
  ).toEqual(
    booked.map(({ date, day, week }) => ({
      date,
      day,
      week,
      userId: users.alice.id,
    })),
  );
});

test("days that are already booked cannot be picked again", async ({
  db,
  desksPage,
}) => {
  await db.addReservation({
    user: "alice",
    deskId: desks.alice.id,
    day: "tuesday",
  });
  await db.addReservation({
    user: "bob",
    deskId: desks.alice.id,
    day: "monday",
    weekOffset: 1,
  });

  await desksPage.goto();
  let dialog = await desksPage.openDesk(users.alice.firstName);

  await expect(dialog.day(bookingDay("tuesday").label)).toHaveCount(0);
  await expect(
    dialog.dayStatus(bookingDay("tuesday").label),
  ).toHaveAccessibleName(/reserved by you/);
  await expect(dialog.day(bookingDay("monday", 1).label)).toHaveCount(0);
  await expect(
    dialog.dayStatus(bookingDay("monday", 1).label),
  ).toHaveAccessibleName(/taken by Bob/);
  await expect(dialog.day(bookingDay("monday").label)).toBeEnabled();
  await expect(dialog.day(bookingDay("tuesday", 1).label)).toBeEnabled();
});

test("submitting without picking a day is rejected", async ({ page, db }) => {
  let response = await page.request.post("/?index", {
    form: { deskId: String(desks.alice.id) },
  });

  expect(response.status()).toBe(400);
  await expect(db.reservationsForDesk(desks.alice.id)).resolves.toEqual([]);
});

test("the old reserve page is gone", async ({ page }) => {
  let response = await page.goto("/reserve");

  expect(response?.status()).toBe(404);
});

test.describe("someone else's desk", () => {
  test("offers no days to pick in the sheet", async ({ desksPage }) => {
    await desksPage.goto();
    let dialog = await desksPage.openDesk(users.bob.firstName);

    await expect(dialog.dayStatus(bookingDay("friday").label)).toBeVisible();
    await expect(dialog.bookableDays()).toHaveCount(0);
    await expect(dialog.reserveForTodayButton).toBeVisible();
  });

  test("cannot be booked ahead with a direct request", async ({ page, db }) => {
    let response = await page.request.post("/?index", {
      form: {
        deskId: String(desks.bob.id),
        date: bookingDay("friday").date,
      },
    });

    expect(response.status()).toBe(403);
    await expect(db.reservationsForDesk(desks.bob.id)).resolves.toEqual([]);
  });
});

test("a desk sits at its place in the block even when the block has gaps", async ({
  page,
  db,
  desksPage,
}) => {
  // Alone in block 2, at the aisle end of its second row.
  await db.moveDesk(desks.unclaimed.id, { row: 2, column: 3 });
  await desksPage.goto();

  let tile = page.getByRole("button", { name: "Unclaimed" });
  let block = tile.locator(
    "xpath=ancestor::div[contains(@class,'grid-rows-2')]",
  );
  let [tileBox, blockBox] = await Promise.all([
    tile.boundingBox(),
    block.boundingBox(),
  ]);

  // Right-hand third of the block, and its lower half.
  expect(tileBox!.x).toBeGreaterThan(
    blockBox!.x + (blockBox!.width * 2) / 3 - 10,
  );
  expect(tileBox!.y).toBeGreaterThan(blockBox!.y + blockBox!.height / 2 - 10);
});
