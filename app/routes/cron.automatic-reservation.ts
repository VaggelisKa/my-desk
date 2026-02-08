import { format, getWeek } from "date-fns";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { deleteCron } from "~/lib/cron";
import { db } from "~/lib/db/drizzle.server";
import { reservations, users } from "~/lib/db/schema";
import { getDateByWeekAndDay } from "~/lib/utils";
import type { Route } from "./+types/cron.automatic-reservation";

const automaticReservationsQueryArgsSchema = z.object({
  deskId: z.number(),
  userId: z.string(),
  days: z.array(z.string()),
});

export async function loader({ request }: Route.LoaderArgs) {
  let url = new URL(request.url);

  let cronPassword = url.searchParams.get("cronPassword");

  console.log("search params => ", url.searchParams);

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
    await deleteCron({ cronId: userInDb?.autoReservationsCronId ?? "" });
    await db
      .update(users)
      .set({ autoReservationsCronId: null })
      .where(eq(users.id, parsedInputs.data.userId));

    return new Response("Desk does not match user's desk", { status: 401 });
  }

  let formattedData = parsedInputs.data.days.map((day) => ({
    day,
    week,
    deskId: parsedInputs.data!.deskId,
    userId: parsedInputs.data!.userId,
    date: format(getDateByWeekAndDay(day, week), "dd.MM.yyyy"),
    dateTimestamp: sql`(${getDateByWeekAndDay(day, week).getTime()})`,
  }));

  await db.insert(reservations).values(formattedData).onConflictDoNothing();

  return new Response(
    "Automatic reservation interval has executed successfully!",
    {
      status: 200,
    },
  );
}
