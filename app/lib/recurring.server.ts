import { nextDay, startOfDay } from "date-fns";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { dataWithError, dataWithSuccess } from "remix-toast";
import { bookingRow } from "~/lib/bookings.server";
import {
  addCron,
  addCronSchema,
  CronError,
  daysFromJob,
  deleteCron,
  deskFromJob,
  disableCron,
  enableCron,
  getCronDetails,
} from "~/lib/cron";
import {
  formatDate,
  officeNow,
  workdaysOfWeek,
  type Weekday,
} from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations, users } from "~/lib/db/schema";

// Recurring bookings: a weekly cron-job.org job per person books their desk
// on the days they picked, every Sunday for the week ahead.

// The signed-in user's desk and weekly job, from the database. The job id is
// never taken from the form: it would let anyone pause or remove anyone's job.
async function findOwnDesk(userId: string) {
  return db.query.desks.findFirst({
    where: eq(desks.userId, userId),
    columns: { id: true, block: true, row: true, column: true },
    with: {
      user: {
        columns: {
          autoReservationsCronId: true,
        },
      },
    },
  });
}

let schedulerDown = {
  message: "Could not reach the scheduler",
  description: "Nothing was changed. Try again in a moment.",
};

/**
 * The Recurring page's data: your desk and its weekly job's state, or null
 * when you have no desk to repeat.
 */
export async function loadRecurring(userId: string) {
  let desk = await findOwnDesk(userId);

  if (!desk?.id) {
    return null;
  }

  let { user: owner, ...ownDesk } = desk;
  let cronId = owner?.autoReservationsCronId ?? null;
  let schedule: { enabled: boolean; days: Weekday[] } | null = null;
  // Set up, but its state could not be read: neither active nor paused.
  let unavailable = false;

  if (cronId) {
    try {
      let { jobDetails } = await getCronDetails({ cronId });
      schedule = {
        enabled: jobDetails.enabled === true,
        days: daysFromJob(jobDetails),
      };
    } catch (error) {
      if (!(error instanceof CronError)) throw error;
      console.error(error);
      unavailable = true;
    }
  }

  return {
    desk: ownDesk,
    cronId,
    schedule,
    unavailable,
    nextRun: formatDate(nextSunday(officeNow())),
  };
}

// The job runs every Sunday at 10:00 office time (see addCron).
function nextSunday(now: Date) {
  let sunday = nextDay(startOfDay(now), 0);
  return now.getDay() === 0 && now.getHours() < 10 ? startOfDay(now) : sunday;
}

