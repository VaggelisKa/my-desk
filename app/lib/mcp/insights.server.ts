import type { McpServer } from "@modelcontextprotocol/server";
import { addDays, differenceInCalendarDays, format, subDays } from "date-fns";
import { and, count, gte, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { formatDate, officeNow, parseDate, todayStart } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import {
  bookingHistory,
  bookingMetrics,
  desks,
  reservations,
} from "~/lib/db/schema";
import {
  answer,
  day,
  dayShape,
  findCaller,
  fromIso,
  fullName,
  gone,
  isoDate,
  refuse,
} from "~/lib/mcp/shared.server";
import { deskLabel } from "~/lib/utils";

// Read-only tools for questions about how the office is used: the Metrics
// tab's daily numbers, and each booking's outcome from booking_history.
// Everyone sees the office numbers and their own history; other people's
// history needs the admin scope, as other people's bookings do.

/** The longest range one call covers, in days. */
const MAX_RANGE = 366;

const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
] as const;

/** A range from optional YYYY-MM-DD bounds, or why it can't be one. */
function readRange(
  from: string | undefined,
  to: string | undefined,
  defaults: { from: Date; to: Date },
) {
  let start = from ? fromIso(from) : defaults.from;
  let end = to ? fromIso(to) : defaults.to;

  if (!start)
    return { ok: false, error: `${from} is not a real date.` } as const;
  if (!end) return { ok: false, error: `${to} is not a real date.` } as const;
  if (start > end) return { ok: false, error: "from is after to." } as const;
  if (differenceInCalendarDays(end, start) >= MAX_RANGE) {
    return {
      ok: false,
      error: `Ask for at most ${MAX_RANGE} days at a time.`,
    } as const;
  }
  return { ok: true, start, end } as const;
}

/**
 * What became of a booking: kept when its row went after its day ended (the
 * nightly cleanup), removed by an Admin when one moved or cleared the desk or
 * cancelled it, otherwise cancelled, before or on the day.
 */
export function outcomeOf(row: {
  dateTimestamp: number;
  endedAt: number;
  removedByAdmin: boolean;
}) {
  let ended = officeNow(new Date(row.endedAt));
  let dayStart = new Date(row.dateTimestamp);

  if (ended >= addDays(dayStart, 1)) return { kind: "kept" } as const;
  if (row.removedByAdmin) return { kind: "removed_by_admin" } as const;
  return {
    kind: "cancelled",
    days_before: Math.max(0, differenceInCalendarDays(dayStart, ended)),
  } as const;
}

function weekdayCounts() {
  return Object.fromEntries(WEEKDAY_NAMES.map((name) => [name, 0])) as Record<
    (typeof WEEKDAY_NAMES)[number],
    number
  >;
}

let weekdayShape = z.object(
  Object.fromEntries(WEEKDAY_NAMES.map((name) => [name, z.number().int()])) as {
    [K in (typeof WEEKDAY_NAMES)[number]]: z.ZodNumber;
  },
);

