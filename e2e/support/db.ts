import { createClient, type Client } from "@libsql/client";
import { addDays, format, getWeek, startOfWeek } from "date-fns";
import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "../../app/lib/db/schema";
import { DATABASE_URL, NOW } from "./env";

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday";

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
];

/**
 * The baseline data every test starts from. Ids are 6 characters because the
 * login form only accepts employee numbers of that length.
 */
export const users = {
  alice: {
    id: "emp001",
    firstName: "Alice",
    lastName: "Andersen",
    role: "user",
  },
  bob: { id: "emp002", firstName: "Bob", lastName: "Berg", role: "user" },
  admin: { id: "adm001", firstName: "Ada", lastName: "Admin", role: "admin" },
  // Registered without a permanent desk, like an external guest.
  guest: { id: "gst001", firstName: "Gary", lastName: "Guest", role: "user" },
} as const satisfies Record<string, typeof schema.users.$inferInsert>;

export type SeedUser = keyof typeof users;

export const desks = {
  alice: { id: 1, block: 1, row: 1, column: 1, userId: users.alice.id },
  bob: { id: 2, block: 1, row: 1, column: 2, userId: users.bob.id },
  admin: { id: 3, block: 1, row: 1, column: 3, userId: users.admin.id },
  unclaimed: { id: 4, block: 2, row: 1, column: 1, userId: null },
} as const satisfies Record<string, typeof schema.desks.$inferInsert>;

/**
 * Describes a weekday relative to the pinned test clock, in the exact shape
 * the app stores it. `weekOffset` 0 is the current week, 1 the next one.
 */
export function bookingDay(day: Weekday, weekOffset: 0 | 1 = 0) {
  // The app uses date-fns defaults: weeks start on Sunday.
  let date = addDays(
    startOfWeek(NOW),
    WEEKDAYS.indexOf(day) + 1 + weekOffset * 7,
  );

  return {
    day,
    week: getWeek(NOW) + weekOffset,
    date: format(date, "dd.MM.yyyy"),
    dateTimestamp: date.getTime(),
  };
}

export class TestDatabase {
  readonly client: Client;
  readonly db;

  private constructor() {
    this.client = createClient({ url: DATABASE_URL });
    this.db = drizzle(this.client, { schema });
  }

  static async connect() {
    let database = new TestDatabase();
    // The server may still be finishing a request from the previous test;
    // wait for its lock instead of failing with SQLITE_BUSY straight away.
    await database.client.execute("PRAGMA busy_timeout = 5000");

    return database;
  }

  /** Atomically wipes every table and restores the baseline seed. */
  async reset() {
    await this.db.batch([
      this.db.delete(schema.reservations),
      this.db.delete(schema.desks),
      this.db.delete(schema.users),
      this.db.delete(schema.bookingMetrics),
      this.db.insert(schema.users).values(Object.values(users)),
      this.db.insert(schema.desks).values(Object.values(desks)),
    ]);
  }

  async addReservation({
    user,
    deskId,
    day,
    weekOffset = 0,
  }: {
    user: SeedUser;
    deskId: number;
    day: Weekday;
    weekOffset?: 0 | 1;
  }) {
    await this.db.insert(schema.reservations).values({
      userId: users[user].id,
      deskId,
      ...bookingDay(day, weekOffset),
    });
  }

  async setCronId(user: SeedUser, cronId: string | null) {
    await this.db
      .update(schema.users)
      .set({ autoReservationsCronId: cronId })
      .where(eq(schema.users.id, users[user].id));
  }

  reservationsForDesk(deskId: number) {
    return this.db.query.reservations.findMany({
      where: eq(schema.reservations.deskId, deskId),
      orderBy: [asc(schema.reservations.dateTimestamp)],
    });
  }

  reservation(deskId: number, day: Weekday, weekOffset: 0 | 1 = 0) {
    let { week } = bookingDay(day, weekOffset);

    return this.db.query.reservations.findFirst({
      where: and(
        eq(schema.reservations.deskId, deskId),
        eq(schema.reservations.day, day),
        eq(schema.reservations.week, week),
      ),
    });
  }

  user(id: string) {
    return this.db.query.users.findFirst({ where: eq(schema.users.id, id) });
  }

  desk(id: number) {
    return this.db.query.desks.findFirst({ where: eq(schema.desks.id, id) });
  }

  close() {
    this.client.close();
  }
}
