import { startOfDay } from "date-fns";
import { and, asc, eq, gt, gte, isNotNull, ne } from "drizzle-orm";
import { dataWithError, dataWithSuccess, redirectWithError } from "remix-toast";
import { requireAuthCookie } from "~/cookies.server";
import { deleteCron } from "~/lib/cron";
import { normalizeDay, officeNow } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations, users } from "~/lib/db/schema";

// The Admin tab: who owns which desk, who is who, and what is booked. Every
// loader and action here checks the role itself; hiding the tab is not enough.

export async function requireAdmin(request: Request) {
  let session = await requireAuthCookie(request);

  if (session.role !== "admin") {
    throw await redirectWithError("/", {
      message: "Unauthorized!",
      description: "You cannot access admin routes as a normal user.",
    });
  }

  return session;
}

/** Midnight of the office's today, in the same form `dateTimestamp` is stored. */
function todayStart() {
  return startOfDay(officeNow()).getTime();
}

export type AdminDesk = {
  id: number;
  block: number;
  row: number;
  column: number;
  owner: { id: string; firstName: string; lastName: string } | null;
};

export type AdminPerson = {
  id: string;
  firstName: string;
  lastName: string;
  role: "user" | "admin";
  deskId: number | null;
  hasRecurring: boolean;
};

export type AdminBooking = {
  deskId: number;
  userId: string;
  date: string;
  dateTimestamp: number;
};

/** Everything the three lists need, from today on. The office is small. */
export async function loadAdminData() {
  let [deskRows, userRows, bookingRows] = await Promise.all([
    db.query.desks.findMany({
      columns: { id: true, block: true, row: true, column: true },
      with: {
        user: { columns: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [asc(desks.block), asc(desks.row), asc(desks.column)],
    }),
    db.query.users.findMany({
      columns: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        autoReservationsCronId: true,
      },
      orderBy: [asc(users.firstName), asc(users.lastName)],
    }),
    db
      .select({
        deskId: reservations.deskId,
        userId: reservations.userId,
        date: reservations.date,
        dateTimestamp: reservations.dateTimestamp,
      })
      .from(reservations)
      .where(
        and(
          gte(reservations.dateTimestamp, todayStart()),
          isNotNull(reservations.deskId),
          isNotNull(reservations.date),
        ),
      )
      .orderBy(asc(reservations.dateTimestamp)),
  ]);

  let deskOf = new Map<string, number>();
  for (let desk of deskRows) {
    // A person should have one desk. Older data may have given someone two;
    // the first one wins here and reassigning either desk sorts it out.
    if (desk.user && !deskOf.has(desk.user.id)) {
      deskOf.set(desk.user.id, desk.id);
    }
  }

  let adminDesks: AdminDesk[] = deskRows.map((desk) => ({
    id: desk.id,
    block: desk.block,
    row: desk.row,
    column: desk.column,
    owner: desk.user,
  }));

  let people: AdminPerson[] = userRows.map((user) => ({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role === "admin" ? "admin" : "user",
    deskId: deskOf.get(user.id) ?? null,
    hasRecurring: !!user.autoReservationsCronId,
  }));

  let bookings: AdminBooking[] = bookingRows.flatMap((row) =>
    row.deskId !== null && row.date && row.dateTimestamp !== null
      ? [
          {
            deskId: row.deskId,
            userId: row.userId,
            date: row.date,
            dateTimestamp: row.dateTimestamp,
          },
        ]
      : [],
  );

  return { desks: adminDesks, people, bookings };
}

/** Stops someone's weekly booking, if they have one. */
async function stopRecurring(userId: string) {
  let user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { autoReservationsCronId: true },
  });
  let cronId = user?.autoReservationsCronId;

  if (!cronId) {
    return;
  }

  // Clear our side even if cron-job.org is down: the job checks the desk on
  // every run and removes itself once the desk is no longer theirs.
  await db
    .update(users)
    .set({ autoReservationsCronId: null })
    .where(and(eq(users.id, userId), eq(users.autoReservationsCronId, cronId)));
  await deleteCron({ cronId }).catch(console.error);
}

/**
 * Takes a desk away from its owner: it loses them, and so do the days they
 * booked on it after today. Today stays, since they may already be sitting
 * there. Their weekly booking stops, because it was for this desk.
 */
async function releaseDesk(deskId: number, ownerId: string) {
  await db.batch([
    db.update(desks).set({ userId: null }).where(eq(desks.id, deskId)),
    db
      .delete(reservations)
      .where(
        and(
          eq(reservations.deskId, deskId),
          eq(reservations.userId, ownerId),
          gt(reservations.dateTimestamp, todayStart()),
        ),
      ),
  ]);
  await stopRecurring(ownerId);
}

