import { lt } from "drizzle-orm";
import { todayStart } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import {
  mcpAuditLog,
  oauthCodes,
  oauthTokens,
  reservations,
} from "~/lib/db/schema";
import type { Route } from "./+types/cron.reservations-cleanup";

export async function loader({ url }: Route.LoaderArgs) {
  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Days before the office's today only: bookings are stored at midnight of
  // their day, so comparing with the time now would also take today's.
  // Also expired sign-in codes and assistant tokens, and the MCP audit log
  // after 90 days.
  let now = Date.now();
  try {
    await db.batch([
      db
        .delete(reservations)
        .where(lt(reservations.dateTimestamp, todayStart())),
      db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, now)),
      db.delete(oauthTokens).where(lt(oauthTokens.expiresAt, now)),
      db
        .delete(mcpAuditLog)
        .where(lt(mcpAuditLog.createdAt, now - 90 * 24 * 60 * 60 * 1000)),
    ]);

    return new Response("Past bookings cleaned up", { status: 200 });
  } catch (error) {
    // The details go to the logs, not to whoever called.
    console.error(error);
    return new Response("Could not clean up past bookings", { status: 500 });
  }
}
