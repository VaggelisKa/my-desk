import { type LoaderFunctionArgs } from "react-router";
import { getTime } from "date-fns";
import { lt } from "drizzle-orm";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema.server";

export async function loader({ request }: LoaderFunctionArgs) {
  let url = new URL(request.url);

  if (url.searchParams.get("cronPassword") !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let today = getTime(new Date());

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
