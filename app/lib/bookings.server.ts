import { format, getWeek, isValid, isWeekend } from "date-fns";
import { and, asc, eq, gte, or } from "drizzle-orm";
import { dataWithError, dataWithSuccess } from "remix-toast";
import type { Booking } from "~/components/bookings";
import {
  formatDate,
  isOpenForBooking,
  LAST_BOOKING_HOUR,
  officeNow,
  parseDate,
  todayStart,
} from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations } from "~/lib/db/schema";
import { plural } from "~/lib/utils";

/** A booking of `deskId` by `userId` on `date`, as the table stores it. */
export function bookingRow(deskId: number, userId: string, date: Date) {
  return {
    day: format(date, "EEEE").toLowerCase(),
    week: getWeek(date),
    deskId,
    userId,
    date: formatDate(date),
    dateTimestamp: date.getTime(),
  };
}

let notOwnerError = {
  message: "Not allowed!",
  description:
    "Only the person assigned to a desk can book it ahead. Others can book it for today.",
};

// Reservations are unique per desk, day and week.
function isAlreadyBookedError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "SQLITE_CONSTRAINT_PRIMARYKEY"
  );
}

/**
 * Books `deskId` for the picked `date` fields (`dd.MM.yyyy`). The desk owner
 * can plan ahead; anyone else can only take the desk for today.
 */
export async function bookDesk(userId: string, formData: FormData) {
  let deskId = Number(formData.get("deskId"));
  let dates = [...new Set(formData.getAll("date").map(String))];

  if (dates.length === 0) {
    return dataWithError(
      null,
      {
        message: "No days picked",
        description: "Pick at least one free day.",
      },
      { status: 400 },
    );
  }

  let desk = await db.query.desks.findFirst({
    where: eq(desks.id, deskId),
    columns: { userId: true },
  });

  if (!desk) {
    return dataWithError(null, { message: "Desk not found!" }, { status: 404 });
  }

  // The same rules the sheet shows, in office time: the owner books weekdays
  // of this week and the next (today until 11:00); anyone else only today.
  let now = officeNow();
  let today = formatDate(now);
  let days = dates.map((value) => parseDate(value));
  let isOwner = desk.userId === userId;

  if (!isOwner && !dates.every((date) => date === today)) {
    return dataWithError(null, notOwnerError, { status: 403 });
  }

  let isBookable = isOwner
    ? (date: Date) => isOpenForBooking(date, now)
    : (date: Date) => isValid(date) && !isWeekend(date);

  if (!days.every(isBookable)) {
    return dataWithError(
      null,
      {
        message: "Those days cannot be booked",
        description: isOwner
          ? `You can book weekdays this week and next. Today closes at ${LAST_BOOKING_HOUR}:00.`
          : undefined,
      },
      { status: 400 },
    );
  }

  try {
    await db
      .insert(reservations)
      .values(days.map((date) => bookingRow(deskId, userId, date)));
  } catch (error) {
    if (!isAlreadyBookedError(error)) {
      throw error;
    }

    return dataWithError(
      null,
      {
        message: "Desk already booked",
        description: "Someone else booked this desk in the meantime.",
      },
      { status: 409 },
    );
  }

  let booked = days
    .sort((a, b) => a.getTime() - b.getTime())
    .map((date) => format(date, "EEE d MMM"));

  return dataWithSuccess(null, {
    message: "Desk booked",
    description: `Booked ${booked.join(", ")}.`,
  });
}

/** `userId`'s bookings from today on, soonest first, for Bookings › Upcoming. */
export async function listUpcomingBookings(userId: string) {
  let rows = await db.query.reservations.findMany({
    with: {
      desks: {
        columns: { id: true, block: true, row: true, column: true },
        with: { user: { columns: { id: true, firstName: true } } },
      },
    },
    where: and(
      eq(reservations.userId, userId),
      gte(reservations.dateTimestamp, todayStart()),
    ),
    orderBy: [asc(reservations.dateTimestamp)],
  });

  return rows.flatMap((r): Booking[] =>
    r.desks && r.date && r.deskId !== null
      ? [
          {
            deskId: r.deskId,
            day: r.day,
            date: r.date,
            userId: r.userId,
            desk: r.desks,
            mine: r.desks.user?.id === userId,
            ownerName: r.desks.user?.firstName ?? null,
          },
        ]
      : [],
  );
}

