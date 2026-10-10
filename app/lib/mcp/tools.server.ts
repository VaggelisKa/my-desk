import { McpServer } from "@modelcontextprotocol/server";
import { format, isValid, isWeekend, parse } from "date-fns";
import { and, asc, count, eq, gt, or } from "drizzle-orm";
import { z } from "zod";
import {
  bookDays,
  listUpcomingBookings,
  MAX_DESKS_PER_DAY,
} from "~/lib/bookings.server";
import {
  defaultDay,
  formatDate,
  isOpenForBooking,
  LAST_BOOKING_HOUR,
  officeNow,
  parseDate,
} from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, mcpAuditLog, reservations, users } from "~/lib/db/schema";
import { capitalize, deskLabel } from "~/lib/utils";

// The MCP server's tools: what Claude or ChatGPT can do for the person who
// connected it. Each request builds a server for that one person (from their
// token), so no tool takes a user ID: the caller is always the token's.
// Bookings go through the same functions the web app uses, rules included.

/** Changes one person may make through assistants in an hour. */
export const WRITES_PER_HOUR = 30;

/** An audit entry whose change is still running. */
const PENDING = "Running";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const SERVER_INSTRUCTIONS = [
  "MyDesk books desks in a shared office (Europe/Copenhagen time).",
  "Dates are YYYY-MM-DD. Call get_me first to learn today's date, your own desk and the booking rules.",
  "book_desk books your own desk unless you pass desk_id; use list_desks to see who is in and what is free on a day.",
].join(" ");

let isoDate = z
  .string()
  .regex(ISO_DATE, "Use YYYY-MM-DD")
  .describe("A date as YYYY-MM-DD");

/** "2026-10-14" as the app's Date, or null when it is not a real date. */
function fromIso(value: string) {
  let date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) && format(date, "yyyy-MM-dd") === value ? date : null;
}

function day(date: Date) {
  return { date: format(date, "yyyy-MM-dd"), weekday: format(date, "EEEE") };
}

function fullName(person: { firstName: string; lastName: string }) {
  return `${capitalize(person.firstName)} ${capitalize(person.lastName)}`;
}

/** A tool answer: the data for the model, and the same as text for clients that only read text. */
function answer<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/** A tool error, as one sentence the model can pass on. */
function refuse(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

async function findCaller(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, firstName: true, lastName: true, role: true },
    with: {
      desk: { columns: { id: true, block: true, row: true, column: true } },
    },
  });
}

let gone = refuse(
  "Your MyDesk account no longer exists. Ask an admin, then connect again.",
);

/**
 * Runs a change for `userId`, within the hourly limit, and records it in the
 * audit log, which the limit counts.
 */
async function change(
  caller: { userId: string; clientId: string },
  tool: string,
  input: unknown,
  run: () => Promise<{
    ok: boolean;
    message: string;
    result: ReturnType<typeof answer> | ReturnType<typeof refuse>;
  }>,
) {
  // Logged before it runs, so calls made at the same moment all count, and
  // an attempt that fails still leaves a trace. Refusals and errors don't
  // use up the allowance; changes and calls still running do.
  let [entry] = await db
    .insert(mcpAuditLog)
    .values({
      userId: caller.userId,
      clientId: caller.clientId,
      tool,
      input: JSON.stringify(input),
      ok: false,
      message: PENDING,
      createdAt: Date.now(),
    })
    .returning({ id: mcpAuditLog.id });
  let finish = (ok: boolean, message: string) =>
    db
      .update(mcpAuditLog)
      .set({ ok, message })
      .where(eq(mcpAuditLog.id, entry.id));

  let [{ recent }] = await db
    .select({ recent: count() })
    .from(mcpAuditLog)
    .where(
      and(
        eq(mcpAuditLog.userId, caller.userId),
        gt(mcpAuditLog.createdAt, Date.now() - 60 * 60 * 1000),
        or(eq(mcpAuditLog.ok, true), eq(mcpAuditLog.message, PENDING)),
      ),
    );

  if (recent > WRITES_PER_HOUR) {
    await finish(false, "Over the hourly limit");
    return refuse(
      "Too many changes in a short time. Try again in a while, or use the MyDesk app.",
    );
  }

  try {
    let { ok, message, result } = await run();
    await finish(ok, message);
    return result;
  } catch (error) {
    // The details go to the logs, not to the assistant.
    console.error(error);
    await finish(false, "Failed").catch(console.error);
    return refuse(
      "Something went wrong. Nothing may have changed; check with list_my_bookings.",
    );
  }
}

let deskShape = z.object({
  desk_id: z.number().int(),
  label: z.string().describe("block.row.column, as the app shows it"),
});

let dayShape = {
  date: z.string().describe("YYYY-MM-DD"),
  weekday: z.string(),
};

