import { clsx, type ClassValue } from "clsx";
import type { CSSProperties } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** A desk's number, e.g. "7.2.3" (block, row, column). */
export function deskLabel(desk: {
  block: number;
  row: number;
  column: number;
}) {
  return `${desk.block}.${desk.row}.${desk.column}`;
}

let placement: Record<number, string> = {
  1: "by the window",
  2: "in the middle",
  3: "by the aisle",
};

/** "by the window", from the desk's column. */
export function deskPlacement(column: number) {
  return placement[column];
}

// One word each, for where a row has little room.
let shortPlacement: Record<number, string> = {
  1: "window",
  2: "middle",
  3: "aisle",
};

export function deskPlace(
  desk: { block: number; column: number },
  { short = false } = {},
) {
  let where = (short ? shortPlacement : placement)[desk.column];
  return `Block ${desk.block} · ${where ?? `column ${desk.column}`}`;
}

/**
 * One booking as a single form value, "deskId@date@userId", for forms that
 * send several at once.
 */
export function bookingKey(booking: {
  deskId: number;
  date: string;
  userId: string;
}) {
  return `${booking.deskId}@${booking.date}@${booking.userId}`;
}

/** "1 booking", "3 bookings". */
export function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

export function capitalize(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
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
