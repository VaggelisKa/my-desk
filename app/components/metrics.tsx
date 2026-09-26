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
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "~/components/ui/chart";
import { cn } from "~/lib/utils";
import { SLIDE, useSlidingHighlight } from "./sliding-highlight";

export type MetricRow = {
  date: Date | string | number;
  bookings: number;
  guestBookings: number | null;
  officeParticipationPct: number | null;
};

// The daily job divides by this many desks for participation.
export const OFFICE_DESKS = 33;

let INK = "#1f2a2e";
let MOSS = "#4f7a5a";
let MUTED = "#5f6b70";
let LINE = "#d8ddda";

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

type Day = {
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

function sum(days: Day[], key: "bookings" | "guests" | "participation") {
  return days.reduce((acc, day) => acc + day[key], 0);
}

function avg(days: Day[], key: "bookings" | "guests" | "participation") {
  return days.length === 0 ? 0 : sum(days, key) / days.length;
}

function pctChange(value: number, previous: number) {
  return previous === 0 ? null : ((value - previous) / previous) * 100;
}

function summarise(rows: MetricRow[], now = new Date()) {
  let days = toDays(rows);
  let thisMonth = days.filter((d) => isSameMonth(d.date, now));
  let lastMonthDate = subMonths(now, 1);
  let lastMonth = days.filter((d) => isSameMonth(d.date, lastMonthDate));
  // Month to date against the same days of last month.
  let lastMonthToDate = lastMonth.filter(
    (d) => d.date.getDate() <= now.getDate(),
  );

  return {
    days,
    now,
    monthName: format(now, "MMMM"),
    lastMonthName: format(lastMonthDate, "MMMM"),
    total: sum(thisMonth, "bookings"),
    totalChange: pctChange(
      sum(thisMonth, "bookings"),
      sum(lastMonthToDate, "bookings"),
    ),
    perDay: avg(thisMonth, "bookings"),
    perDayChange: avg(thisMonth, "bookings") - avg(lastMonth, "bookings"),
    hasLastMonth: lastMonth.length > 0,
    participation: avg(thisMonth, "participation"),
  };
}

export function MetricsHeader() {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        Metrics
      </h1>
      <p className="max-w-[52ch] text-[14px] leading-relaxed text-ink-muted">
        How busy the office is. Bookings are counted at the end of each
        workday, so treat these as an estimate.
      </p>
    </header>
  );
}

/** "▲ 12% vs August so far": the arrow and the words carry the direction. */
function Change({
  value,
  suffix,
  unit = "%",
}: {
  value: number | null;
  suffix: string;
  unit?: string;
}) {
  if (value === null) {
    return <span>Nothing to compare with yet</span>;
  }

  let rounded = Math.round(value);

  if (rounded === 0) {
    return <span>Same as {suffix}</span>;
  }

  return (
    <span>
      <b className="font-semibold text-ink">
        <span aria-hidden>{rounded > 0 ? "▲ " : "▼ "}</span>
        {rounded > 0 ? "Up " : "Down "}
        {Math.abs(rounded)}
        {unit}
      </b>{" "}
      vs {suffix}
    </span>
  );
}

function StatTile({
  label,
  value,
  note,
  accent,
  className,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  accent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl p-5 ring-1 ring-inset",
        accent ? "bg-moss-soft ring-[#4f7a5a]/30" : "bg-paper ring-line",
        className,
      )}
    >
      <div className="text-[13px] font-semibold text-ink-muted">{label}</div>
      <div className="font-display text-[30px] font-bold leading-none tracking-tight text-ink">
        {value}
      </div>
      <div className="text-[13px] leading-snug text-ink-muted">{note}</div>
    </div>
  );
}

function StatTiles({ s }: { s: ReturnType<typeof summarise> }) {
  return (
    <section
      aria-label="This month"
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      <StatTile
        label={`Bookings in ${s.monthName}`}
        value={String(s.total)}
        note={
          <Change value={s.totalChange} suffix={`${s.lastMonthName} so far`} />
        }
      />
      <StatTile
        label="Per day"
        value={s.perDay.toFixed()}
        note={
          <Change
            value={s.hasLastMonth ? s.perDayChange : null}
            suffix={s.lastMonthName}
            unit=""
          />
        }
      />
      <StatTile
        accent
        className="col-span-2 sm:col-span-1"
        label="Desks in use"
        value={`${s.participation.toFixed()}%`}
        note={`Of ${OFFICE_DESKS} desks, on an average day`}
      />
    </section>
  );
}

