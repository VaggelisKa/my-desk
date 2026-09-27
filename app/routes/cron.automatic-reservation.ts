import { getWeek } from "date-fns";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { CronError, deleteCron, deskFromJob, getCronDetails } from "~/lib/cron";
import { formatDate, officeNow, workdaysOfWeek } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { reservations, users } from "~/lib/db/schema";
import type { Route } from "./+types/cron.automatic-reservation";

const automaticReservationsQueryArgsSchema = z.object({
  deskId: z.number(),
  userId: z.string(),
  days: z.array(z.string()),
});

export async function loader({ url }: Route.LoaderArgs) {
  let cronPassword = url.searchParams.get("cronPassword");

  if (!cronPassword || cronPassword !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let days = url.searchParams.getAll("day");
  let deskId = Number(url.searchParams.get("deskId"));
  let userId = url.searchParams.get("userId");

  let parsedInputs = automaticReservationsQueryArgsSchema.safeParse({
    deskId,
    userId,
    days,
  });

  if (!parsedInputs.success) {
    return new Response("Invalid input", { status: 400 });
  }

  let userInDb = await db.query.users.findFirst({
    where: eq(users.id, parsedInputs.data.userId),
    with: {
      desk: {
        columns: {
          id: true,
        },
      },
    },
  });

  if (!userInDb?.desk || userInDb.desk.id !== parsedInputs.data.deskId) {
    if (userInDb?.autoReservationsCronId) {
      await removeIfObsolete(
        userInDb.id,
        userInDb.autoReservationsCronId,
        userInDb.desk?.id,
      );
    }

    return new Response("Desk does not match user's desk", { status: 401 });
  }

  // The job runs on Sundays, so the week ahead: Monday to Friday after the
  // office's today, by full date (week numbers restart around New Year).
  let wanted = new Set(parsedInputs.data.days);
  let formattedData = workdaysOfWeek(officeNow())
    .filter(({ day }) => wanted.has(day))
    .map(({ day, date }) => ({
      day,
      week: getWeek(date),
      deskId: parsedInputs.data.deskId,
      userId: parsedInputs.data.userId,
      date: formatDate(date),
      dateTimestamp: date.getTime(),
    }));

  if (formattedData.length > 0) {
    await db.insert(reservations).values(formattedData).onConflictDoNothing();
  }

  return new Response(
    "Automatic reservation interval has executed successfully!",
    {
      status: 200,
    },
  );
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