function field(formData: FormData, name: string) {
  let value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function capitalize(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
}

let deskName = (desk: { block: number; row: number; column: number }) =>
  `desk ${desk.block}.${desk.row}.${desk.column}`;

export async function handleAdminAction(request: Request) {
  let { userId: adminId } = await requireAdmin(request);
  let formData = await request.formData();
  let intent = field(formData, "intent");

  switch (intent) {
    case "reassign": {
      let deskId = Number(field(formData, "deskId"));
      let newOwnerId = field(formData, "userId").toLowerCase();
      let [desk, newOwner] = await Promise.all([
        db.query.desks.findFirst({ where: eq(desks.id, deskId) }),
        db.query.users.findFirst({ where: eq(users.id, newOwnerId) }),
      ]);

      if (!desk || !newOwner) {
        return dataWithError(
          null,
          { message: desk ? "Person not found" : "Desk not found" },
          { status: 404 },
        );
      }
      if (desk.userId === newOwner.id) {
        return dataWithSuccess(null, {
          message: `${capitalize(newOwner.firstName)} already has this desk`,
        });
      }

      // The new owner gives up any desk they had, so nobody ends up with two.
      let previousDesks = await db.query.desks.findMany({
        where: and(eq(desks.userId, newOwner.id), ne(desks.id, deskId)),
        columns: { id: true },
      });
      for (let previous of previousDesks) {
        await releaseDesk(previous.id, newOwner.id);
      }
      if (desk.userId) {
        await releaseDesk(deskId, desk.userId);
      }
      await db
        .update(desks)
        .set({ userId: newOwner.id })
        .where(eq(desks.id, deskId));

      return dataWithSuccess(null, {
        message: `Moved ${deskName(desk)} to ${capitalize(newOwner.firstName)}`,
      });
    }

    case "unassign": {
      let deskId = Number(field(formData, "deskId"));
      let desk = await db.query.desks.findFirst({
        where: eq(desks.id, deskId),
      });

      if (!desk) {
        return dataWithError(
          null,
          { message: "Desk not found" },
          { status: 404 },
        );
      }
      if (desk.userId) {
        await releaseDesk(deskId, desk.userId);
      }

      return dataWithSuccess(null, {
        message: `${capitalize(deskName(desk))} is unclaimed now`,
      });
    }

    case "cancel": {
      let deskId = Number(field(formData, "deskId"));
      let date = field(formData, "date");
      let deleted = await db
        .delete(reservations)
        .where(
          and(eq(reservations.deskId, deskId), eq(reservations.date, date)),
        )
        .returning({ deskId: reservations.deskId });

      if (!deleted.length) {
        return dataWithError(
          null,
          { message: "Booking not found" },
          { status: 404 },
        );
      }

      return dataWithSuccess(null, { message: "Booking cancelled" });
    }

    case "clear-desk":
    case "clear-person":
    case "clear-day": {
      let day = normalizeDay(field(formData, "date"));

      if (intent === "clear-day" && !day) {
        return dataWithError(null, { message: "Invalid day" }, { status: 400 });
      }

      let where =
        intent === "clear-desk"
          ? eq(reservations.deskId, Number(field(formData, "deskId")))
          : intent === "clear-person"
            ? eq(reservations.userId, field(formData, "userId"))
            : eq(reservations.date, day!);

      let deleted = await db
        .delete(reservations)
        .where(and(where, gte(reservations.dateTimestamp, todayStart())))
        .returning({ deskId: reservations.deskId });

      return dataWithSuccess(null, {
        message: `Cleared ${plural(deleted.length, "booking")}`,
      });
    }

    case "stop-recurring": {
      let userId = field(formData, "userId");
      await stopRecurring(userId);

      return dataWithSuccess(null, { message: "Recurring booking stopped" });
    }

    case "rename": {
      let userId = field(formData, "userId");
      let firstName = field(formData, "firstName");
      let lastName = field(formData, "lastName");

      if (!firstName || !lastName) {
        return dataWithError(
          null,
          { message: "First and last name are both needed" },
          { status: 400 },
        );
      }

      await db
        .update(users)
        .set({ firstName, lastName })
        .where(eq(users.id, userId));

      return dataWithSuccess(null, {
        message: `Saved ${firstName} ${lastName}`,
      });
    }

    case "set-role": {
      let userId = field(formData, "userId");
      let role: "admin" | "user" =
        field(formData, "role") === "admin" ? "admin" : "user";

      // Keeps at least one admin around: you cannot demote yourself.
      if (userId === adminId && role !== "admin") {
        return dataWithError(
          null,
          { message: "You cannot remove your own admin role" },
          { status: 400 },
        );
      }

      let updated = await db
        .update(users)
        .set({ role })
        .where(eq(users.id, userId))
        .returning({ firstName: users.firstName });

      if (!updated.length) {
        return dataWithError(
          null,
          { message: "Person not found" },
          { status: 404 },
        );
      }

      let name = capitalize(updated[0].firstName);
      return dataWithSuccess(null, {
        message:
          role === "admin"
            ? `${name} is an admin now`
            : `${name} is no longer an admin`,
      });
    }

    default:
      return dataWithError(
        null,
        { message: "Unknown action" },
        { status: 400 },
      );
  }
}
