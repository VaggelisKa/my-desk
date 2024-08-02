import { clsx, type ClassValue } from "clsx";
import { addDays, addWeeks, getYear, startOfWeek } from "date-fns";
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
