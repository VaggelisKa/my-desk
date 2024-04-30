import { Form, useLoaderData } from "@remix-run/react";
import {
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@vercel/remix";
import {
  add,
  addDays,
  addWeeks,
  endOfWeek,
  format,
  getWeek,
  getYear,
  isAfter,
  setHours,
  setMinutes,
  startOfWeek,
} from "date-fns";
import { eq } from "drizzle-orm";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations } from "~/lib/db/schema.server";

function getDateByWeekAndDay(dayName: string, weekNumber: number) {
  const startOfWeekOfYearWeek = startOfWeek(
    new Date(getYear(new Date()), 0, 1),
  ); // January 1st of the given year
  const targetDate = addWeeks(startOfWeekOfYearWeek, weekNumber - 1); // Subtracting 1 because weeks are 0-indexed

  const dayIndex = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ].indexOf(dayName.toLowerCase());

  if (dayIndex === -1) {
    throw new Error("Invalid day name");
  }

  return addDays(targetDate, dayIndex);
}

export async function loader({ request, params }: LoaderFunctionArgs) {
  let userId = await requireAuthCookie(request);
  let deskId = Number(params["*"]);

  if (deskId) {
    let desk = await db.query.desks.findFirst({
      where: eq(desks.id, deskId),
      with: {
        reservations: true,
      },
    });

    if (!desk) {
      throw new Error("Desk not found");
    }

    console.log("desk path", desk);

    return { desk, userId };
  } else {
    let desk = await db.query.desks.findFirst({
      where: eq(desks.userId, userId),
      with: {
        reservations: true,
      },
    });

    if (!desk) {
      throw new Error("Desk not found, querying user!");
    }

    console.log("user path", desk);

    return { desk, userId };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  let userId = await requireAuthCookie(request);
  let formData = await request.formData();
  let deskId = Number(formData.get("deskId"));
  let week = Number(formData.get("week"));

  let formValues = Object.fromEntries(formData.entries());
  delete formValues.deskId;
  delete formValues.week;

  if (Object.keys(formValues).length === 0) {
    throw new Error("No days selected");
  }

  let formattedValues = Object.entries(formValues).map(([day]) => {
    return {
      day,
      week,
      deskId,
      userId,
      date: format(getDateByWeekAndDay(day, week), "dd.MM.yyyy"),
    };
  });

  await db.insert(reservations).values(formattedValues);

  return redirect("/");
}

export default function ReserveDeskPage() {
  let currentWeek = getWeek(new Date());
  let startOfCurrentWeek = format(startOfWeek(new Date()), "dd.MM");
  let endOfCurrentWeek = format(endOfWeek(new Date()), "dd.MM");
  let startOfNextWeek = format(
    startOfWeek(add(new Date(), { weeks: 1 })),
    "dd.MM",
  );
  let endOfNextWeek = format(endOfWeek(add(new Date(), { weeks: 1 })), "dd.MM");

  let { desk } = useLoaderData<typeof loader>();
  let [selectedWeek, setSelectedWeek] = useState(String(currentWeek));

  function isReserved(day: string) {
    return !!desk.reservations.filter(
      (r) => r.week === Number(selectedWeek) && r.day === day,
    )?.length;
  }

  function isAfterToday(day: string) {
    let date = getDateByWeekAndDay(day, Number(selectedWeek));
    let endOfDay = setMinutes(setHours(new Date(), 15), 0);
    let threePm = setMinutes(setHours(date, 15), 0);

    return isAfter(threePm, endOfDay);
  }

  let availableDays = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
  ].filter((d) => isAfterToday(d));

  return (
    <section className="flex max-w-xl flex-col justify-center gap-16">
      <TypographyH1>Reservation form</TypographyH1>

      <Form className="flex flex-col gap-8" method="POST">
        <input type="hidden" name="deskId" value={desk.id} />

        <fieldset className="space-y-2">
          <p className="text-sm font-medium capitalize leading-none">
            Selected week
          </p>
          <Select
            onValueChange={setSelectedWeek}
            defaultValue={String(currentWeek)}
            name="week"
            required
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select the week" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value={String(currentWeek)}>
                  Current {`(${startOfCurrentWeek} - ${endOfCurrentWeek})`}
                </SelectItem>
                <SelectItem value={String(currentWeek + 1)}>
                  Next {`(${startOfNextWeek} - ${endOfNextWeek})`}
                </SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </fieldset>

        {availableDays.length ? (
          <>
            <fieldset className="flex flex-wrap items-center gap-6">
              {availableDays.map((day) => (
                <div key={day} className="flex items-center space-x-2">
                  <Checkbox
                    disabled={isReserved(day)}
                    id={`day-${day}`}
                    name={day}
                  />
                  <label
                    htmlFor={`day-${day}`}
                    className="text-sm font-medium capitalize leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    {day} {isReserved(day) ? "(reserved)" : ""}
                  </label>
                </div>
              ))}
            </fieldset>

            <Button className="max-w-full sm:max-w-[6rem]" type="submit">
              Reserve
            </Button>
          </>
        ) : (
          "No available days to reserve!"
        )}
      </Form>
    </section>
  );
}
