import { and, count, eq, isNull, ne, or } from "drizzle-orm";
import { formatDate } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics, desks, reservations } from "~/lib/db/schema";
import type { Route } from "./+types/cron.log-metrics";

export async function loader({ url }: Route.LoaderArgs) {
  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let today = formatDate(new Date());

  let metricsForToday = await db
    .select()
    .from(bookingMetrics)
    .where(eq(bookingMetrics.metricDate, today));

  if (metricsForToday.length !== 0) {
    return new Response(`Metrics for ${today} already exists`, { status: 406 });
  }

  let [todaysReservationsCount, todaysGuestReservationsCount] =
    await Promise.all([
      db.$count(reservations, eq(reservations.date, today)),
      db
        .select({ value: count() })
        .from(reservations)
        .innerJoin(desks, eq(reservations.deskId, desks.id))
        .where(
          and(
            eq(reservations.date, today),
            // Bookings on unassigned desks are guest bookings too; `ne` alone drops them since NULL != x is NULL
            or(isNull(desks.userId), ne(reservations.userId, desks.userId)),
          ),
        ),
    ]);

  await db.insert(bookingMetrics).values({
    metricDate: today,
    totalBookings: todaysReservationsCount,
    totalGuestBookings: todaysGuestReservationsCount[0].value ?? 0,
    participation_percentage: Math.round((todaysReservationsCount / 33) * 100),
  });

  return new Response(`Metrics for ${today} have been successfully created`, {
    status: 200,
  });
}
