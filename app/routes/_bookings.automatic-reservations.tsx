import { format, nextDay, startOfDay } from "date-fns";
import { and, eq } from "drizzle-orm";
import { useEffect, useState } from "react";
import { Form, redirect, useNavigation } from "react-router";
import { dataWithSuccess } from "remix-toast";
import { DeskChip, deskLabel, type OwnDesk } from "~/components/bookings";
import { Button } from "~/components/ui/button";
import { requireAuthCookie } from "~/cookies.server";
import {
  addCron,
  addCronSchema,
  daysFromJob,
  deleteCron,
  disableCron,
  enableCron,
  getCronDetails,
} from "~/lib/cron";
import { formatDate, parseDate, WEEKDAYS, type Weekday } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, users } from "~/lib/db/schema";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_bookings.automatic-reservations";

export let meta: Route.MetaFunction = () => [{ title: "Recurring bookings" }];

export async function loader({ request }: Route.LoaderArgs) {
  let user = await requireAuthCookie(request);
  let desk = await db.query.desks.findFirst({
    where: eq(desks.userId, user.userId),
    columns: { id: true, block: true, row: true, column: true },
    with: {
      user: {
        columns: {
          autoReservationsCronId: true,
        },
      },
    },
  });

  // Only your own desk can be booked ahead, so without one there is nothing
  // to repeat.
  if (!desk?.id) {
    return redirect("/reservations");
  }

  let { user: owner, ...ownDesk } = desk;
  let cronId = owner?.autoReservationsCronId ?? null;
  let schedule: { enabled: boolean; days: Weekday[] } | null = null;

  if (cronId) {
    let res = await getCronDetails({ cronId });
    schedule = {
      enabled: res.jobDetails?.enabled === true,
      days: daysFromJob(res.jobDetails),
    };
  }

  return {
    desk: ownDesk,
    cronId,
    schedule,
    nextRun: formatDate(nextSunday(new Date())),
  };
}

// The job runs every Sunday at 10:00 (see addCron).
function nextSunday(now: Date) {
  let sunday = nextDay(startOfDay(now), 0);
  return now.getDay() === 0 && now.getHours() < 10 ? startOfDay(now) : sunday;
}

export async function action({ request }: Route.ActionArgs) {
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
      .set({ autoReservationsCronId: String(res.jobId) })
      .where(eq(users.id, user.userId));

    return dataWithSuccess(null, {
      message: "Automatic reservation has been setup successfully!",
    });
  } else if (intent === "DELETE") {
    let cronId = String(formData.get("cronId"));
    await deleteCron({ cronId });
    await db
      .update(users)
      .set({ autoReservationsCronId: null })
      .where(
        and(
          eq(users.id, user.userId),
          eq(users.autoReservationsCronId, cronId),
        ),
      );

    return dataWithSuccess(null, {
      message: "Automatic reservation has been deleted!",
    });
  } else if (intent === "DISABLE") {
    let cronId = String(formData.get("cronId"));
    await disableCron({ cronId });

    return dataWithSuccess(null, {
      message: "Automatic reservation has been disabled!",
    });
  } else if (intent === "ENABLE") {
    let cronId = String(formData.get("cronId"));
    await enableCron({ cronId });

    return dataWithSuccess(null, {
      message: "Automatic reservation has been enabled!",
    });
  }

  return null;
}

let dayNames: Record<Weekday, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
};

