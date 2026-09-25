import { addDays, format, getWeek, isValid, startOfDay } from "date-fns";
import { eq } from "drizzle-orm";
import { dataWithError, dataWithSuccess } from "remix-toast";
import { formatDate, parseDate, WEEKDAYS } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations } from "~/lib/db/schema";

let notOwnerError = {
  message: "Not allowed!",
  description:
    "Only the person assigned to a desk can reserve it ahead. Others can reserve it for today.",
};

// Reservations are unique per desk, day and week.
function isAlreadyReservedError(error: unknown) {
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
export async function reserveDesk(userId: string, formData: FormData) {
  let deskId = Number(formData.get("deskId"));
  let dates = [...new Set(formData.getAll("date").map(String))];

  if (dates.length === 0) {
    return dataWithError(
      null,
      {
        message: "Reservation information is missing",
        description: "Make sure you have selected at least an available day",
      },
      { status: 400 },
    );
  }

  // The sheet only offers weekdays of this week and the next. A day of slack
  // on both ends covers a browser a timezone away from the server.
  let today = startOfDay(new Date());
  let earliest = addDays(today, -1);
  let latest = addDays(today, 16);
  let days = dates.map((value) => parseDate(value));
  let isBookable = (date: Date) =>
    isValid(date) &&
    WEEKDAYS.includes(format(date, "EEEE").toLowerCase() as never) &&
    date >= earliest &&
    date <= latest;

  if (!days.every(isBookable)) {
    return dataWithError(
      null,
      { message: "Those days cannot be booked" },
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

  let onlyToday = dates.every((date) => date === formatDate(today));

  if (desk.userId !== userId && !onlyToday) {
    return dataWithError(null, notOwnerError, { status: 403 });
  }

  try {
    await db.insert(reservations).values(
      days.map((date) => ({
        day: format(date, "EEEE").toLowerCase(),
        week: getWeek(date),
        deskId,
        userId,
        date: formatDate(date),
        dateTimestamp: date.getTime(),
      })),
    );
  } catch (error) {
    if (!isAlreadyReservedError(error)) {
      throw error;
    }

    return dataWithError(
      null,
      {
        message: "Desk already reserved",
        description: "Someone else reserved this desk in the meantime.",
      },
      { status: 409 },
    );
  }

  let booked = days
    .sort((a, b) => a.getTime() - b.getTime())
    .map((date) => format(date, "EEE d MMM"));

  return dataWithSuccess(null, {
    message: "Reservation added!",
    description: `Booked ${booked.join(", ")}.`,
  });
}
