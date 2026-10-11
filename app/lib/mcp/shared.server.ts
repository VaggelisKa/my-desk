import { format, isValid, parse } from "date-fns";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import { capitalize } from "~/lib/utils";

// Helpers the MCP tool modules share.

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export let isoDate = z
  .string()
  .regex(ISO_DATE, "Use YYYY-MM-DD")
  .describe("A date as YYYY-MM-DD");

/** "2026-10-14" as the app's Date, or null when it is not a real date. */
export function fromIso(value: string) {
  let date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
}

export function day(date: Date) {
  return { date: format(date, "yyyy-MM-dd"), weekday: format(date, "EEEE") };
}

export function fullName(person: { firstName: string; lastName: string }) {
  return `${capitalize(person.firstName)} ${capitalize(person.lastName)}`;
}

/** A tool answer: the data for the model, and the same as text for clients that only read text. */
export function answer<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/** A tool error, as one sentence the model can pass on. */
export function refuse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

export async function findCaller(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, firstName: true, lastName: true, role: true },
    with: {
      desk: { columns: { id: true, block: true, row: true, column: true } },
    },
  });
}

export let gone = refuse(
  "Your MyDesk account no longer exists. Ask an admin, then connect again.",
);

export let dayShape = {
  date: z.string().describe("YYYY-MM-DD"),
  weekday: z.string(),
};
