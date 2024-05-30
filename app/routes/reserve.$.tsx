import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
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
  startOfWeek,
} from "date-fns";
import { eq, sql } from "drizzle-orm";
import { useState } from "react";
import {
  jsonWithError,
  redirectWithError,
  redirectWithSuccess,
} from "remix-toast";
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

export let meta: MetaFunction = () => [
  {
    title: "Add a reservation",
  },
];

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
  let { userId } = await requireAuthCookie(request);
  let deskId = Number(params["*"]);

  if (deskId) {
    let desk = await db.query.desks.findFirst({
      where: eq(desks.id, deskId),
      with: {
        reservations: true,
      },
    });

    if (!desk) {
      return redirectWithError("/", { message: "Desk not found!" });
    }

    return { desk, userId };
  } else {
    let desk = await db.query.desks.findFirst({
      where: eq(desks.userId, userId),
      with: {
        reservations: true,
      },
    });

    if (!desk) {
      return redirectWithError("/", {
        message: "Desk not found!",
        description:
          "Could not determine the desk assigned to the logged in user, please contact and administrator.",
      });
    }

    return { desk, userId };
  }
}

export async function action({ request }: ActionFunctionArgs) {
  let { userId } = await requireAuthCookie(request);
  let formData = await request.formData();
  let deskId = Number(formData.get("deskId"));
  let week = Number(formData.get("week"));

  let formValues = Object.fromEntries(formData.entries());
  delete formValues.deskId;
  delete formValues.week;
  delete formValues.intent;

  if (Object.keys(formValues).length === 0) {
    return jsonWithError(
      null,
      {
        message: "Reservation information is missing",
        description: "Make sure you have selected at least an available day",
      },
      { status: 400 },
    );
  }

  let formattedValues = Object.entries(formValues).map(([day]) => {
    return {
      day,
      week,
      deskId,
      userId,
      date: format(getDateByWeekAndDay(day, week), "dd.MM.yyyy"),
      dateTimestamp: sql`(${getDateByWeekAndDay(day, week).getTime()})`,
    };
  });

  await db.insert(reservations).values(formattedValues);

  return redirectWithSuccess("/", { message: "Reservation added!" });
}

export default function ReserveDeskPage() {
  let navigation = useNavigation();
  let isReserving = navigation.formData?.get("intent") === "reserve";

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
    return !!desk?.reservations.filter(
      (r) => r.week === Number(selectedWeek) && r.day === day,
    )?.length;
  }

  function isAfterToday(day: string) {
    let date = getDateByWeekAndDay(day, Number(selectedWeek));
    let currentHours = new Date().getHours();
    let now = setHours(new Date(), currentHours);
    let selectedDayAt11Am = setHours(date, 11);

    return isAfter(selectedDayAt11Am, now);
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
        <input type="text" name="intent" value="reserve" hidden />
        <input type="hidden" name="deskId" value={desk?.id} />

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

            <Button
              className="max-w-full sm:max-w-[6rem]"
              type="submit"
              disabled={isReserving}
            >
              {isReserving ? "Reserving..." : "Reserve"}
            </Button>
          </>
        ) : (
          "No available days to reserve!"
        )}
      </Form>
    </section>
  );
}
