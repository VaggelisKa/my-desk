import {
  addDays,
  format,
  isSameDay,
  isValid,
  isWeekend,
  nextMonday,
  parse,
  startOfDay,
  startOfWeek,
} from "date-fns";

/** The date format the app stores and passes around, e.g. "23.09.2026". */
export const DATE_FORMAT = "dd.MM.yyyy";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export function formatDate(date: Date) {
  return format(date, DATE_FORMAT);
}

export function parseDate(value: string, fallback = new Date()) {
  return parse(value, DATE_FORMAT, fallback);
}

/**
 * The canonical `dd.MM.yyyy` form of a `selected-day` search param, or null
 * when it is missing or not a real date. Normalising matters: date-fns also
 * accepts "1.2.2026", which would never match a stored "01.02.2026".
 */
export function normalizeDay(value: string | null | undefined) {
  if (!value) return null;

  let parsed = parseDate(value);

  return isValid(parsed) ? formatDate(parsed) : null;
}

/**
 * Monday to Friday of the week `weekOffset` weeks from the one containing
 * `from`. Weeks start on Sunday, matching date-fns' `getWeek` used elsewhere.
 */
export function workdaysOfWeek(from: Date, weekOffset: 0 | 1 = 0) {
  let sunday = startOfWeek(from);

  return WEEKDAYS.map((day, i) => ({
    day,
    date: addDays(sunday, i + 1 + weekOffset * 7),
  }));
}

/**
 * The day the desks page opens on when no day is picked: today, or on a
 * weekend the Monday ahead, since there is nothing to book on the weekend.
 */
export function defaultDay(today: Date) {
  return isWeekend(today) ? nextMonday(today) : today;
}

/** Where the office is. The weekly cron job runs on the same clock. */
export const OFFICE_TIMEZONE = "Europe/Copenhagen";

/** The owner can book a day until 11:00 on that day. */
export const LAST_BOOKING_HOUR = 11;

/**
 * The office's wall-clock time, as a Date whose local fields read as that
 * time. The server may run in UTC (Vercel's default), where "today" would
 * start an hour or two late and the 11:00 cutoff would be off by as much.
 */
export function officeNow(now = new Date()) {
  let parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: OFFICE_TIMEZONE,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, Number(value)]),
  );

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/**
 * Whether the owner can still book `date`, as the desk sheet offers it: a
 * weekday of this week or the next (from the coming week on a Saturday), not
 * in the past, and today only until {@link LAST_BOOKING_HOUR}.
 */
export function isOpenForBooking(date: Date, now: Date) {
  let today = startOfDay(now);

  if (!isValid(date) || isWeekend(date) || date < today) {
    return false;
  }

  if (isSameDay(date, today)) {
    return now.getHours() < LAST_BOOKING_HOUR;
  }

  let gridStart = now.getDay() === 6 ? addDays(today, 1) : today;
  let lastFriday = addDays(startOfWeek(gridStart), 12);

  return date <= lastFriday;
}
