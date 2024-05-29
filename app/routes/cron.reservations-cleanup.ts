import { json, type ActionFunctionArgs } from "@remix-run/server-runtime";
import { format } from "date-fns";
import { lt } from "drizzle-orm";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema.server";

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== "DELETE") {
    return json({ error: "Method Not Allowed" }, { status: 405 });
  }

  if (
    request.headers.get("Authorization") !==
    `Bearer ${process.env.CRON_PASSWORD}`
  ) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  let today = format(new Date(), "dd.MM.yyyy");

  try {
    await db.delete(reservations).where(lt(reservations.date, today));

    return json({ message: "Subscriptions cleaned up" }, { status: 200 });
  } catch (error: any) {
    json(
      { error: error?.message || "Error while cleaning up subscriptions" },
      { status: 500 },
    );
  }
}
