import { lt, notInArray, or } from "drizzle-orm";
import { todayStart } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import {
  bookingHistory,
  mcpAuditLog,
  oauthCodes,
  oauthTokens,
  reservations,
  users,
} from "~/lib/db/schema";
import type { Route } from "./+types/cron.reservations-cleanup";

export async function loader({ url }: Route.LoaderArgs) {
  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Days before the office's today only: bookings are stored at midnight of
  // their day, so comparing with the time now would also take today's.
  try {
    await db
      .delete(reservations)
      .where(lt(reservations.dateTimestamp, todayStart()));
  } catch (error) {
    // The details go to the logs, not to whoever called.
    console.error(error);
    return new Response("Could not clean up past bookings", { status: 500 });
  }

  // Expired sign-in codes and assistant tokens, the MCP audit log after 90
  // days and booking history after 400. Apart from the bookings, so a problem here never holds them up.
  let now = Date.now();
  try {
    await db.batch([
      db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now)),
      db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, now)),
      db
        .delete(mcpAuditLog)
        .where(lt(mcpAuditLog.createdAt, now - 90 * 24 * 60 * 60 * 1000)),
      // Booking history for a little over a year, enough to compare years.
      db.delete(bookingHistory).where(
        or(
          lt(bookingHistory.endedAt, now - 400 * 24 * 60 * 60 * 1000),
          // People who were removed take their history with them.
          notInArray(
            bookingHistory.userId,
            db.select({ id: users.id }).from(users),
          ),
        ),
      ),
    ]);
  } catch (error) {
    console.error(error);
  }

  return new Response("Past bookings cleaned up", { status: 200 });
}