/**
 * Removes the booking the form names. People can only remove their own;
 * admins anyone's, whatever the form claims.
 */
export async function removeBooking(
  user: { userId: string; role: "user" | "admin" | null },
  formData: FormData,
) {
  let date = String(formData.get("reservation-date") ?? "");
  let day = String(formData.get("reservation-day") ?? "");
  let deskId = Number(formData.get("desk-id"));

  if (!date || !day || !deskId) {
    return dataWithError(
      null,
      { message: "Booking information missing" },
      { status: 400 },
    );
  }

  let deleted = await db
    .delete(reservations)
    .where(
      and(
        user.role === "admin"
          ? undefined
          : eq(reservations.userId, user.userId),
        eq(reservations.date, date),
        eq(reservations.day, day),
        eq(reservations.deskId, deskId),
      ),
    )
    .returning({ deskId: reservations.deskId });

  if (!deleted.length) {
    return dataWithError(
      null,
      { message: "Booking not found" },
      { status: 404 },
    );
  }

  return dataWithSuccess(null, { message: "Booking removed" });
}

/**
 * The most bookings one form may name: more than the whole office has
 * upcoming, so Select all in Admin always fits.
 */
let MAX_PICKED = 5000;

/** Bookings per delete statement, to keep each one's SQL variables small. */
let CHUNK = 100;

/**
 * The bookings a form names in its `booking` fields (see `bookingKey`),
 * without repeats, or null when there are none or too many.
 */
export function pickedBookings(formData: FormData) {
  let picked = new Map<
    string,
    { deskId: number; date: string; userId: string }
  >();

  for (let value of formData.getAll("booking")) {
    // Desk ids and dates never hold "@", but user IDs may, so the ID is
    // everything after the second one.
    let [deskId, date, ...rest] = String(value).split("@");
    let userId = rest.join("@");
    let id = Number(deskId);
    if (!Number.isInteger(id) || id <= 0 || !date || !userId) continue;
    picked.set(`${id}@${date}@${userId}`, { deskId: id, date, userId });
  }

  return picked.size > 0 && picked.size <= MAX_PICKED
    ? [...picked.values()]
    : null;
}

type Picked = NonNullable<ReturnType<typeof pickedBookings>>;

/** Matches any of the picked bookings, each by desk, day and person. */
function anyOf(picked: Picked) {
  return or(
    ...picked.map((booking) =>
      and(
        eq(reservations.deskId, booking.deskId),
        eq(reservations.date, booking.date),
        eq(reservations.userId, booking.userId),
      ),
    ),
  );
}

/**
 * Deletes the picked bookings, a chunk per statement, all in one batch (so
 * all or none go). Returns how many there were.
 */
export async function deletePicked(picked: Picked) {
  let [first, ...rest] = Array.from(
    { length: Math.ceil(picked.length / CHUNK) },
    (_, i) =>
      db
        .delete(reservations)
        .where(anyOf(picked.slice(i * CHUNK, (i + 1) * CHUNK)))
        .returning({ deskId: reservations.deskId }),
  );
  let results = await db.batch([first, ...rest]);
  return results.reduce((count, deleted) => count + deleted.length, 0);
}

/**
 * Removes several of `userId`'s own bookings at once. Bookings the form
 * names for anyone else are left alone, whoever is asking.
 */
export async function removeBookings(userId: string, formData: FormData) {
  let picked = pickedBookings(formData)?.filter(
    (booking) => booking.userId === userId,
  );

  if (!picked?.length) {
    return dataWithError(
      null,
      { message: "No bookings picked" },
      { status: 400 },
    );
  }

  // Only the person's own picks are left, so each deletes only their own.
  let deleted = await deletePicked(picked);

  if (!deleted) {
    return dataWithError(
      null,
      { message: "Bookings not found" },
      { status: 404 },
    );
  }

  return dataWithSuccess(null, {
    message: `Removed ${plural(deleted, "booking")}`,
  });
}
