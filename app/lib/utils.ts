import { clsx, type ClassValue } from "clsx";
import { addDays, addWeeks, getYear, startOfWeek } from "date-fns";
import type { CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getDateByWeekAndDay(dayName: string, weekNumber: number) {
  const startOfWeekOfYearWeek = startOfWeek(
    new Date(getYear(new Date()), 0, 1),
  ); // January 1st of the given year
  const targetDate = addWeeks(startOfWeekOfYearWeek, weekNumber - 1); // Subtracting 1 because weeks are 0-indexed

  const dayIndex = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].indexOf(dayName.toLowerCase());

  if (dayIndex === -1) {
    throw new Error("Invalid day name");
  }

  return addDays(targetDate, dayIndex);
}

/** Signed percent change from `previousValue` to `value`, or null when there is no baseline. */
export function calculatePercentDiff(value: number, previousValue: number) {
  if (previousValue === 0) {
    return null;
  }

  return ((value - previousValue) / previousValue) * 100;
}

/** Staggers an `.enter` element: the nth one starts a beat after the last. */
export function enterAt(index: number): CSSProperties {
  return { "--enter-index": index } as CSSProperties;
}
