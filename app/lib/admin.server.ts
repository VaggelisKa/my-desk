import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  ne,
} from "drizzle-orm";
import { dataWithError, dataWithSuccess, redirectWithError } from "remix-toast";
import { requireAuthCookie } from "~/cookies.server";
import { anyOf, pickedBookings } from "~/lib/bookings.server";
import { CronError, deleteCron } from "~/lib/cron";
import { todayStart } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations, users } from "~/lib/db/schema";
import { capitalize, deskLabel, plural } from "~/lib/utils";

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

/**
 * Stops someone's weekly booking, if they have one. The job stays saved on
 * them until cron-job.org confirms it is gone, so a stop that did not happen
 * is never reported as done and can be tried again. Returns false then.
 */
async function stopRecurring(userId: string) {
  let user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { autoReservationsCronId: true },
  });
  let cronId = user?.autoReservationsCronId;

  if (!cronId) {
    return true;
  }

  try {
    await deleteCron({ cronId });
  } catch (error) {
    if (!(error instanceof CronError)) throw error;
    console.error(error);
    return false;
  }

  await db
    .update(users)
    .set({ autoReservationsCronId: null })
    .where(and(eq(users.id, userId), eq(users.autoReservationsCronId, cronId)));

  return true;
}

/**
 * Takes desks away from their owner: they lose them, and so do the days they
 * booked on them after today. Today stays, since they may already be sitting
 * there. Only while the desks are still theirs, in case someone else moved
 * them meanwhile. Pass the transaction when it is part of a move.
 */
async function releaseDesks(
  deskIds: number[],
  ownerId: string,
  tx: Pick<typeof db, "update" | "delete"> = db,
) {
  await tx
    .update(desks)
    .set({ userId: null })
    .where(and(inArray(desks.id, deskIds), eq(desks.userId, ownerId)));
  await tx
    .delete(reservations)
    .where(
      and(
        inArray(reservations.deskId, deskIds),
        eq(reservations.userId, ownerId),
        gt(reservations.dateTimestamp, todayStart()),
      ),
    );
}

/** Thrown inside a move's transaction to undo it when the desk changed meanwhile. */
class DeskChanged extends Error {}

/** Said when a desk moved but the scheduler could not be reached to stop a weekly job. */
let stopLater =
  "The scheduler could not be reached, so the weekly booking stops on its next run instead.";

/** What a successful action returns, so a sheet knows it may close. */
let done = { ok: true } as const;

export type AdminActionData = typeof done | null;

function field(formData: FormData, name: string) {
  let value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

let deskName = (desk: { block: number; row: number; column: number }) =>
  `desk ${deskLabel(desk)}`;

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
        return dataWithSuccess(done, {
          message: `${capitalize(newOwner.firstName)} already has this desk`,
        });
      }

      // The new owner gives up any desk they had, so nobody ends up with two.
      // One transaction, so if someone else took the desk meanwhile the whole
      // move is undone and nobody loses a desk or a booking.
      let previousDesks = await db.query.desks.findMany({
        where: and(eq(desks.userId, newOwner.id), ne(desks.id, deskId)),
        columns: { id: true },
      });
      let previousIds = previousDesks.map((previous) => previous.id);

      try {
        await db.transaction(async (tx) => {
          if (desk.userId) await releaseDesks([deskId], desk.userId, tx);
          let claimed = await tx
            .update(desks)
            .set({ userId: newOwner.id })
            .where(and(eq(desks.id, deskId), isNull(desks.userId)))
            .returning({ id: desks.id });

          if (claimed.length === 0) throw new DeskChanged();
          if (previousIds.length) {
            await releaseDesks(previousIds, newOwner.id, tx);
          }
        });
      } catch (error) {
        if (!(error instanceof DeskChanged)) throw error;

        return dataWithError(
          null,
          {
            message: "The desk changed meanwhile",
            description: "Nothing was moved. Look again and try once more.",
          },
          { status: 409 },
        );
      }

      // Their weekly jobs were for the desks they no longer have.
      let stopped = await Promise.all([
        previousIds.length ? stopRecurring(newOwner.id) : true,
        desk.userId ? stopRecurring(desk.userId) : true,
      ]);
      let message = `Moved ${deskName(desk)} to ${capitalize(newOwner.firstName)}`;

      return stopped.every(Boolean)
        ? dataWithSuccess(done, { message })
        : dataWithError(done, { message, description: stopLater });
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
      let message = `${capitalize(deskName(desk))} is unclaimed now`;

      let ownerId = desk.userId;

      if (!ownerId) {
        return dataWithSuccess(done, { message });
      }

      await db.transaction((tx) => releaseDesks([deskId], ownerId, tx));

      return (await stopRecurring(ownerId))
        ? dataWithSuccess(done, { message })
        : dataWithError(done, { message, description: stopLater });
    }

    case "cancel": {
      let deskId = Number(field(formData, "deskId"));
      let date = field(formData, "date");
      // The person too: the row may be old, and the day taken by someone else
      // since. Their booking is not the one the admin asked to cancel.
      let userId = field(formData, "userId");
      let deleted = await db
        .delete(reservations)
        .where(
          and(
            eq(reservations.deskId, deskId),
            eq(reservations.date, date),
            eq(reservations.userId, userId),
          ),
        )
        .returning({ deskId: reservations.deskId });

      if (!deleted.length) {
        return dataWithError(
          null,
          { message: "Booking not found" },
          { status: 404 },
        );
      }

      return dataWithSuccess(done, { message: "Booking cancelled" });
    }

    case "cancel-many": {
      let picked = pickedBookings(formData);

      if (!picked) {
        return dataWithError(
          null,
          { message: "No bookings picked" },
          { status: 400 },
        );
      }

      let deleted = await db
        .delete(reservations)
        .where(anyOf(picked))
        .returning({ deskId: reservations.deskId });

      if (!deleted.length) {
        return dataWithError(
          null,
          { message: "Bookings not found" },
          { status: 404 },
        );
      }

      return dataWithSuccess(done, {
        message: `Removed ${plural(deleted.length, "booking")}`,
      });
    }

    case "clear-desk":
    case "clear-person": {
      let where =
        intent === "clear-desk"
          ? eq(reservations.deskId, Number(field(formData, "deskId")))
          : eq(reservations.userId, field(formData, "userId"));

      let deleted = await db
        .delete(reservations)
        .where(and(where, gte(reservations.dateTimestamp, todayStart())))
        .returning({ deskId: reservations.deskId });

      return dataWithSuccess(done, {
        message: `Cleared ${plural(deleted.length, "booking")}`,
      });
    }

    case "stop-recurring": {
      let userId = field(formData, "userId");

      if (!(await stopRecurring(userId))) {
        return dataWithError(
          null,
          {
            message: "Could not reach the scheduler",
            description:
              "The weekly booking is still on. Try again in a moment.",
          },
          { status: 502 },
        );
      }

      return dataWithSuccess(done, { message: "Recurring booking stopped" });
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

      return dataWithSuccess(done, {
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
      return dataWithSuccess(done, {
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
