import {
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { calculatePercentDiff, cn, enterAt } from "~/lib/utils";
import { SLIDE, useSlidingHighlight } from "./sliding-highlight";

// The Metrics tab: this month in one line, how full each weekday usually is,
// and bookings week by week or month by month. Guest bookings are striped,
// not just a second colour, and changes are spelled out ("Up 8%") rather
// than shown as green or red.

export type MetricRow = {
  date: Date | string | number;
  bookings: number;
  guestBookings: number | null;
  officeParticipationPct: number | null;
};

// cron.log-metrics divides by this many desks for participation.
const OFFICE_DESKS = 33;

let INK = "#1f2a2e";
let MOSS = "#4f7a5a";
let MOSS_SOFT = "#e2ede5";
let MUTED = "#5f6b70";
let LINE = "#d8ddda";

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

export type Day = {
  date: Date;
  bookings: number;
  guests: number;
  participation: number;
};

function toDays(rows: MetricRow[]): Day[] {
  return rows.map((row) => ({
    date: new Date(row.date),
    bookings: row.bookings,
    guests: row.guestBookings ?? 0,
    participation: row.officeParticipationPct ?? 0,
  }));
}

function sum(days: Day[], key: keyof Omit<Day, "date">) {
  return days.reduce((acc, day) => acc + day[key], 0);
}

function avg(days: Day[], key: keyof Omit<Day, "date">) {
  return days.length === 0 ? 0 : sum(days, key) / days.length;
}

export function summarise(rows: MetricRow[], now = new Date()) {
  let days = toDays(rows);
  let lastMonthDate = subMonths(now, 1);
  let thisMonth = days.filter((d) => isSameMonth(d.date, now));
  let lastMonth = days.filter((d) => isSameMonth(d.date, lastMonthDate));
  // Month to date against the same days of last month, not the whole month.
  let lastMonthToDate = lastMonth.filter(
    (d) => d.date.getDate() <= now.getDate(),
  );

  return {
    days,
    now,
    monthName: format(now, "MMMM"),
    lastMonthName: format(lastMonthDate, "MMMM"),
    total: sum(thisMonth, "bookings"),
    totalChange: calculatePercentDiff(
      sum(thisMonth, "bookings"),
      sum(lastMonthToDate, "bookings"),
    ),
    perDay: avg(thisMonth, "bookings"),
    participation: avg(thisMonth, "participation"),
  };
}

let WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

/** Average bookings per weekday over the last eight weeks. */
export function busiestDays(days: Day[], now: Date) {
  let recent = days.filter((d) => d.date >= subDays(now, 56));

  return WEEKDAYS.map((name, i) => ({
    name,
    bookings: avg(
      recent.filter((d) => d.date.getDay() === i + 1),
      "bookings",
    ),
  }));
}

export type Period = "weeks" | "months";

/** Bookings per week (last 10) or month (last 6), split into own desk and guests. */
export function bookingsBy(period: Period, days: Day[]) {
  let groups = new Map<
    number,
    { start: number; own: number; guests: number }
  >();

  for (let d of days) {
    let start = (
      period === "weeks"
        ? startOfWeek(d.date, { weekStartsOn: 1 })
        : startOfMonth(d.date)
    ).getTime();
    let group = groups.get(start) ?? { start, own: 0, guests: 0 };
    group.own += d.bookings - d.guests;
    group.guests += d.guests;
    groups.set(start, group);
  }

  return [...groups.values()]
    .sort((a, b) => a.start - b.start)
    .slice(period === "weeks" ? -10 : -6)
    .map((g) => ({ ...g, total: g.own + g.guests }));
}

function MetricsHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        Metrics
      </h1>
      <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
        How busy the office is. Bookings are counted at the end of each workday,
        so treat these as an estimate.
      </p>
    </header>
  );
}

/** "▲ Up 8% vs August by this date": the words carry the direction. */
function Change({ value, against }: { value: number | null; against: string }) {
  if (value === null) {
    return <span>Nothing to compare with from {against} yet</span>;
  }

  let rounded = Math.round(value);

  if (rounded === 0) {
    return <span>The same as {against} by this date</span>;
  }

  return (
    <span>
      <b className="font-semibold text-ink">
        <span aria-hidden>{rounded > 0 ? "▲ " : "▼ "}</span>
        {rounded > 0 ? "Up" : "Down"} {Math.abs(rounded)}%
      </b>{" "}
      vs {against} by this date
    </span>
  );
}

