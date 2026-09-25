import { authFile, expect, expectToast, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";

test.use({ storageState: authFile("alice") });

test("an employee books their desk for several days across both weeks", async ({
  page,
  db,
  desksPage,
  reservePage,
  reservationsPage,
}) => {
  await desksPage.goto();
  await desksPage.sidebarLink("Add reservation").click();
  await expect(page).toHaveURL("/reserve");

  // Current week
  await reservePage.reserve(["monday", "wednesday"]);

  await expect(page).toHaveURL("/");
  await expectToast(page, "Reservation added!");

  // Next week
  await reservePage.goto();
  await reservePage.selectWeek("Next");
  await reservePage.reserve(["tuesday", "thursday", "friday"]);

  await expect(page).toHaveURL("/");
  await expectToast(page, "Reservation added!");

  let booked = [
    bookingDay("monday"),
    bookingDay("wednesday"),
    bookingDay("tuesday", 1),
    bookingDay("thursday", 1),
    bookingDay("friday", 1),
  ];

  await reservationsPage.goto();
  await expect(reservationsPage.rows).toHaveCount(booked.length);
  for (let { day, date } of booked) {
    await expect(reservationsPage.row(date)).toContainText(day, {
      ignoreCase: true,
    });
    await expect(reservationsPage.row(date)).toContainText(
      "Block 1, Row 1, Column 1",
    );
  }

  // The dates the server stored match the days picked in the UI.
  let stored = await db.reservationsForDesk(desks.alice.id);
  expect(stored.map(({ date, userId }) => ({ date, userId }))).toEqual(
    booked.map(({ date }) => ({ date, userId: users.alice.id })),
  );
});

test("days that are already booked cannot be picked again", async ({
  db,
  reservePage,
}) => {
  await db.addReservation({
    user: "alice",
    deskId: desks.alice.id,
    day: "tuesday",
  });
  await db.addReservation({
    user: "alice",
    deskId: desks.alice.id,
    day: "monday",
    weekOffset: 1,
  });

  await reservePage.goto();
  await expect(reservePage.day("tuesday")).toBeDisabled();
  await expect(reservePage.day("tuesday")).toHaveAccessibleName(/reserved/i);
  await expect(reservePage.day("monday")).toBeEnabled();

  await reservePage.selectWeek("Next");
  await expect(reservePage.day("monday")).toBeDisabled();
  await expect(reservePage.day("tuesday")).toBeEnabled();
});

test("submitting without picking a day shows an error", async ({
  page,
  db,
  reservePage,
}) => {
  await reservePage.goto();

  let response = page.waitForResponse(
    (res) =>
      res.request().method() === "POST" && res.url().includes("/reserve"),
  );
  await reservePage.reserveButton.click();

  expect((await response).status()).toBe(400);
  await expectToast(page, "Reservation information is missing");
  await expect(page).toHaveURL("/reserve");
  await expect(db.reservationsForDesk(desks.alice.id)).resolves.toEqual([]);
});

test.describe("someone else's desk", () => {
  test("cannot be planned ahead from the reserve page", async ({
    page,
    reservePage,
  }) => {
    await reservePage.goto(desks.bob.id);

    await expect(page).toHaveURL("/");
    await expectToast(page, "Not allowed!");
  });

  test("cannot be booked ahead with a direct request", async ({ page, db }) => {
    let { week } = bookingDay("friday");
    let response = await page.request.post("/reserve", {
      form: { deskId: String(desks.bob.id), week: String(week), friday: "on" },
    });

    expect(response.status()).toBe(403);
    await expect(db.reservationsForDesk(desks.bob.id)).resolves.toEqual([]);
  });
});
