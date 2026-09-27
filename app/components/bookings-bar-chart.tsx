import { format, isSameMonth } from "date-fns";
import { lazy } from "react";
import type * as Recharts from "recharts";
import { CHART_FRAME } from "~/components/chart-frame";
import type { bookingsBy, Period } from "~/lib/metrics";

// The Metrics bar chart. The chart library is large, so it loads only when
// Metrics draws the chart, not with the rest of the app.

let INK = "#1f2a2e";
let MOSS = "#4f7a5a";
let MOSS_SOFT = "#e2ede5";
let MUTED = "#5f6b70";
let LINE = "#d8ddda";

let axisTick = { fill: MUTED, fontSize: 11 };

function ChartTip({
  active,
  payload,
  label,
  period,
}: {
  active?: boolean;
  payload?: { name: string; value: number; dataKey: string }[];
  label?: number;
  period: Period;
}) {
  if (!active || !payload?.length || label == null) {
    return null;
  }

  return (
    <div className="rounded-lg bg-paper px-3 py-2 text-[12px] shadow-[0_4px_16px_rgb(31_42_46/0.14)] ring-1 ring-line">
      <div className="mb-1 font-semibold text-ink">
        {format(label, period === "weeks" ? "'Week of' d MMM" : "MMMM yyyy")}
      </div>
      {payload.map((item) => (
        <div
          key={item.dataKey}
          className="flex justify-between gap-4 text-ink-muted"
        >
          <span>{item.name}</span>
          <span className="font-semibold tabular-nums text-ink">
            {item.value}
          </span>
        </div>
      ))}
    </div>
  );
}

type ChartProps = {
  data: ReturnType<typeof bookingsBy>;
  period: Period;
  now: Date;
};

export let BookingsBarChart = lazy(() =>
  import("recharts").then((lib) => ({
    default: (props: ChartProps) => <Chart lib={lib} {...props} />,
  })),
);

function Chart({
  lib,
  data,
  period,
  now,
}: ChartProps & { lib: typeof Recharts }) {
  let {
    Bar,
    BarChart,
    CartesianGrid,
    LabelList,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
  } = lib;

  return (
    <div aria-hidden className={CHART_FRAME}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 22, left: -12, right: 4 }}>
          <defs>
            <pattern
              id="guest-hatch"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={MOSS_SOFT} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={MOSS} strokeWidth="3" />
            </pattern>
          </defs>
          <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="start"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            interval="preserveStartEnd"
            minTickGap={8}
            tick={axisTick}
            tickFormatter={(value: number) =>
              period === "weeks"
                ? format(value, "d MMM")
                : isSameMonth(value, now)
                  ? `${format(value, "MMM")} so far`
                  : format(value, "MMM")
            }
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tick={axisTick}
          />
          <Tooltip
            cursor={{ fill: "#f4f5f2" }}
            content={<ChartTip period={period} />}
          />
          <Bar
            name="At their own desk"
            dataKey="own"
            stackId="bookings"
            fill={INK}
            isAnimationActive={false}
          />
          <Bar
            name="Guests"
            dataKey="guests"
            stackId="bookings"
            fill="url(#guest-hatch)"
            stroke={MOSS}
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="total"
              position="top"
              offset={6}
              style={{ fill: INK, fontSize: 11, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
