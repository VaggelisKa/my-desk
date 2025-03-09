import { format } from "date-fns";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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

const dailyBookingsData = [
  { date: "2023-06-01", bookings: 12, guestBookings: 3 },
  { date: "2023-06-02", bookings: 19, guestBookings: 5 },
  { date: "2023-06-03", bookings: 8, guestBookings: 2 },
  { date: "2023-06-04", bookings: 5, guestBookings: 1 },
  { date: "2023-06-05", bookings: 20, guestBookings: 7 },
  { date: "2023-06-06", bookings: 32, guestBookings: 9 },
  { date: "2023-06-07", bookings: 25, guestBookings: 6 },
  { date: "2023-06-08", bookings: 18, guestBookings: 4 },
  { date: "2023-06-09", bookings: 21, guestBookings: 8 },
  { date: "2023-06-10", bookings: 16, guestBookings: 5 },
  { date: "2023-06-11", bookings: 4, guestBookings: 1 },
  { date: "2023-06-12", bookings: 9, guestBookings: 2 },
  { date: "2023-06-13", bookings: 15, guestBookings: 4 },
  { date: "2023-06-14", bookings: 22, guestBookings: 7 },
  { date: "2023-06-15", bookings: 30, guestBookings: 10 },
  { date: "2023-06-16", bookings: 28, guestBookings: 8 },
  { date: "2023-06-17", bookings: 14, guestBookings: 3 },
  { date: "2023-06-18", bookings: 7, guestBookings: 2 },
  { date: "2023-06-19", bookings: 13, guestBookings: 4 },
  { date: "2023-06-20", bookings: 24, guestBookings: 6 },
  { date: "2023-06-21", bookings: 29, guestBookings: 9 },
  { date: "2023-06-22", bookings: 17, guestBookings: 5 },
  { date: "2023-06-23", bookings: 23, guestBookings: 7 },
  { date: "2023-06-24", bookings: 11, guestBookings: 3 },
  { date: "2023-06-25", bookings: 6, guestBookings: 1 },
  { date: "2023-06-26", bookings: 10, guestBookings: 2 },
  { date: "2023-06-27", bookings: 26, guestBookings: 8 },
  { date: "2023-06-28", bookings: 31, guestBookings: 11 },
  { date: "2023-06-29", bookings: 27, guestBookings: 9 },
  { date: "2023-06-30", bookings: 20, guestBookings: 6 },
];

export default function MetricsPage() {
  return (
    <div className="flex w-full flex-col gap-4">
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Bookings (This Month)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">580</div>
            <p className="text-xs text-muted-foreground">
              +12.5% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Average daily booking
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">19.3</div>
            <p className="text-xs text-muted-foreground">
              +12.5% from last month
            </p>
          </CardContent>
        </Card>

        <Card className="w-full">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">23</div>
            <p className="text-xs text-muted-foreground">
              +12.5% from last month
            </p>
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
                  label: "Employee Bookings",
                  color: "hsl(var(--chart-3))",
                },
                guestBookings: {
                  label: "Guest Bookings",
                  color: "hsl(var(--chart-4))",
                },
              }}
            >
              <LineChart
                data={dailyBookingsData}
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
                  content={
                    <ChartTooltipContent
                      indicator="line"
                      nameKey="bookings"
                      labelFormatter={(value) => format(value, "ccc dd LLL")}
                    />
                  }
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
