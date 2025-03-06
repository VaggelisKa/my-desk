import { format } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics, reservations } from "~/lib/db/schema";
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

  await db.insert(bookingMetrics).values({
    metricDate: today,
    totalBookings: todaysReservationsCount,
  });

  return new Response(`Metrics for ${today} have been successfully created`, {
    status: 200,
  });
}
