import { format } from "date-fns";
import { and, count, eq, ne } from "drizzle-orm";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics, desks, reservations } from "~/lib/db/schema";
import type { Route } from "./+types/cron.log-metrics";

export async function loader({ request }: Route.LoaderArgs) {
  let url = new URL(request.url);

  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let today = format(new Date(), "dd.MM.yyyy");

  let metricsForToday = await db
    .select()
    .from(bookingMetrics)
    .where(eq(bookingMetrics.metricDate, today));

  if (metricsForToday.length !== 0) {
    return new Response(`Metrics for ${today} already exists`, { status: 406 });
  }

  let todaysReservationsCount = await db.$count(
    reservations,
    eq(reservations.date, today),
  );

  let todaysGuestReservationsCount = await db
    .select({ value: count() })
    .from(reservations)
    .innerJoin(desks, eq(reservations.deskId, desks.id))
    .where(
      and(eq(reservations.date, today), ne(reservations.userId, desks.userId)),
    );

  await db.insert(bookingMetrics).values({
    metricDate: today,
    totalBookings: todaysReservationsCount,
    totalGuestBookings: todaysGuestReservationsCount[0].value ?? 0,
  });

  return new Response(`Metrics for ${today} have been successfully created`, {
    status: 200,
  });
}
