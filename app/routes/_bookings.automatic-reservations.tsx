import { format, nextDay, startOfDay } from "date-fns";
import { and, eq } from "drizzle-orm";
import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";
import { Form, redirect, useNavigation, useSubmit } from "react-router";
import { dataWithError, dataWithSuccess } from "remix-toast";
import { DeskChip, type OwnDesk } from "~/components/bookings";
import { Button } from "~/components/ui/button";
import { requireAuthCookie } from "~/cookies.server";
import {
  addCron,
  addCronSchema,
  CronError,
  daysFromJob,
  deleteCron,
  disableCron,
  enableCron,
  getCronDetails,
} from "~/lib/cron";
import { formatDate, parseDate, WEEKDAYS, type Weekday } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { desks, users } from "~/lib/db/schema";
import { rescueFocus } from "~/lib/focus";
import { cn, deskLabel } from "~/lib/utils";
import type { Route } from "./+types/_bookings.automatic-reservations";

export let meta: Route.MetaFunction = () => [{ title: "Recurring bookings" }];

// The signed-in user's desk and weekly job, from the database. The job id is
// never taken from the form: it would let anyone pause or remove anyone's job.
async function findOwnDesk(userId: string) {
  return db.query.desks.findFirst({
    where: eq(desks.userId, userId),
    columns: { id: true, block: true, row: true, column: true },
    with: {
      user: {
        columns: {
          autoReservationsCronId: true,
        },
      },
    },
  });
}

let schedulerDown = {
  message: "Could not reach the scheduler",
  description: "Nothing was changed. Try again in a moment.",
};

export async function loader({ request }: Route.LoaderArgs) {
  let user = await requireAuthCookie(request);
  let desk = await findOwnDesk(user.userId);

  // Only your own desk can be booked ahead, so without one there is nothing
  // to repeat.
  if (!desk?.id) {
    return redirect("/reservations");
  }

  let { user: owner, ...ownDesk } = desk;
  let cronId = owner?.autoReservationsCronId ?? null;
  let schedule: { enabled: boolean; days: Weekday[] } | null = null;
  // Set up, but its state could not be read: neither active nor paused.
  let unavailable = false;

  if (cronId) {
    try {
      let { jobDetails } = await getCronDetails({ cronId });
      schedule = {
        enabled: jobDetails.enabled === true,
        days: daysFromJob(jobDetails),
      };
    } catch (error) {
      if (!(error instanceof CronError)) throw error;
      console.error(error);
      unavailable = true;
    }
  }

  return {
    desk: ownDesk,
    cronId,
    schedule,
    unavailable,
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
  let desk = await findOwnDesk(user.userId);
  let cronId = desk?.user?.autoReservationsCronId ?? null;

  if (!desk) {
    return dataWithError(
      null,
      { message: "Only your own desk can be booked every week" },
      { status: 403 },
    );
  }

  try {
    if (intent === "ADD") {
      // One weekly job per person: a double submit must not leave a second
      // job running that nothing points at any more.
      if (cronId) {
        return dataWithError(
          null,
          { message: "Weekly booking is already set up" },
          { status: 409 },
        );
      }

      let parsedInput = addCronSchema.safeParse({
        days: formData.getAll("day"),
        deskId: String(desk.id),
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
      });

      if (!parsedInput.success || parsedInput.data.days.length === 0) {
        return dataWithError(
          null,
          { message: "Pick the days to book" },
          { status: 400 },
        );
      }

      let { jobId } = await addCron(parsedInput.data);
      await db
        .update(users)
        .set({ autoReservationsCronId: String(jobId) })
        .where(eq(users.id, user.userId));

      return dataWithSuccess(null, {
        message: "Weekly booking set up",
      });
    }

    if (!cronId) {
      return dataWithError(
        null,
        { message: "There is no weekly booking to change" },
        { status: 404 },
      );
    }

    if (intent === "DELETE") {
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
        message: "Weekly booking stopped",
      });
    } else if (intent === "DISABLE") {
      await disableCron({ cronId });

      return dataWithSuccess(null, {
        message: "Weekly booking paused",
      });
    } else if (intent === "ENABLE") {
      await enableCron({ cronId });

      return dataWithSuccess(null, {
        message: "Weekly booking resumed",
      });
    }
  } catch (error) {
    if (!(error instanceof CronError)) throw error;
    console.error(error);

    return dataWithError(null, schedulerDown, { status: 502 });
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
  loaderData: { desk, cronId, schedule, unavailable, nextRun },
}: Route.ComponentProps) {
  let navigation = useNavigation();
  // A submission stays pending through the reload that follows it, so the
  // buttons do not flash back to the old state before the new data lands.
  let pendingIntent =
    navigation.state !== "idle" ? navigation.formData?.get("intent") : null;
  // Pause and Resume flip the status straight away instead of showing a
  // "Pausing..." step, the old status, and then the new one.
  let enabled =
    pendingIntent === "ENABLE"
      ? true
      : pendingIntent === "DISABLE"
        ? false
        : schedule?.enabled === true;
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
  let heading = useRef<HTMLHeadingElement>(null);
  let submit = useSubmit();

  // Every action here swaps or disables the button you pressed (Set up
  // becomes the summary, Stop brings the setup back, Pause turns Resume),
  // so once it is done focus goes back to the card instead of the page.
  function submitKeepingFocus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let form = event.currentTarget;
    let hadFocus = form.contains(document.activeElement);
    void submit(form).then(() => {
      if (hadFocus) rescueFocus(heading.current);
    });
  }

  return (
    <div className="enter flex flex-col gap-7 rounded-xl border border-line bg-paper px-5 py-6 sm:px-8 sm:py-8">
      <div className="flex flex-col gap-1.5">
        <h2 ref={heading} className="text-[15px] font-bold">
          Weekly booking
        </h2>
        <p className="max-w-[52ch] text-pretty text-sm leading-relaxed text-ink-muted">
          Book your own desk every week without thinking about it. It runs every
          Sunday at 10:00 and books the week ahead.
        </p>
      </div>

      {unavailable ? (
        <p
          role="status"
          className="rounded-lg bg-paper-muted px-4 py-3 text-sm"
        >
          {`${schedulerDown.message}, so its status is unknown. Try again in a moment.`}
        </p>
      ) : schedule && cronId ? (
        <ScheduleSummary
          desk={desk}
          days={schedule.days}
          enabled={enabled}
          nextRunLabel={nextRunLabel}
          pendingIntent={pendingIntent}
          onSubmit={submitKeepingFocus}
        />
      ) : (
        <SetupForm
          desk={desk}
          picked={picked}
          onPickedChange={setPicked}
          nextRunLabel={nextRunLabel}
          pendingIntent={pendingIntent}
          onSubmit={submitKeepingFocus}
        />
      )}
    </div>
  );
}