let RANGES = [
  { key: "month", label: "30 days", days: 30 },
  { key: "quarter", label: "90 days", days: 90 },
  { key: "all", label: "All", days: Infinity },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

function RangeSwitch({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (key: RangeKey) => void;
}) {
  let { position, animate, itemRef } = useSlidingHighlight(value);

  return (
    <div
      role="group"
      aria-label="Range"
      className="relative inline-flex self-start rounded-full bg-paper-muted p-1 ring-1 ring-inset ring-line"
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
      {RANGES.map((range) => (
        <button
          key={range.key}
          ref={itemRef(range.key)}
          type="button"
          aria-pressed={range.key === value}
          onClick={() => onChange(range.key)}
          className={cn(
            "relative inline-flex h-8 items-center rounded-full px-3.5 text-[13px] font-semibold transition-colors duration-300",
            focusRing,
            range.key === value
              ? cn("text-ink", !position && "bg-paper")
              : "text-ink-muted hover:text-ink",
          )}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}

/** A legend key that shows the line's pattern, not just its colour. */
function LineKey({ dashed, color }: { dashed?: boolean; color: string }) {
  return (
    <svg width="22" height="8" aria-hidden className="shrink-0">
      <line
        x1="1"
        x2="21"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={dashed ? "4 3" : undefined}
        strokeLinecap="round"
      />
    </svg>
  );
}

function ChartTip({
  active,
  payload,
  label,
  labelFormat = "EEE d MMM",
}: {
  active?: boolean;
  payload?: { name: string; value: number; dataKey: string }[];
  label?: string | number;
  labelFormat?: string;
}) {
  if (!active || !payload?.length || label == null) {
    return null;
  }

  return (
    <div className="rounded-lg bg-paper px-3 py-2 text-[12px] shadow-[0_4px_16px_rgb(31_42_46/0.14)] ring-1 ring-line">
      <div className="mb-1 font-semibold text-ink">
        {format(new Date(label), labelFormat)}
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

/* -------------------------------------------------------------- Option A */

export function OptionTrend({ rows }: { rows: MetricRow[] }) {
  let s = summarise(rows);
  let [range, setRange] = useState<RangeKey>("month");
  let limit = RANGES.find((r) => r.key === range)!.days;
  let from = subDays(s.now, limit === Infinity ? 100000 : limit);
  let data = s.days
    .filter((d) => d.date >= from)
    .map((d) => ({ ...d, date: d.date.getTime() }));

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />
      <StatTiles s={s} />

      <section className="flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset ring-line sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-[16px] font-bold tracking-tight">
            Bookings per day
          </h2>
          <RangeSwitch value={range} onChange={setRange} />
        </div>

        <ChartContainer config={{}} className="aspect-auto h-[240px] sm:h-[300px]">
          <LineChart data={data} margin={{ top: 8, left: -12, right: 8 }}>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              minTickGap={40}
              tick={axisTick}
              tickFormatter={(v) => format(new Date(v), "d MMM")}
            />
            <YAxis
              domain={[0, "auto"]}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
            />
            <Tooltip cursor={{ stroke: LINE }} content={<ChartTip />} />
            <Line
              name="All bookings"
              dataKey="bookings"
              stroke={INK}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
            <Line
              name="Guest bookings"
              dataKey="guests"
              stroke={MOSS}
              strokeWidth={2.5}
              strokeDasharray="5 4"
              dot={false}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ChartContainer>

        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <LineKey color={INK} />
            All bookings
          </span>
          <span className="inline-flex items-center gap-2">
            <LineKey color={MOSS} dashed />
            Guest bookings
          </span>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Option B */

export function OptionWeekly({ rows }: { rows: MetricRow[] }) {
  let s = summarise(rows);
  let byWeek = new Map<number, { week: number; own: number; guests: number }>();

  for (let d of s.days) {
    let week = startOfWeek(d.date, { weekStartsOn: 1 }).getTime();
    let entry = byWeek.get(week) ?? { week, own: 0, guests: 0 };
    entry.own += d.bookings - d.guests;
    entry.guests += d.guests;
    byWeek.set(week, entry);
  }

  let data = [...byWeek.values()]
    .slice(-10)
    .map((w) => ({ ...w, total: w.own + w.guests }));

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />

      <section aria-label="This month" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="font-display text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">
            {s.total} bookings in {s.monthName} so far
          </p>
          <p className="text-[15px] text-ink-muted">
            <Change value={s.totalChange} suffix={`${s.lastMonthName} by this date`} />
          </p>
        </div>

        <dl className="flex flex-wrap gap-x-10 gap-y-4">
          <div className="flex flex-col gap-1">
            <dt className="text-[13px] font-semibold text-ink-muted">
              Per day
            </dt>
            <dd className="font-display text-[22px] font-bold">
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
            <dd className="font-display text-[22px] font-bold">
              {s.participation.toFixed()}%{" "}
              <span className="text-[13px] font-normal text-ink-muted">
                of {OFFICE_DESKS}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      <section className="flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset ring-line sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-bold tracking-tight">Week by week</h2>
          <p className="text-[13px] text-ink-muted">
            Bookings each week, last 10 weeks
          </p>
        </div>

        <ChartContainer config={{}} className="aspect-auto h-[240px] sm:h-[300px]">
          <BarChart data={data} margin={{ top: 22, left: -12, right: 4 }}>
            <defs>
              <pattern
                id="guest-hatch"
                width="6"
                height="6"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="6" height="6" fill="#e2ede5" />
                <line x1="0" y1="0" x2="0" y2="6" stroke={MOSS} strokeWidth="3" />
              </pattern>
            </defs>
            <CartesianGrid stroke={LINE} strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={10}
              interval="preserveStartEnd"
              minTickGap={8}
              tick={axisTick}
              tickFormatter={(v) => format(new Date(v), "d MMM")}
            />
            <YAxis
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
            />
            <Tooltip
              cursor={{ fill: "#f4f5f2" }}
              content={<ChartTip labelFormat="'Week of' d MMM" />}
            />
            <Bar
              name="Own desk"
              dataKey="own"
              stackId="a"
              fill={INK}
              isAnimationActive={false}
            />
            <Bar
              name="Guests"
              dataKey="guests"
              stackId="a"
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
            <span className="h-3 w-3 rounded-[3px] bg-ink" aria-hidden />
            At their own desk
          </span>
          <span className="inline-flex items-center gap-2">
            <svg width="12" height="12" aria-hidden>
              <rect width="12" height="12" rx="3" fill="url(#guest-hatch)" stroke={MOSS} />
            </svg>
            Guests on a borrowed desk
          </span>
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- Option C */

let WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export function OptionBusiest({ rows }: { rows: MetricRow[] }) {
  let s = summarise(rows);
  let recent = s.days.filter((d) => d.date >= subDays(s.now, 56));
  let weekdays = WEEKDAY_NAMES.map((name, i) => {
    let days = recent.filter((d) => d.date.getDay() === i + 1);
    return { name, bookings: avg(days, "bookings") };
  });
  let busiest = Math.max(...weekdays.map((w) => w.bookings));

  let months = new Map<number, Day[]>();
  for (let d of s.days) {
    let key = startOfMonth(d.date).getTime();
    months.set(key, [...(months.get(key) ?? []), d]);
  }
  let monthRows = [...months.entries()].slice(-5).reverse();

  return (
    <div className="flex w-full flex-col gap-8 font-display text-ink">
      <MetricsHeader />
      <StatTiles s={s} />

      <section className="flex flex-col gap-5 rounded-xl p-5 ring-1 ring-inset ring-line sm:p-6">
        <div className="flex flex-col gap-1">
          <h2 className="text-[16px] font-bold tracking-tight">
            Busiest days
          </h2>
          <p className="text-[13px] text-ink-muted">
            Desks booked on an average day, last 8 weeks
          </p>
        </div>

        <ul className="flex flex-col gap-4">
          {weekdays.map((w) => {
            let isBusiest = w.bookings === busiest && busiest > 0;
            return (
              <li
                key={w.name}
                className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 sm:grid-cols-[110px_1fr_170px]"
              >
                <span className="text-[14px] font-semibold text-ink">
                  {w.name}
                </span>
                <span className="relative col-span-2 row-start-2 h-3 overflow-hidden rounded-full sm:col-span-1 sm:col-start-2 sm:row-start-1 bg-paper-muted ring-1 ring-inset ring-line">
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      isBusiest ? "bg-moss" : "bg-ink",
                    )}
                    style={{ width: `${(w.bookings / OFFICE_DESKS) * 100}%` }}
                  />
                </span>
                <span className="text-right text-[13px] text-ink-muted sm:col-start-3 sm:text-left">
                  <b className="font-semibold tabular-nums text-ink">
                    {w.bookings.toFixed()} desks
                  </b>{" "}
                  · {Math.round((w.bookings / OFFICE_DESKS) * 100)}%
                  {isBusiest && (
                    <b className="ml-2 font-semibold text-moss-edge">Busiest</b>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="px-1 text-[12px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Month by month
        </h2>
        <div className="overflow-hidden rounded-xl ring-1 ring-inset ring-line">
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] text-ink-muted">
              <tr className="border-b border-line">
                <th className="px-5 py-3 font-semibold">Month</th>
                <th className="px-3 py-3 text-right font-semibold">Bookings</th>
                <th className="px-3 py-3 text-right font-semibold">Per day</th>
                <th className="px-5 py-3 text-right font-semibold">
                  Desks in use
                </th>
              </tr>
            </thead>
            <tbody>
              {monthRows.map(([key, days]) => (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3.5 font-semibold">
                    {format(new Date(key), "MMMM")}
                    {isSameMonth(new Date(key), s.now) && (
                      <span className="ml-2 text-[12px] font-normal text-ink-muted">
                        so far
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {sum(days, "bookings")}
                  </td>
                  <td className="px-3 py-3.5 text-right tabular-nums">
                    {avg(days, "bookings").toFixed()}
                  </td>
                  <td className="px-5 py-3.5 text-right tabular-nums">
                    {avg(days, "participation").toFixed()}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
