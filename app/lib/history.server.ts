import { and, eq, inArray, max, or } from "drizzle-orm";
import { db } from "~/lib/db/drizzle.server";
import { bookingHistory, reservations } from "~/lib/db/schema";

/** What a booking delete returns, for `markRemovedByAdmin`. */
export let removedBooking = {
  userId: reservations.userId,
  deskId: reservations.deskId,
  date: reservations.date,
};

export type RemovedBooking = {
  userId: string;
  deskId: number | null;
  date: string | null;
};

/** Bookings per update statement, to keep each one's SQL variables small. */
const CHUNK = 100;

/**
 * Marks bookings an Admin removed (moving or clearing a desk, cancelling
 * someone else's) in the history the trigger just wrote, so they don't count
 * as the person cancelling. The latest row per booking is the one just
 * written.
 */
export async function markRemovedByAdmin(
  removed: RemovedBooking[],
  tx: Pick<typeof db, "update" | "select"> = db,
) {
  let keys = removed.flatMap((booking) =>
    booking.deskId !== null && booking.date !== null
      ? [
          and(
            eq(bookingHistory.userId, booking.userId),
            eq(bookingHistory.deskId, booking.deskId),
            eq(bookingHistory.date, booking.date),
          ),
        ]
      : [],
  );

  await Promise.all(
    Array.from({ length: Math.ceil(keys.length / CHUNK) }, (_, i) =>
      tx
        .update(bookingHistory)
        .set({ removedByAdmin: true })
        .where(
          inArray(
            bookingHistory.id,
            tx
              .select({ id: max(bookingHistory.id) })
              .from(bookingHistory)
              .where(or(...keys.slice(i * CHUNK, (i + 1) * CHUNK)))
              .groupBy(
                bookingHistory.userId,
                bookingHistory.deskId,
                bookingHistory.date,
              ),
          ),
        ),
    ),
  );
}