type PendingIntent = FormDataEntryValue | null | undefined;
type OnSubmit = (event: FormEvent<HTMLFormElement>) => void;

function ScheduleSummary({
  desk,
  days,
  enabled,
  nextRunLabel,
  pendingIntent,
  onSubmit,
}: {
  desk: OwnDesk;
  days: Weekday[];
  enabled: boolean;
  nextRunLabel: string;
  pendingIntent: PendingIntent;
  onSubmit: OnSubmit;
}) {
  let isSubmitting = pendingIntent != null;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-paper-muted px-4 py-3 text-sm">
        <span className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className={cn(
              "size-2 rounded-full",
              enabled
                ? "bg-moss ring-4 ring-moss-soft"
                : "ring-line/60 bg-dim ring-4",
            )}
          />
          <b className="font-semibold">{enabled ? "Active" : "Paused"}</b>
        </span>
        <span className="text-ink-muted">
          {enabled
            ? `Next run ${nextRunLabel}`
            : "Nothing is booked while paused"}
        </span>
      </div>

      <div className="flex flex-col gap-3.5">
        <Rule desk={desk} />
        {days.length > 0 ? (
          <div className="grid grid-cols-5 gap-2 sm:max-w-[420px]">
            {WEEKDAYS.map((day) => {
              let on = days.includes(day);
              return (
                <span
                  key={day}
                  role="img"
                  aria-label={`${dayNames[day]}, ${on ? "booked" : "not booked"}`}
                  className={cn(
                    "grid h-11 place-items-center rounded-lg border-[1.5px] text-[13px] font-semibold",
                    on
                      ? "border-moss-edge bg-moss text-white"
                      : "border-line bg-paper text-ink-muted",
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
          To change the days, stop it and set it up again. Days already booked
          stay booked.
        </p>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line pt-6 sm:flex-row">
        <Form method="POST" onSubmit={onSubmit}>
          <input
            type="hidden"
            name="intent"
            value={enabled ? "DISABLE" : "ENABLE"}
          />
          <Button
            variant="quiet"
            size="tall"
            className="w-full px-5 sm:w-auto"
            disabled={isSubmitting}
          >
            {enabled ? "Pause" : "Resume"}
          </Button>
        </Form>

        <Form method="POST" onSubmit={onSubmit}>
          <input type="hidden" name="intent" value="DELETE" />
          <Button
            variant="quiet"
            size="tall"
            className="hover:border-danger/40 hover:bg-danger/5 w-full px-5 text-danger sm:w-auto"
            type="submit"
            disabled={isSubmitting}
          >
            {pendingIntent === "DELETE" ? "Stopping..." : "Stop and remove"}
          </Button>
        </Form>
      </div>
    </>
  );
}

function SetupForm({
  desk,
  picked,
  onPickedChange,
  nextRunLabel,
  pendingIntent,
  onSubmit,
}: {
  desk: OwnDesk;
  picked: Weekday[];
  onPickedChange: Dispatch<SetStateAction<Weekday[]>>;
  nextRunLabel: string;
  pendingIntent: PendingIntent;
  onSubmit: OnSubmit;
}) {
  let isSubmitting = pendingIntent != null;

  return (
    <Form method="POST" className="flex flex-col gap-7" onSubmit={onSubmit}>
      <input type="hidden" name="intent" value="ADD" />

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
                    onPickedChange((current) =>
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
          {pendingIntent === "ADD"
            ? "Setting up..."
            : picked.length === 0
              ? "Pick your days"
              : "Set up weekly booking"}
        </Button>
      </div>
    </Form>
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
