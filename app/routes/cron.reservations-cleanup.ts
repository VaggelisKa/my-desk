import { startOfDay } from "date-fns";
import { lt } from "drizzle-orm";
import { officeNow } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema";
import type { Route } from "./+types/cron.reservations-cleanup";

export async function loader({ url }: Route.LoaderArgs) {
  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  // Days before the office's today only: bookings are stored at midnight of
  // their day, so comparing with the time now would also take today's.
  let today = startOfDay(officeNow()).getTime();

  try {
    await db.delete(reservations).where(lt(reservations.dateTimestamp, today));

    return new Response("Subscriptions cleaned up", { status: 200 });
  } catch (error: any) {
    return new Response(
      error?.message || "Error while cleaning up subscriptions",
      { status: 500 },
    );
  }
}
