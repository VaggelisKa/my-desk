import { format } from "date-fns";
import { Suspense, useState } from "react";
import { BookingsBarChart } from "~/components/bookings-bar-chart";
import { CHART_FRAME } from "~/components/chart-frame";
import { MetricsHeader } from "~/components/metrics-skeleton";
import { officeNow } from "~/lib/dates";
import {
  bookingsBy,
  busiestDays,
  summarise,
  type Day,
  type MetricRow,
  type Period,
} from "~/lib/metrics";
import { cn, enterAt } from "~/lib/utils";
import { SLIDE, useSlidingHighlight } from "./sliding-highlight";

// The Metrics tab: this month in one line, how full each weekday usually is,
// and bookings week by week or month by month. Guest bookings are striped,
// not just a second colour, and changes are spelled out ("Up 8%") rather
// than shown as green or red.

let MOSS = "#4f7a5a";

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

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

function ThisMonth({
  s,
  deskCount,
}: {
  s: ReturnType<typeof summarise>;
  deskCount: number;
}) {
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
              of {deskCount}
            </span>
          </dd>
        </div>
      </dl>
    </section>
  );
}

function BusiestDays({
  days,
  now,
  deskCount,
}: {
  days: Day[];
  now: Date;
  deskCount: number;
}) {
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
          let share = Math.min(1, w.bookings / Math.max(1, deskCount));

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

function BookingsChart({ days, now }: { days: Day[]; now: Date }) {
  let [period, setPeriod] = useState<Period>("weeks");
  let data = bookingsBy(period, days, now);

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

      <ChartTable data={data} period={period} />

      {/* Drawn only; the table above carries the same numbers. The chart
          library loads only here, with an empty frame of the same size
          until it arrives. */}
      <Suspense fallback={<div aria-hidden className={CHART_FRAME} />}>
        <BookingsBarChart data={data} period={period} now={now} />
      </Suspense>

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

/** The chart's numbers as a table, for screen readers. */
function ChartTable({
  data,
  period,
}: {
  data: ReturnType<typeof bookingsBy>;
  period: Period;
}) {
  return (
    <table className="sr-only">
      <caption>
        {period === "weeks" ? "Bookings each week" : "Bookings each month"}
      </caption>
      <thead>
        <tr>
          <th scope="col">{period === "weeks" ? "Week of" : "Month"}</th>
          <th scope="col">At their own desk</th>
          <th scope="col">Guests on a borrowed desk</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.start}>
            <th scope="row">
              {format(row.start, period === "weeks" ? "d MMMM" : "MMMM yyyy")}
            </th>
            <td>{row.own}</td>
            <td>{row.guests}</td>
            <td>{row.total}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** `deskCount`: the office's desks now, what participation is out of. */
export function Metrics({
  rows,
  deskCount,
}: {
  rows: MetricRow[];
  deskCount: number;
}) {
  let s = summarise(rows, officeNow());

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
            <ThisMonth s={s} deskCount={deskCount} />
          </div>
          <div className="enter" style={enterAt(1)}>
            <BusiestDays days={s.days} now={s.now} deskCount={deskCount} />
          </div>
          <div className="enter" style={enterAt(2)}>
            <BookingsChart days={s.days} now={s.now} />
          </div>
        </>
      )}
    </div>
  );
}
