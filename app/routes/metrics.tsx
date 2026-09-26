import { Suspense } from "react";
import { Await } from "react-router";
import { ErrorCard } from "~/components/error-card";
import { Metrics, MetricsSkeleton } from "~/components/metrics";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics } from "~/lib/db/schema";
import type { Route } from "./+types/metrics";

// One row per workday from cron.log-metrics; the page does the grouping.
async function loadMetrics() {
  return await db
    .select({
      bookings: bookingMetrics.totalBookings,
      guestBookings: bookingMetrics.totalGuestBookings,
      date: bookingMetrics.createdAt,
      officeParticipationPct: bookingMetrics.participation_percentage,
    })
    .from(bookingMetrics)
    .orderBy(bookingMetrics.createdAt);
}

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuthCookie(request);

  // Not awaited on purpose: the shell streams immediately and the page fills
  // in once the query resolves.
  return { metrics: loadMetrics() };
}

// Client navigations await the query so the navigation stays pending until the
// data is available; the initial document load still streams.
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  let data = await serverLoader();

  return { metrics: await data.metrics };
}

export default function MetricsPage({ loaderData }: Route.ComponentProps) {
  return (
    <Suspense fallback={<MetricsSkeleton />}>
      <Await
        resolve={loaderData.metrics}
        errorElement={<ErrorCard message="Could not load metrics." />}
      >
        {(rows) => <Metrics rows={rows} />}
      </Await>
    </Suspense>
  );
}
