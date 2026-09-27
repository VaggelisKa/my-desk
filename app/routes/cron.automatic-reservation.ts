import { z } from "zod";
import { runWeeklyBooking } from "~/lib/recurring.server";
import type { Route } from "./+types/cron.automatic-reservation";

const automaticReservationsQueryArgsSchema = z.object({
  deskId: z.number(),
  userId: z.string(),
  days: z.array(z.string()),
});

export async function loader({ url }: Route.LoaderArgs) {
  let cronPassword = url.searchParams.get("cronPassword");

  if (!cronPassword || cronPassword !== process.env.CRON_PASSWORD) {
    return new Response("Unauthorized", { status: 401 });
  }

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

  let booked = await runWeeklyBooking(parsedInputs.data);

  if (!booked) {
    return new Response("Desk does not match user's desk", { status: 401 });
  }

  return new Response(
    "Automatic reservation interval has executed successfully!",
    {
      status: 200,
    },
  );
}
