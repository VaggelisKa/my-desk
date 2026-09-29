import {
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { calculatePercentDiff } from "~/lib/utils";

// The numbers behind the Metrics tab.

export type MetricRow = {
  date: Date | string | number;
  bookings: number;
  guestBookings: number | null;
  officeParticipationPct: number | null;
};

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

/**
 * Bookings per week (the last 10 calendar weeks) or month (the last 6),
 * split into own desk and guests. Older days stay out even when the recent
 * weeks have gaps.
 */
export function bookingsBy(period: Period, days: Day[], now: Date) {
  let since =
    period === "weeks"
      ? startOfWeek(subWeeks(now, 9), { weekStartsOn: 1 })
      : startOfMonth(subMonths(now, 5));
  let groups = new Map<
    number,
    { start: number; own: number; guests: number }
  >();

  for (let d of days.filter((day) => day.date >= since)) {
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
    .map((g) => ({ ...g, total: g.own + g.guests }));
}

/**
 * Five evenly spaced round values from 0 that cover `max`, like 0, 70, 140,
 * 210, 280 for 270.
 */
export function valueTicks(max: number) {
  if (max <= 0) {
    return [0, 1, 2, 3, 4];
  }

  // A step of 1, 2, 2.5, 5 and so on times a power of ten, at least a quarter
  // of the way to `max`, grown until four steps reach it. Counted in whole
  // units so no rounding error creeps in.
  let quarter = max / 4;
  let digits = quarter < 1 ? 0 : String(Math.floor(quarter)).length;
  let stepOf = (units: number) =>
    digits === 1 ? units : Math.ceil((units * 10 ** digits) / 20);
  let units = Math.ceil(digits === 1 ? quarter : (quarter * 20) / 10 ** digits);
  let step = stepOf(units);

  while (step * 4 < max) {
    step = stepOf(++units);
  }

  return [0, step, step * 2, step * 3, step * 4];
}