export function registerInsightTools(
  server: McpServer,
  caller: { userId: string; admin: boolean },
) {
  server.registerTool(
    "get_office_stats",
    {
      title: "Office numbers over time",
      description:
        "The office's daily numbers, as the Metrics tab shows them: bookings, guest bookings (on someone else's desk or one nobody owns) and occupancy, one row per workday, plus averages per weekday. Use it for 'how busy is the office', 'which day is quietest' or trends.",
      inputSchema: z.object({
        from: isoDate
          .optional()
          .describe("First day. Defaults to 8 weeks ago."),
        to: isoDate.optional().describe("Last day. Defaults to today."),
      }),
      outputSchema: z.object({
        from: z.string(),
        to: z.string(),
        desk_count: z.number().int(),
        days: z.array(
          z.object({
            ...dayShape,
            bookings: z.number().int(),
            guest_bookings: z.number().int(),
            occupancy_pct: z.number().int(),
          }),
        ),
        by_weekday: z.array(
          z.object({
            weekday: z.string(),
            days: z.number().int(),
            average_bookings: z.number(),
            average_occupancy_pct: z.number(),
          }),
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ from, to }) => {
      let today = parseDate(formatDate(officeNow()));
      let range = readRange(from, to, { from: subDays(today, 56), to: today });
      if (!range.ok) return refuse(range.error);

      // A row per workday; few enough to filter here, and metric_date is
      // stored as dd.MM.yyyy, which doesn't sort.
      let [rows, deskCount] = await Promise.all([
        db
          .select({
            date: bookingMetrics.metricDate,
            bookings: bookingMetrics.totalBookings,
            guests: bookingMetrics.totalGuestBookings,
            occupancy: bookingMetrics.participation_percentage,
          })
          .from(bookingMetrics),
        db.$count(desks),
      ]);

      let days = rows
        .map((row) => ({ ...row, parsed: parseDate(row.date) }))
        .filter(
          ({ parsed }) =>
            !Number.isNaN(parsed.getTime()) &&
            parsed >= range.start &&
            parsed <= range.end,
        )
        .sort((a, b) => a.parsed.getTime() - b.parsed.getTime())
        .map((row) => ({
          ...day(row.parsed),
          bookings: row.bookings,
          guest_bookings: row.guests ?? 0,
          occupancy_pct: row.occupancy ?? 0,
        }));

      let round = (value: number) => Math.round(value * 10) / 10;
      let byWeekday = WEEKDAY_NAMES.flatMap((weekday) => {
        let same = days.filter((row) => row.weekday === weekday);
        if (!same.length) return [];
        let sum = (pick: (row: (typeof same)[number]) => number) =>
          same.reduce((total, row) => total + pick(row), 0);
        return [
          {
            weekday,
            days: same.length,
            average_bookings: round(sum((row) => row.bookings) / same.length),
            average_occupancy_pct: round(
              sum((row) => row.occupancy_pct) / same.length,
            ),
          },
        ];
      });

      return answer({
        from: format(range.start, "yyyy-MM-dd"),
        to: format(range.end, "yyyy-MM-dd"),
        desk_count: deskCount,
        days,
        by_weekday: byWeekday,
      });
    },
  );

  server.registerTool(
    "get_booking_history",
    {
      title: "Booking history",
      description: [
        "What became of past bookings, per person: kept (the day came and the booking was still there) or cancelled (removed before or on the day), by weekday, with upcoming bookings and whether they have a weekly booking.",
        "MyDesk has no check-in, so a kept booking is the best sign someone came in. Use it to spot patterns: who cancels often or late, who books less than before, which weekdays people skip.",
        caller.admin
          ? "As an Admin you can see everyone (leave user_id out) or one person (user_id from list_desks or admin_list_people)."
          : "You can see your own history only.",
        "history_starts says from when bookings were recorded; earlier days have no history.",
      ].join(" "),
      inputSchema: z.object({
        from: isoDate
          .optional()
          .describe("First booking day. Defaults to 12 weeks ago."),
        to: isoDate
          .optional()
          .describe("Last booking day. Defaults to two weeks from today."),
        ...(caller.admin
          ? {
              user_id: z
                .string()
                .max(80)
                .optional()
                .describe("One person. Leave out for everyone."),
            }
          : {}),
      }),
      outputSchema: z.object({
        from: z.string(),
        to: z.string(),
        history_starts: z
          .string()
          .nullable()
          .describe("The first day with recorded history, YYYY-MM-DD"),
        people: z.array(
          z.object({
            user_id: z.string().optional(),
            name: z.string(),
            is_you: z.boolean(),
            has_desk: z.boolean(),
            weekly_booking: z.boolean(),
            kept: z.number().int().describe("Days with a kept booking"),
            cancelled: z
              .number()
              .int()
              .describe("Days whose bookings were all cancelled"),
            cancelled_on_the_day: z.number().int(),
            removed_by_admin: z
              .number()
              .int()
              .describe(
                "Removed by an Admin (desk moved or cleared): not counted as cancelled",
              ),
            cancel_rate: z
              .number()
              .nullable()
              .describe("cancelled / (kept + cancelled), null without any"),
            last_kept: z.string().nullable().describe("YYYY-MM-DD"),
            upcoming: z
              .number()
              .int()
              .describe("Bookings from today on, right now"),
            kept_by_weekday: weekdayShape,
            cancelled_by_weekday: weekdayShape,
          }),
        ),
        bookings: z
          .array(
            z.object({
              ...dayShape,
              desk: z.string().nullable(),
              outcome: z.enum(["kept", "cancelled", "removed_by_admin"]),
              cancelled_days_before: z
                .number()
                .int()
                .optional()
                .describe("0 means on the day itself"),
              booked_days_before: z.number().int().nullable(),
            }),
          )
          .optional()
          .describe("Each booking, for one person only"),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async (input) => {
      let user = await findCaller(caller.userId);
      if (!user) return gone;

      // Other people's history is for an Admin with the admin scope only.
      let isAdmin = caller.admin && user.role === "admin";
      let asked =
        "user_id" in input && typeof input.user_id === "string"
          ? input.user_id.trim().toLowerCase()
          : undefined;
      if (asked !== undefined && !isAdmin && asked !== user.id) {
        return refuse(
          "Only Admins can see other people's history, and you are not an Admin any more.",
        );
      }
      let only = isAdmin ? asked : user.id;

      let today = parseDate(formatDate(officeNow()));
      let range = readRange(input.from, input.to, {
        from: subDays(today, 84),
        to: addDays(today, 14),
      });
      if (!range.ok) return refuse(range.error);

      let [people, fetched, upcoming, [first]] = await Promise.all([
        db.query.users.findMany({
          where: only ? (u, { eq }) => eq(u.id, only) : undefined,
          columns: {
            id: true,
            firstName: true,
            lastName: true,
            autoReservationsCronId: true,
          },
          with: { desk: { columns: { id: true } } },
        }),
        db.query.bookingHistory.findMany({
          where: (h, { eq }) =>
            and(
              gte(h.dateTimestamp, range.start.getTime()),
              lte(h.dateTimestamp, range.end.getTime()),
              only ? eq(h.userId, only) : undefined,
            ),
          orderBy: (h, { asc }) => [asc(h.dateTimestamp)],
        }),
        db
          .select({ userId: reservations.userId, count: count() })
          .from(reservations)
          .where(
            and(
              isNotNull(reservations.dateTimestamp),
              gte(reservations.dateTimestamp, todayStart()),
            ),
          )
          .groupBy(reservations.userId),
        db
          .select({ first: bookingHistory.dateTimestamp })
          .from(bookingHistory)
          .orderBy(bookingHistory.dateTimestamp)
          .limit(1),
      ]);

      if (only && !people.length)
        return refuse(`Nobody has the user ID ${only}.`);

      // Weekends can't be booked; a stray row would fit no weekday.
      let rows = fetched.filter((row) =>
        WEEKDAY_NAMES.includes(
          format(
            new Date(row.dateTimestamp),
            "EEEE",
          ) as (typeof WEEKDAY_NAMES)[number],
        ),
      );

      let deskRows = rows.some((row) => row.deskId !== null)
        ? await db.query.desks.findMany({
            columns: { id: true, block: true, row: true, column: true },
          })
        : [];
      let labels = new Map(deskRows.map((desk) => [desk.id, deskLabel(desk)]));
      let upcomingBy = new Map(upcoming.map((row) => [row.userId, row.count]));

      let summaries = people
        .map((person) => {
          let mine = rows.filter((row) => row.userId === person.id);
          let kept = weekdayCounts();
          let cancelled = weekdayCounts();
          let onTheDay = 0;
          let byAdmin = 0;
          let lastKept: Date | null = null;

          // A day counts once, even with two desks booked (one for a
          // guest): kept if any booking was, then cancelled, then removed.
          let rank = { kept: 0, cancelled: 1, removed_by_admin: 2 };
          let byDay = new Map<number, ReturnType<typeof outcomeOf>>();
          for (let row of mine) {
            let outcome = outcomeOf(row);
            let seen = byDay.get(row.dateTimestamp);
            if (!seen || rank[outcome.kind] < rank[seen.kind]) {
              byDay.set(row.dateTimestamp, outcome);
            }
          }

          for (let [timestamp, outcome] of byDay) {
            let date = new Date(timestamp);
            let weekday = format(date, "EEEE") as keyof typeof kept;
            if (outcome.kind === "kept") {
              kept[weekday]++;
              if (!lastKept || date > lastKept) lastKept = date;
            } else if (outcome.kind === "cancelled") {
              cancelled[weekday]++;
              if (outcome.days_before === 0) onTheDay++;
            } else {
              byAdmin++;
            }
          }

          let keptTotal = Object.values(kept).reduce((a, b) => a + b, 0);
          let cancelledTotal = Object.values(cancelled).reduce(
            (a, b) => a + b,
            0,
          );
          let total = keptTotal + cancelledTotal;

          return {
            ...(isAdmin ? { user_id: person.id } : {}),
            name: fullName(person),
            is_you: person.id === user.id,
            has_desk: person.desk !== null,
            weekly_booking: person.autoReservationsCronId !== null,
            kept: keptTotal,
            cancelled: cancelledTotal,
            cancelled_on_the_day: onTheDay,
            removed_by_admin: byAdmin,
            cancel_rate: total
              ? Math.round((cancelledTotal / total) * 100) / 100
              : null,
            last_kept: lastKept ? format(lastKept, "yyyy-MM-dd") : null,
            upcoming: upcomingBy.get(person.id) ?? 0,
            kept_by_weekday: kept,
            cancelled_by_weekday: cancelled,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return answer({
        from: format(range.start, "yyyy-MM-dd"),
        to: format(range.end, "yyyy-MM-dd"),
        history_starts: first
          ? format(new Date(first.first), "yyyy-MM-dd")
          : null,
        people: summaries,
        ...(only
          ? {
              bookings: rows.map((row) => {
                let date = new Date(row.dateTimestamp);
                let outcome = outcomeOf(row);
                return {
                  ...day(date),
                  desk:
                    row.deskId === null
                      ? null
                      : (labels.get(row.deskId) ?? null),
                  outcome: outcome.kind,
                  ...(outcome.kind === "cancelled"
                    ? { cancelled_days_before: outcome.days_before }
                    : {}),
                  booked_days_before:
                    row.bookedAt === null
                      ? null
                      : Math.max(
                          0,
                          differenceInCalendarDays(
                            date,
                            officeNow(new Date(row.bookedAt)),
                          ),
                        ),
                };
              }),
            }
          : {}),
      });
    },
  );
}
