import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@vercel/remix";
import { and, eq } from "drizzle-orm";
import { jsonWithSuccess } from "remix-toast";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks, users } from "~/lib/db/schema.server";
import { addCron, addCronSchema, deleteCron } from "~/lib/easy-cron";

export async function loader({ request }: LoaderFunctionArgs) {
  let user = await requireAuthCookie(request);
  let desk = await db.query.desks.findFirst({
    where: eq(desks.userId, user.userId),
    columns: {
      id: true,
    },
    with: {
      user: {
        columns: {
          autoReservationsCronId: true,
        },
      },
    },
  });

  if (!desk) {
    return redirect("/");
  }

  return { desk };
}

export async function action({ request }: ActionFunctionArgs) {
  let user = await requireAuthCookie(request);
  let formData = await request.formData();
  let intent = formData.get("intent");

  if (intent === "ADD") {
    let days = formData.getAll("day");
    let deskId = String(formData.get("deskId"));

    let parsedInput = addCronSchema.safeParse({
      days,
      deskId,
      userId: user.userId,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    if (!parsedInput.success) {
      throw new Error(
        "Invalid form input, please try again! If the issue persists contact an admin.",
      );
    }

    let res = await addCron(parsedInput.data);
    await db
      .update(users)
      .set({ autoReservationsCronId: res.cron_job_id })
      .where(eq(users.id, user.userId));

    return jsonWithSuccess(null, {
      message: "Automatic reservation has been setup successfully!",
    });
  } else if (intent === "DELETE") {
    let cronId = String(formData.get("cronId"));
    let res = await deleteCron({ cronId });
    await db
      .update(users)
      .set({ autoReservationsCronId: null })
      .where(
        and(
          eq(users.id, user.userId),
          eq(users.autoReservationsCronId, res.cron_job_id),
        ),
      );

    return jsonWithSuccess(null, {
      message: "Automatic reservation has been deleted!",
    });
  }

  return null;
}

export default function AutomaticReservationsPage() {
  let data = useLoaderData<typeof loader>();
  let navigation = useNavigation();
  let isSubmitting = navigation.state !== "idle";
  let userCronId = data.desk.user?.autoReservationsCronId;
  let availableDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  return (
    <section className="flex max-w-xl flex-col justify-center gap-16">
      <TypographyH1>Automatic reservations</TypographyH1>

      {userCronId ? (
        <Form method="POST">
          <input type="hidden" name="intent" value="DELETE" />
          <input type="hidden" name="cronId" value={userCronId} />

          <Button
            className="max-w-full md:max-w-[6rem] md:self-center"
            variant="destructive"
            type="submit"
          >
            {isSubmitting ? "Deleting..." : "Delete"}
          </Button>
        </Form>
      ) : (
        <Form method="POST" className="flex flex-col gap-8">
          <input type="hidden" name="intent" value="ADD" />
          <input type="hidden" name="deskId" value={data.desk.id} />

          <fieldset className="flex flex-wrap items-center gap-6">
            {availableDays.map((day) => (
              <div key={day} className="flex items-center space-x-2">
                <Checkbox id={`day-${day}`} name="day" value={day} />
                <label
                  htmlFor={`day-${day}`}
                  className="text-sm font-medium capitalize leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {day}
                </label>
              </div>
            ))}
          </fieldset>

          <Button
            className="max-w-full md:max-w-[6rem] md:self-center"
            type="submit"
          >
            {isSubmitting ? "Setting up..." : "Setup interval"}
          </Button>
        </Form>
      )}
    </section>
  );
}
