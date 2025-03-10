import { isSameMonth, subMonths, toDate } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { InfoTooltip } from "~/components/info-tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "~/components/ui/chart";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { bookingMetrics } from "~/lib/db/schema";
import { calculatePercentDiff } from "~/lib/utils";
import type { Route } from "./+types/metrics";

export async function loader({ request }: Route.LoaderArgs) {
  await requireAuthCookie(request);

  let metrics = await db
    .select({
      bookings: bookingMetrics.totalBookings,
      guestBookings: bookingMetrics.totalGuestBookings,
      date: bookingMetrics.createdAt,
      officeParticipationPct: bookingMetrics.participation_percentage,
    })
    .from(bookingMetrics);

  let previousMonth = toDate(subMonths(new Date(), 1));

  let previousMonthsMetrics = metrics.filter((row) =>
    isSameMonth(new Date(row.date), previousMonth),
  );

  let totalBookingsPreviousMonth = previousMonthsMetrics.reduce(
    (acc, row) => acc + row.bookings,
    0,
  );

  let totalMonthlyBookings = metrics
    .filter((row) => isSameMonth(new Date(row.date), new Date()))
    .reduce((acc, row) => acc + row.bookings, 0);

  let totalBookings = metrics.reduce((acc, row) => acc + row.bookings, 0);

  let averageDailyBookings = totalBookings / metrics.length;

  let monthlyBookingsPctDiff = calculatePercentDiff(
    totalMonthlyBookings,
    totalBookingsPreviousMonth,
  );

  let averageOfficeParticipationPct =
    metrics.reduce((acc, row) => acc + (row.officeParticipationPct ?? 0), 0) /
    metrics.length;

  return {
    metrics,
    totalMonthlyBookings,
    totalBookings,
    averageDailyBookings: averageDailyBookings.toFixed(),
    monthlyBookingsPctDiff,
    averageOfficeParticipationPct: averageOfficeParticipationPct.toFixed(),
  };
}

export default function MetricsPage({ loaderData }: Route.ComponentProps) {
  function formatPercentage(value: number) {
    return value > 0 ? `+${value.toFixed()}` : value.toFixed();
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total monthly Bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loaderData.totalMonthlyBookings}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(loaderData.monthlyBookingsPctDiff)}% from last
              month
            </p>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average daily bookings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loaderData.averageDailyBookings}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatPercentage(loaderData.monthlyBookingsPctDiff)}% from last
              month
            </p>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center gap-1.5 text-sm font-medium">
              Office participation percentage{" "}
              <InfoTooltip text="Take those metrics with a grain of salt, since we are not confirming the booking data." />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loaderData.averageOfficeParticipationPct}%
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Daily Bookings</CardTitle>
            <CardDescription>
              Number of workspace bookings per day
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              className="aspect-auto h-[300px] md:h-[350px]"
              config={{
                bookings: {
                  label: "Total Bookings",
                  color: "hsl(var(--chart-3))",
                },
                guestBookings: {
                  label: "Guest Bookings",
                  color: "hsl(var(--chart-4))",
                },
              }}
            >
              <LineChart
                data={loaderData.metrics}
                margin={{ top: 24, left: 4, right: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={32}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip
                  cursor={false}
                  labelFormatter={() => "Bookings"}
                  content={<ChartTooltipContent indicator="line" />}
                />
                <Line
                  type="monotone"
                  dataKey="bookings"
                  stroke="var(--color-bookings)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <Line
                  type="monotone"
                  dataKey="guestBookings"
                  stroke="var(--color-guestBookings)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