/** Sets up, pauses, resumes or stops the signed-in user's weekly booking. */
export async function changeRecurring(
  user: { userId: string; firstName: string; lastName: string },
  formData: FormData,
) {
  let intent = formData.get("intent");
  let desk = await findOwnDesk(user.userId);
  let cronId = desk?.user?.autoReservationsCronId ?? null;

  if (!desk) {
    return dataWithError(
      null,
      { message: "Only your own desk can be booked every week" },
      { status: 403 },
    );
  }

  try {
    if (intent === "ADD") {
      // One weekly job per person: a double submit must not leave a second
      // job running that nothing points at any more.
      if (cronId) {
        return dataWithError(
          null,
          { message: "Weekly booking is already set up" },
          { status: 409 },
        );
      }

      let parsedInput = addCronSchema.safeParse({
        days: formData.getAll("day"),
        deskId: String(desk.id),
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      if (!parsedInput.success || parsedInput.data.days.length === 0) {
        return dataWithError(
          null,
          { message: "Pick the days to book" },
          { status: 400 },
        );
      }

      let { jobId } = await addCron(parsedInput.data);
      // Only if no other request stored a job meanwhile; if one did, this
      // job is the extra one and goes again.
      let stored = await db
        .update(users)
        .set({ autoReservationsCronId: String(jobId) })
        .where(
          and(eq(users.id, user.userId), isNull(users.autoReservationsCronId)),
        )
        .returning({ id: users.id });

      if (stored.length === 0) {
        await deleteCron({ cronId: String(jobId) });

        return dataWithError(
          null,
          { message: "Weekly booking is already set up" },
          { status: 409 },
        );
      }

      return dataWithSuccess(null, {
        message: "Weekly booking set up",
      });
    }

    if (!cronId) {
      return dataWithError(
        null,
        { message: "There is no weekly booking to change" },
        { status: 404 },
      );
    }

    if (intent === "DELETE") {
      await deleteCron({ cronId });
      await db
        .update(users)
        .set({ autoReservationsCronId: null })
        .where(
          and(
            eq(users.id, user.userId),
            eq(users.autoReservationsCronId, cronId),
          ),
        );

      return dataWithSuccess(null, {
        message: "Weekly booking stopped",
      });
    } else if (intent === "DISABLE") {
      await disableCron({ cronId });

      return dataWithSuccess(null, {
        message: "Weekly booking paused",
      });
    } else if (intent === "ENABLE") {
      await enableCron({ cronId });

      return dataWithSuccess(null, {
        message: "Weekly booking resumed",
      });
    }
  } catch (error) {
    if (!(error instanceof CronError)) throw error;
    console.error(error);

    return dataWithError(null, schedulerDown, { status: 502 });
  }

  return null;
}

/**
 * A weekly job's Sunday run: books `job.deskId` for the picked days of the
 * week ahead, unless the person already has a booking that week. False when the desk is no longer the person's, after removing
 * the job if it is left over.
 */
export async function runWeeklyBooking(job: {
  deskId: number;
  userId: string;
  days: string[];
}) {
  let userInDb = await db.query.users.findFirst({
    where: eq(users.id, job.userId),
    with: {
      desk: {
        columns: {
          id: true,
        },
      },
    },
  });

  if (!userInDb?.desk || userInDb.desk.id !== job.deskId) {
    if (userInDb?.autoReservationsCronId) {
      await removeIfObsolete(
        userInDb.id,
        userInDb.autoReservationsCronId,
        userInDb.desk?.id,
      );
    }

    return false;
  }

  // The job runs on Sundays, so the week ahead: Monday to Friday after the
  // office's today, by full date (week numbers restart around New Year).
  let week = workdaysOfWeek(officeNow());

  // Any booking of theirs that week means they already planned it by hand,
  // for example removing a day they don't need: leave the week as it is.
  let planned = await db.query.reservations.findFirst({
    columns: { date: true },
    where: and(
      eq(reservations.userId, job.userId),
      inArray(
        reservations.date,
        week.map(({ date }) => formatDate(date)),
      ),
    ),
  });

  if (planned) {
    return true;
  }

  let wanted = new Set(job.days);
  let formattedData = week
    .filter(({ day }) => wanted.has(day))
    .map(({ date }) => bookingRow(job.deskId, job.userId, date));

  if (formattedData.length > 0) {
    await db.insert(reservations).values(formattedData).onConflictDoNothing();
  }

  return true;
}

/**
 * A job for a desk the person no longer has called in. The job saved on them
 * is removed only if it is for another desk than their current one too: it
 * may be a new job for their new desk, which an old one must not take down.
 */
async function removeIfObsolete(
  userId: string,
  cronId: string,
  currentDeskId: number | undefined,
) {
  try {
    let { jobDetails } = await getCronDetails({ cronId });
    if (deskFromJob(jobDetails) === currentDeskId) return;
    await deleteCron({ cronId });
  } catch (error) {
    // Already gone at cron-job.org counts as removed; anything else leaves
    // the job saved, so a later run can try again.
    if (!(error instanceof CronError && error.status === 404)) {
      console.error(error);
      return;
    }
  }

  await db
    .update(users)
    .set({ autoReservationsCronId: null })
    .where(and(eq(users.id, userId), eq(users.autoReservationsCronId, cronId)));
}