/** The MCP server for one signed-in person, connected through `clientId`. */
export function createDeskServer(caller: { userId: string; clientId: string }) {
  let server = new McpServer(
    { name: "mydesk", title: "MyDesk", version: "1.0.0" },
    { instructions: SERVER_INSTRUCTIONS },
  );

  server.registerTool(
    "get_me",
    {
      title: "Who am I",
      description:
        "Your name, role and own desk, the office's date and time now, and the booking rules. Call it first: other tools take dates as YYYY-MM-DD and you need today's.",
      outputSchema: z.object({
        user_id: z.string(),
        name: z.string(),
        role: z.enum(["user", "admin"]),
        desk: deskShape.nullable(),
        today: z.object({ ...dayShape, time: z.string() }),
        timezone: z.string(),
        rules: z.array(z.string()),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      let user = await findCaller(caller.userId);
      if (!user) return gone;

      let now = officeNow();

      return answer({
        user_id: user.id,
        name: fullName(user),
        role: user.role === "admin" ? ("admin" as const) : ("user" as const),
        desk: user.desk && {
          desk_id: user.desk.id,
          label: deskLabel(user.desk),
        },
        today: { ...day(now), time: format(now, "HH:mm") },
        timezone: "Europe/Copenhagen",
        rules: [
          "Only weekdays can be booked.",
          `Your own desk: any weekday of the current and the next work week (from Saturday on, the coming two). Today only until ${LAST_BOOKING_HOUR}:00.`,
          "Someone else's desk, or a desk nobody owns: today only.",
          `At most ${MAX_DESKS_PER_DAY} desks per person on the same day (your own plus one, for example for a guest).`,
          "You can only cancel your own bookings.",
        ],
      });
    },
  );

  server.registerTool(
    "list_desks",
    {
      title: "Desks on a day",
      description:
        "Every desk on one day: who owns it, who booked it, and whether you can book it (you_can_book applies all the rules for you). Use it for 'who is in on Friday', 'is my desk free' or 'find me a free desk today'.",
      inputSchema: z.object({
        date: isoDate
          .optional()
          .describe(
            "The day, YYYY-MM-DD. Defaults to today, or Monday on a weekend.",
          ),
        only_free: z
          .boolean()
          .optional()
          .describe("Only desks nobody has booked that day."),
      }),
      outputSchema: z.object({
        ...dayShape,
        free_count: z.number().int(),
        desks: z.array(
          deskShape.extend({
            owner: z
              .string()
              .nullable()
              .describe("Name of the person the desk belongs to"),
            booked_by: z.array(
              z.object({ name: z.string(), is_you: z.boolean() }),
            ),
            is_yours: z.boolean(),
            you_can_book: z.boolean(),
          }),
        ),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async ({ date, only_free }) => {
      let now = officeNow();
      let picked = date ? fromIso(date) : defaultDay(now);
      if (!picked) return refuse(`${date} is not a real date.`);

      let stored = formatDate(picked);
      let [user, rows] = await Promise.all([
        findCaller(caller.userId),
        db.query.desks.findMany({
          columns: {
            id: true,
            block: true,
            row: true,
            column: true,
            userId: true,
          },
          with: {
            user: { columns: { firstName: true, lastName: true } },
            reservations: {
              columns: { userId: true },
              where: eq(reservations.date, stored),
              with: { users: { columns: { firstName: true, lastName: true } } },
            },
          },
          orderBy: [asc(desks.block), asc(desks.row), asc(desks.column)],
        }),
      ]);
      if (!user) return gone;

      let mine = rows.reduce(
        (held, desk) =>
          held + desk.reservations.filter((r) => r.userId === user.id).length,
        0,
      );
      let isToday = stored === formatDate(now);
      let all = rows.map((desk) => {
        let isYours = desk.userId === user.id;
        let free = desk.reservations.length === 0;
        let allowed = isYours
          ? isOpenForBooking(picked, now)
          : isToday && !isWeekend(picked);

        return {
          desk_id: desk.id,
          label: deskLabel(desk),
          owner: desk.user ? fullName(desk.user) : null,
          booked_by: desk.reservations.map((r) => ({
            name: r.users ? fullName(r.users) : "Someone",
            is_you: r.userId === user.id,
          })),
          is_yours: isYours,
          you_can_book: free && allowed && mine < MAX_DESKS_PER_DAY,
        };
      });

      return answer({
        ...day(picked),
        free_count: all.filter((desk) => desk.booked_by.length === 0).length,
        desks: only_free
          ? all.filter((desk) => desk.booked_by.length === 0)
          : all,
      });
    },
  );

  server.registerTool(
    "list_my_bookings",
    {
      title: "My bookings",
      description: "Your desk bookings from today on, soonest first.",
      outputSchema: z.object({
        bookings: z.array(
          deskShape.extend({
            ...dayShape,
            is_your_desk: z.boolean(),
            desk_owner: z
              .string()
              .nullable()
              .describe("First name of the desk's owner, when it is not you"),
          }),
        ),
      }),
      annotations: {
        readOnlyHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      let bookings = await listUpcomingBookings(caller.userId);

      return answer({
        bookings: bookings.map((booking) => ({
          desk_id: booking.deskId,
          label: deskLabel(booking.desk),
          ...day(parseDate(booking.date)),
          is_your_desk: booking.mine,
          desk_owner:
            booking.mine || !booking.ownerName
              ? null
              : capitalize(booking.ownerName),
        })),
      });
    },
  );

  server.registerTool(
    "book_desk",
    {
      title: "Book a desk",
      description:
        "Books a desk on one or more days, all or none. Without desk_id it books your own desk. To book another desk (today only), find its desk_id with list_desks first.",
      inputSchema: z.object({
        dates: z
          .array(isoDate)
          .min(1)
          .max(10)
          .describe("The days to book, YYYY-MM-DD"),
        desk_id: z
          .number()
          .int()
          .optional()
          .describe("The desk to book. Leave out to book your own desk."),
      }),
      outputSchema: z.object({
        booked: z.array(deskShape.extend(dayShape)),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (input) =>
      change(caller, "book_desk", input, async () => {
        let fail = (message: string) => ({
          ok: false,
          message,
          result: refuse(message),
        });
        let user = await findCaller(caller.userId);
        if (!user) return { ok: false, message: "No account", result: gone };

        let deskId = input.desk_id ?? user.desk?.id;
        if (deskId === undefined) {
          return fail(
            "You have no desk of your own. Pick one with list_desks and pass its desk_id.",
          );
        }

        let dates = input.dates.map(fromIso);
        let bad = input.dates.filter((_, i) => !dates[i]);
        if (bad.length) return fail(`Not real dates: ${bad.join(", ")}.`);

        let result = await bookDays(
          user.id,
          deskId,
          dates.map((date) => formatDate(date!)),
        );
        if (!result.ok) {
          return fail(
            [result.message.replace(/!$/, "."), result.description]
              .filter(Boolean)
              .join(" "),
          );
        }

        let desk = await db.query.desks.findFirst({
          where: eq(desks.id, deskId),
          columns: { block: true, row: true, column: true },
        });
        let label = desk ? deskLabel(desk) : String(deskId);
        let booked = result.days.map((date) => ({
          desk_id: deskId,
          label,
          ...day(date),
        }));

        return {
          ok: true,
          message: `Booked desk ${label} on ${booked.map((b) => b.date).join(", ")}`,
          result: answer({ booked }),
        };
      }),
  );

  server.registerTool(
    "cancel_bookings",
    {
      title: "Cancel bookings",
      description:
        "Cancels one or more of your own bookings. Get them from list_my_bookings. Bookings that are not yours are never touched and come back in not_found.",
      inputSchema: z.object({
        bookings: z
          .array(z.object({ desk_id: z.number().int(), date: isoDate }))
          .min(1)
          .max(20),
      }),
      outputSchema: z.object({
        removed: z.array(z.object({ desk_id: z.number().int(), ...dayShape })),
        not_found: z.array(
          z.object({ desk_id: z.number().int(), date: z.string() }),
        ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) =>
      change(caller, "cancel_bookings", input, async () => {
        let picked = input.bookings.flatMap(({ desk_id, date }) => {
          let parsed = fromIso(date);
          return parsed ? [{ deskId: desk_id, date: formatDate(parsed) }] : [];
        });

        // Only the caller's own: the person is part of every match.
        let deleted = picked.length
          ? await db
              .delete(reservations)
              .where(
                and(
                  eq(reservations.userId, caller.userId),
                  or(
                    ...picked.map((booking) =>
                      and(
                        eq(reservations.deskId, booking.deskId),
                        eq(reservations.date, booking.date),
                      ),
                    ),
                  ),
                ),
              )
              .returning({
                deskId: reservations.deskId,
                date: reservations.date,
              })
          : [];

        let removedKeys = new Set(
          deleted.map((row) => `${row.deskId}@${row.date}`),
        );
        let removed = deleted.flatMap((row) =>
          row.deskId !== null && row.date
            ? [{ desk_id: row.deskId, ...day(parseDate(row.date)) }]
            : [],
        );
        let notFound = input.bookings.filter(({ desk_id, date }) => {
          let parsed = fromIso(date);
          return (
            !parsed || !removedKeys.has(`${desk_id}@${formatDate(parsed)}`)
          );
        });

        return {
          ok: true,
          message: `Removed ${removed.length}, not found ${notFound.length}`,
          result: answer({ removed, not_found: notFound }),
        };
      }),
  );

  return server;
}