function ThisMonth({ s }: { s: ReturnType<typeof summarise> }) {
  return (
    <section aria-label="This month" className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <p className="text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
          {s.total} {s.total === 1 ? "booking" : "bookings"} in {s.monthName} so
          far
        </p>
        <p className="text-[15px] text-ink-muted">
          <Change value={s.totalChange} against={s.lastMonthName} />
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-10 gap-y-4">
        <div className="flex flex-col gap-1">
          <dt className="text-[13px] font-semibold text-ink-muted">Per day</dt>
          <dd className="text-[22px] font-bold">
            {s.perDay.toFixed()}{" "}
            <span className="text-[13px] font-normal text-ink-muted">
              bookings
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-[13px] font-semibold text-ink-muted">
            Desks in use
          </dt>
          <dd className="text-[22px] font-bold">
            {s.participation.toFixed()}%{" "}
            <span className="text-[13px] font-normal text-ink-muted">
              of {OFFICE_DESKS}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function BusiestDays({ days, now }: { days: Day[]; now: Date }) {
  let weekdays = busiestDays(days, now);
  let busiest = Math.max(...weekdays.map((w) => w.bookings));

  return (
    <section className="flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset ring-line sm:p-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-[16px] font-bold tracking-tight">Busiest days</h2>
        <p className="text-[13px] text-ink-muted">
          Desks booked on an average day, last 8 weeks
        </p>
      </div>

      <ul className="flex flex-col gap-4">
        {weekdays.map((w) => {
          let isBusiest = busiest > 0 && w.bookings === busiest;
          let share = Math.min(1, w.bookings / OFFICE_DESKS);

          return (
            <li
              key={w.name}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[110px_1fr_170px]"
            >
              <span className="text-[14px] font-semibold">{w.name}</span>
              <span
                aria-hidden
                className="relative col-span-2 row-start-2 h-3 overflow-hidden rounded-full bg-paper-muted ring-1 ring-inset ring-line sm:col-span-1 sm:col-start-2 sm:row-start-1"
              >
                <span
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full",
                    isBusiest ? "bg-moss" : "bg-ink",
                  )}
                  style={{ width: `${share * 100}%` }}
                />
              </span>
              <span className="text-right text-[13px] text-ink-muted sm:col-start-3 sm:text-left">
                <b className="font-semibold tabular-nums text-ink">
                  {w.bookings.toFixed()} desks
                </b>{" "}
                · {Math.round(share * 100)}%
                {isBusiest && (
                  <b className="ml-2 font-semibold text-moss-edge">Busiest</b>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

let PERIODS: { key: Period; label: string }[] = [
  { key: "weeks", label: "Weeks" },
  { key: "months", label: "Months" },
];

function PeriodSwitch({
  value,
  onChange,
}: {
  value: Period;
  onChange: (period: Period) => void;
}) {
  let { position, animate, itemRef } = useSlidingHighlight(value);

  return (
    <div
      role="group"
      aria-label="Group bookings by"
      className="relative inline-grid grid-cols-2 self-start rounded-full bg-paper-muted p-1 ring-1 ring-inset ring-line"
    >
      {position && (
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 rounded-full bg-paper shadow-[0_1px_3px_rgb(31_42_46/0.14)] ring-1 ring-line",
            animate && SLIDE,
          )}
          style={{
            width: position.width,
            height: position.height,
            transform: `translate(${position.left}px, ${position.top}px)`,
          }}
        />
      )}
      {PERIODS.map((period) => (
        <button
          key={period.key}
          ref={itemRef(period.key)}
          type="button"
          aria-pressed={period.key === value}
          onClick={() => onChange(period.key)}
          className={cn(
            "relative inline-flex h-8 items-center justify-center rounded-full px-4 text-[13px] font-semibold transition-colors duration-300",
            focusRing,
            period.key === value
              ? cn("text-ink", !position && "bg-paper")
              : "text-ink-muted hover:text-ink",
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
}

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

let axisTick = { fill: MUTED, fontSize: 11 };

function BookingsChart({ days, now }: { days: Day[]; now: Date }) {
  let [period, setPeriod] = useState<Period>("weeks");
  let data = bookingsBy(period, days);

  return (
    <section className="flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset ring-line sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-bold tracking-tight">
            {period === "weeks" ? "Week by week" : "Month by month"}
          </h2>
          <p className="text-[13px] text-ink-muted">
            {period === "weeks"
              ? "Bookings each week, last 10 weeks"
              : "Bookings each month, last 6 months"}
          </p>
        </div>
        <PeriodSwitch value={period} onChange={setPeriod} />
      </div>

      <ChartContainer className="aspect-auto h-[240px] sm:h-[300px]">
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
      </ChartContainer>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden className="h-3 w-3 rounded-[3px] bg-ink" />
          At their own desk
        </span>
        <span className="inline-flex items-center gap-2">
          <svg aria-hidden width="12" height="12">
            <rect
              width="12"
              height="12"
              rx="3"
              fill="url(#guest-hatch)"
              stroke={MOSS}
            />
          </svg>
          Guests on a borrowed desk
        </span>
      </div>
    </section>
  );
}

export function Metrics({ rows }: { rows: MetricRow[] }) {
  let s = summarise(rows);

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />
      {s.days.length === 0 ? (
        <p className="enter rounded-xl px-5 py-8 text-center text-[14px] text-ink-muted ring-1 ring-inset ring-line">
          Nothing counted yet. Numbers show up here after the first workday.
        </p>
      ) : (
        <>
          <div className="enter">
            <ThisMonth s={s} />
          </div>
          <div className="enter" style={enterAt(1)}>
            <BusiestDays days={s.days} now={s.now} />
          </div>
          <div className="enter" style={enterAt(2)}>
            <BookingsChart days={s.days} now={s.now} />
          </div>
        </>
      )}
    </div>
  );
}

export function MetricsSkeleton() {
  let block = "animate-pulse rounded-md bg-paper-muted";

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />
      <div aria-hidden className="flex flex-col gap-3">
        <div className={cn(block, "h-9 w-72 max-w-full")} />
        <div className={cn(block, "h-5 w-56")} />
      </div>
      <div aria-hidden className={cn(block, "h-[280px] rounded-xl")} />
      <div aria-hidden className={cn(block, "h-[380px] rounded-xl")} />
    </div>
  );
}
