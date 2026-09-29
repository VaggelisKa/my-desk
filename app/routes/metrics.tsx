import { Suspense } from "react";
import { Await } from "react-router";
import { ErrorCard } from "~/components/error-card";
import { Metrics } from "~/components/metrics";
import { MetricsSkeleton } from "~/components/metrics-skeleton";
import { early, requireSessionCookie, requireUser } from "~/cookies.server";
import { parseDate } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics, desks } from "~/lib/db/schema";
import { cacheKey, cached } from "~/lib/tab-cache";
import type { Route } from "./+types/metrics";

export let meta: Route.MetaFunction = () => [{ title: "Metrics" }];

// One row per workday from cron.log-metrics; the page does the grouping.
// Each row counts for the day it measured, not the moment it was written.
async function loadMetrics() {
  let rows = await db
    .select({
      bookings: bookingMetrics.totalBookings,
      guestBookings: bookingMetrics.totalGuestBookings,
      metricDate: bookingMetrics.metricDate,
      officeParticipationPct: bookingMetrics.participation_percentage,
    })
    .from(bookingMetrics);

  return rows
    .map(({ metricDate, ...row }) => ({ ...row, date: parseDate(metricDate) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
}

async function loadPage() {
  let [rows, deskCount] = await Promise.all([loadMetrics(), db.$count(desks)]);
  return { rows, deskCount };
}

export async function loader(args: Route.LoaderArgs) {
  // Not awaited on purpose: the shell streams immediately and the page fills
  // in once the query resolves. For a signed cookie it starts alongside the
  // check that the user still exists, and goes out only once that passed.
  await requireSessionCookie(args);
  let metrics = early(loadPage());
  await requireUser(args);

  return { metrics };
}

// Client navigations await the query so the navigation stays pending until the
// data is available; the initial document load still streams. Coming back
// shows the last numbers at once and refreshes them behind the scenes.
export function clientLoader({
  serverLoader,
  request,
}: Route.ClientLoaderArgs) {
  return cached(cacheKey("routes/metrics", request), request, async () => {
    let data = await serverLoader();

    return { metrics: await data.metrics };
  });
}

export default function MetricsPage({ loaderData }: Route.ComponentProps) {
  return (
    <Suspense fallback={<MetricsSkeleton />}>
      <Await
        resolve={loaderData.metrics}
        errorElement={<ErrorCard message="Could not load metrics." />}
      >
        {({ rows, deskCount }) => <Metrics rows={rows} deskCount={deskCount} />}
      </Await>
    </Suspense>
  );
}