export default function AutomaticReservationsPage({
  loaderData: { desk, cronId, schedule, nextRun },
}: Route.ComponentProps) {
  let navigation = useNavigation();
  let isSubmitting = navigation.state === "submitting";
  let [picked, setPicked] = useState<Weekday[]>(schedule?.days ?? []);
  let scheduledDays = schedule?.days.join();

  // After "Stop and remove" the setup form starts from the days you had, so
  // changing them is stop, adjust, set up.
  useEffect(() => {
    if (scheduledDays) {
      setPicked(scheduledDays.split(",") as Weekday[]);
    }
  }, [scheduledDays]);
  let nextRunLabel = format(parseDate(nextRun), "EEE d MMM");

  function isSubmittingAction(action: string) {
    return isSubmitting && navigation.formData?.get("intent") === action;
  }

  return (
    <div className="flex flex-col gap-7 rounded-xl border border-line bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[15px] font-bold">Weekly booking</h2>
        <p className="max-w-[52ch] text-pretty text-sm leading-relaxed text-ink-muted">
          Book your own desk every week without thinking about it. It runs every
          Sunday at 10:00 and books the week ahead.
        </p>
      </div>

      {schedule && cronId ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-paper-muted px-4 py-3 text-sm">
            <span className="flex items-center gap-2.5">
              <span
                aria-hidden="true"
                className={cn(
                  "size-2 rounded-full",
                  schedule.enabled
                    ? "bg-moss ring-4 ring-moss-soft"
                    : "ring-line/60 bg-dim ring-4",
                )}
              />
              <b className="font-semibold">
                {schedule.enabled ? "Active" : "Paused"}
              </b>
            </span>
            <span className="text-ink-muted">
              {schedule.enabled
                ? `Next run ${nextRunLabel}`
                : "Nothing is booked while paused"}
            </span>
          </div>

          <div className="flex flex-col gap-3.5">
            <Rule desk={desk} />
            {schedule.days.length > 0 ? (
              <div className="grid grid-cols-5 gap-2 sm:max-w-[420px]">
                {WEEKDAYS.map((day) => {
                  let on = schedule.days.includes(day);
                  return (
                    <span
                      key={day}
                      role="img"
                      aria-label={`${dayNames[day]}, ${on ? "booked" : "not booked"}`}
                      className={cn(
                        "grid h-11 place-items-center rounded-lg border-[1.5px] text-[13px] font-semibold",
                        on
                          ? "border-moss-edge bg-moss text-white"
                          : "border-line bg-paper text-dim",
                      )}
                    >
                      {dayNames[day]}
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                the days you picked when you set it up.
              </p>
            )}
            <p className="text-[13px] leading-relaxed text-ink-muted">
              To change the days, stop it and set it up again. Days already
              booked stay booked.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 border-t border-line pt-6 sm:flex-row">
            <Form method="POST">
              <input
                type="hidden"
                name="intent"
                value={schedule.enabled ? "DISABLE" : "ENABLE"}
              />
              <input type="hidden" name="cronId" value={cronId} />
              <Button
                variant="quiet"
                size="tall"
                className="w-full px-5 sm:w-auto"
                disabled={isSubmitting}
              >
                {schedule.enabled
                  ? isSubmittingAction("DISABLE")
                    ? "Pausing..."
                    : "Pause"
                  : isSubmittingAction("ENABLE")
                    ? "Resuming..."
                    : "Resume"}
              </Button>
            </Form>

            <Form method="POST">
              <input type="hidden" name="intent" value="DELETE" />
              <input type="hidden" name="cronId" value={cronId} />
              <Button
                variant="quiet"
                size="tall"
                className="hover:border-danger/40 hover:bg-danger/5 w-full px-5 text-danger sm:w-auto"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmittingAction("DELETE")
                  ? "Stopping..."
                  : "Stop and remove"}
              </Button>
            </Form>
          </div>
        </>
      ) : (
        <Form method="POST" className="flex flex-col gap-7">
          <input type="hidden" name="intent" value="ADD" />
          <input type="hidden" name="deskId" value={desk.id} />

          <fieldset className="flex flex-col gap-3.5">
            <legend className="contents">
              <Rule desk={desk} />
            </legend>
            <div className="grid grid-cols-5 gap-2 sm:max-w-[420px]">
              {WEEKDAYS.map((day) => {
                let on = picked.includes(day);
                return (
                  <label
                    key={day}
                    className={cn(
                      "relative grid h-11 cursor-pointer place-items-center rounded-lg border-[1.5px] text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-moss has-[:focus-visible]:ring-offset-2",
                      on
                        ? "border-moss-edge bg-moss text-white"
                        : "border-dashed border-mist-edge bg-paper text-ink hover:bg-paper-muted",
                    )}
                  >
                    <input
                      type="checkbox"
                      name="day"
                      value={day}
                      checked={on}
                      onChange={() =>
                        setPicked((current) =>
                          current.includes(day)
                            ? current.filter((d) => d !== day)
                            : [...current, day],
                        )
                      }
                      aria-label={dayNames[day]}
                      className="absolute inset-0 cursor-pointer appearance-none rounded-lg opacity-0"
                    />
                    {dayNames[day]}
                  </label>
                );
              })}
            </div>
            <p className="text-[13px] leading-relaxed text-ink-muted">
              The first run is on {nextRunLabel}.
            </p>
          </fieldset>

          <div className="border-t border-line pt-6">
            <Button
              variant="primary"
              size="tall"
              className="w-full px-5 sm:w-auto"
              type="submit"
              disabled={isSubmitting || picked.length === 0}
            >
              {isSubmittingAction("ADD")
                ? "Setting up..."
                : picked.length === 0
                  ? "Pick your days"
                  : "Set up weekly booking"}
            </Button>
          </div>
        </Form>
      )}
    </div>
  );
}

function Rule({ desk }: { desk: OwnDesk }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[15px] font-medium">
      Every week, book
      <DeskChip label={deskLabel(desk)} tone="mine" />
      <span className="sr-only">{`desk ${deskLabel(desk)}`}</span>
      for me on
    </span>
  );
}
