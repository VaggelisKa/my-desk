import {
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
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
