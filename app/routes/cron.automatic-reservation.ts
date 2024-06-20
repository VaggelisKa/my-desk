import { type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { format, getWeek } from "date-fns";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/lib/db/drizzle.server";
import { reservations, users } from "~/lib/db/schema.server";
import { getDateByWeekAndDay } from "~/lib/utils";

const automaticReservationsQueryArgsSchema = z.object({
  deskId: z.number(),
  userId: z.string(),
  days: z.array(z.string()),
});

export async function loader({ request }: LoaderFunctionArgs) {
  let url = new URL(request.url);

  let cronPassword = url.searchParams.get("cron-password");

  if (!cronPassword || cronPassword !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

  let week = getWeek(new Date());
  let days = url.searchParams.getAll("day");
  let deskId = Number(url.searchParams.get("deskId"));
  let userId = url.searchParams.get("userId");

  let parsedInputs = automaticReservationsQueryArgsSchema.safeParse({
    deskId,
    userId,
    days,
  });

  if (!parsedInputs.success) {
    return new Response("Invalid input", { status: 400 });
  }

  let userInDb = await db.query.users.findFirst({
    where: eq(users.id, parsedInputs.data.userId),
    with: {
      desk: {
        columns: {
          id: true,
        },
      },
    },
  });

  if (!userInDb?.desk || userInDb.desk.id !== parsedInputs.data.deskId) {
    return new Response("Desk does not match user's desk", { status: 401 });
  }

  let formattedData = parsedInputs.data.days.map((day) => ({
    day,
    week,
    deskId: parsedInputs.data.deskId,
    userId: parsedInputs.data.userId,
    date: format(getDateByWeekAndDay(day, week), "dd.MM.yyyy"),
    dateTimestamp: sql`(${getDateByWeekAndDay(day, week).getTime()})`,
  }));

  await db.insert(reservations).values(formattedData).onConflictDoNothing();

  return new Response("Automatic reservation has been setup successfully!", {
    status: 200,
  });
}