import {
  addDays,
  format,
  isValid,
  isWeekend,
  nextMonday,
  parse,
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
