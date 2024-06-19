import { Form, useLoaderData } from "@remix-run/react";
import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@vercel/remix";
import { eq } from "drizzle-orm";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks } from "~/lib/db/schema.server";
import { addCron, addCronSchema } from "~/lib/easy-cron";

export async function loader({ request }: LoaderFunctionArgs) {
  let user = await requireAuthCookie(request);
  let desk = await db.query.desks.findFirst({
    where: eq(desks.userId, user.userId),
    columns: {
      id: true,
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
    return null;
  }

  try {
    let res = await addCron(parsedInput.data);
    console.log(res);
  } catch (error) {
    console.error(error);
  }

  return null;
}

export default function AutomaticReservationsPage() {
  let data = useLoaderData<typeof loader>();
  let availableDays = ["monday", "tuesday", "wednesday", "thursday", "friday"];

  return (
    <section className="flex max-w-xl flex-col justify-center gap-16">
      <TypographyH1>Automatic reservations</TypographyH1>

      <Form method="POST" className="flex flex-col gap-8">
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
          Setup interval
        </Button>
      </Form>
    </section>
  );
}
