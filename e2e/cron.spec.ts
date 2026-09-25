import { addDays, format, getWeek } from "date-fns";
import { eq } from "drizzle-orm";
import * as schema from "../app/lib/db/schema";
import { expect, test } from "./fixtures";
import { bookingDay, desks, users } from "./support/db";
import { NOW } from "./support/env";

// cron-job.org calls these endpoints; they are guarded by a password rather
// than a session. The e2e server's password is set in playwright.config.ts.
const password = "e2e-cron-password";

test.describe("logging the day's metrics", () => {
  test("counts today's bookings once, guests apart", async ({ page, db }) => {
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "monday",
    });
    // Guests on an unclaimed desk count as guests too.
    await db.addReservation({
      user: "guest",
      deskId: desks.unclaimed.id,
      day: "monday",
    });
    // Not today, so not counted.
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });

    let log = () =>
      page.request.get(`/cron/log-metrics?cronPassword=${password}`);

    expect((await log()).status()).toBe(200);
    // A second run on the same day changes nothing.
    expect((await log()).status()).toBe(406);

    let rows = await db.db.query.bookingMetrics.findMany();
    expect(rows).toEqual([
      expect.objectContaining({
        metricDate: format(NOW, "dd.MM.yyyy"),
        totalBookings: 2,
        totalGuestBookings: 1,
        participation_percentage: Math.round((2 / 33) * 100),
      }),
    ]);
  });

  test("refuses a wrong password", async ({ page, db }) => {
    let response = await page.request.get(
      "/cron/log-metrics?cronPassword=wrong",
    );

    expect(response.status()).toBe(401);
    await expect(db.db.query.bookingMetrics.findMany()).resolves.toEqual([]);
  });
});

test.describe("the weekly booking callback", () => {
  function callback(params: Record<string, string | string[]>) {
    let search = new URLSearchParams();
    for (let [key, value] of Object.entries(params)) {
      for (let v of [value].flat()) search.append(key, v);
    }
    return `/cron/automatic-reservation?${search}`;
  }

  test("books the owner's desk on their days of the week", async ({
    page,
    db,
  }) => {
    let url = callback({
      cronPassword: password,
      deskId: String(desks.alice.id),
      userId: users.alice.id,
      day: ["wednesday", "friday"],
    });

    expect((await page.request.get(url)).status()).toBe(200);
    // Running twice books nothing twice.
    expect((await page.request.get(url)).status()).toBe(200);

    let stored = await db.reservationsForDesk(desks.alice.id);
    expect(
      stored.map(({ date, day, week, userId }) => ({
        date,
        day,
        week,
        userId,
      })),
    ).toEqual(
      [bookingDay("wednesday"), bookingDay("friday")].map(
        ({ date, day, week }) => ({ date, day, week, userId: users.alice.id }),
      ),
    );
  });

  test("removes the job once the desk is no longer theirs", async ({
    page,
    db,
    cronJobOrg,
  }) => {
    await db.setCronId("alice", "5150");

    let response = await page.request.get(
      callback({
        cronPassword: password,
        deskId: String(desks.bob.id),
        userId: users.alice.id,
        day: "monday",
      }),
    );

    expect(response.status()).toBe(401);
    await expect(db.reservationsForDesk(desks.bob.id)).resolves.toEqual([]);
    await expect(db.user(users.alice.id)).resolves.toMatchObject({
      autoReservationsCronId: null,
    });
    expect(await cronJobOrg.calls()).toEqual([
      { method: "DELETE", path: "/jobs/5150" },
    ]);
  });

  test("refuses a wrong password", async ({ page, db }) => {
    let response = await page.request.get(
      callback({
        cronPassword: "wrong",
        deskId: String(desks.alice.id),
        userId: users.alice.id,
        day: "monday",
      }),
    );

    expect(response.status()).toBe(401);
    await expect(db.reservationsForDesk(desks.alice.id)).resolves.toEqual([]);
  });
});

test("the cleanup removes bookings from past days only", async ({
  page,
  db,
}) => {
  let lastFriday = addDays(NOW, -3);
  lastFriday.setHours(0, 0, 0, 0);
  await db.db.insert(schema.reservations).values({
    userId: users.alice.id,
    deskId: desks.alice.id,
    day: "friday",
    week: getWeek(lastFriday),
    date: format(lastFriday, "dd.MM.yyyy"),
    dateTimestamp: lastFriday.getTime(),
  });
  await db.addReservation({
    user: "alice",
    deskId: desks.alice.id,
    day: "tuesday",
  });

  expect(
    (
      await page.request.get("/cron/reservations-cleanup?cronPassword=wrong")
    ).status(),
  ).toBe(401);
  await expect(db.reservationsForDesk(desks.alice.id)).resolves.toHaveLength(2);

  let response = await page.request.get(
    `/cron/reservations-cleanup?cronPassword=${password}`,
  );

  expect(response.status()).toBe(200);
  let left = await db.db.query.reservations.findMany({
    where: eq(schema.reservations.deskId, desks.alice.id),
  });
  expect(left.map((r) => r.day)).toEqual(["tuesday"]);
});
