import { Sheet } from "@silk-hq/components";
import { addDays, format, getWeek, isBefore, startOfDay } from "date-fns";
import { X } from "lucide-react";
import { useState } from "react";
import { Link, useFetcher } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "~/components/ui/button";
import { formatDate, workdaysOfWeek, type Weekday } from "~/lib/dates";
import type { reservations, users } from "~/lib/db/schema";
import { cn } from "~/lib/utils";

type DeskSheetProps = {
  desk: {
    id: number;
    row: number;
    block: number;
    column: number;
    user: Pick<
      typeof users.$inferSelect,
      "firstName" | "lastName" | "id"
    > | null;
    reservations: (Pick<
      typeof reservations.$inferSelect,
      "date" | "week" | "day"
    > & {
      users: Pick<typeof users.$inferSelect, "id" | "firstName" | "lastName">;
    })[];
  };
  /** The desk tile; it becomes the trigger. */
  children: React.ReactNode;
  allowedToReserve?: boolean;
  allowedToEdit?: boolean;
  /** The signed-in user, to show their own bookings in moss. */
  userId?: string;
  /** The day shown on the map, in `dd.MM.yyyy`; marked in the two-week grid. */
  selectedDay?: string;
};

type TravelStatus =
  | "entering"
  | "idleInside"
  | "stepping"
  | "exiting"
  | "idleOutside";

let days = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

let placement: Record<number, string> = {
  1: "by the window",
  2: "in the middle",
  3: "by the aisle",
};

/**
 * Desk detail as a Silk sheet: from the bottom on phones, from the right on
 * larger screens. Shows who the desk belongs to, who has it today, the next
 * two weeks, and the one action the booking rules allow.
 */
export function DeskSheet({
  desk,
  children,
  allowedToReserve,
  allowedToEdit,
  userId,
  selectedDay,
}: DeskSheetProps) {
  let [presented, setPresented] = useState(false);
  let [travelStatus, setTravelStatus] = useState<TravelStatus>("idleOutside");
  // Same breakpoint as the sidebar's mobile mode. Captured when the sheet
  // opens so rotating a phone mid-way does not flip the placement.
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);
  let fetcher = useFetcher();
  let now = new Date();
  let currentWeek = getWeek(now);
  let todaysDay = days[now.getDay()];
  let isWeekend = todaysDay === "saturday" || todaysDay === "sunday";
  // Weeks start on Sunday, so on a Saturday "this week" is already over and
  // the grid starts from the coming one (the day strip does the same).
  let gridStart = todaysDay === "saturday" ? addDays(now, 1) : now;
  let gridWeek = getWeek(gridStart);
  let isSubmitting = fetcher.state !== "idle";

  function reservationFor(day: string, week: number) {
    return desk.reservations.find((r) => r.day === day && r.week === week);
  }

  let todaysReservation = reservationFor(todaysDay, currentWeek);
  let borrower =
    todaysReservation && todaysReservation.users.id !== desk.user?.id
      ? todaysReservation.users
      : null;
  let showReserveForToday = !isWeekend && !todaysReservation;
  let sitter = todaysReservation?.users ?? null;
  let sitterIsMe = sitter?.id === userId;
  let today = isWeekend
    ? "Weekend"
    : !sitter
      ? "Free"
      : borrower
        ? "is borrowing it"
        : "is in";

  let weeks: { label: string; offset: 0 | 1 }[] = [
    { label: "This week", offset: 0 },
    { label: "Next week", offset: 1 },
  ];

  function handlePresentedChange(value: boolean) {
    if (value) setIsSmallDevice(isNarrow);
    setPresented(value);
  }

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      // Joins the page-level stack so the page sinks back behind the sheet.
      forComponent="closest"
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={handlePresentedChange}
    >
      <Sheet.Trigger asChild>{children}</Sheet.Trigger>

      <Sheet.Portal>
        <Sheet.View
          className="desk-sheet-view"
          // Exposed so tests (and anything else) can wait for the sheet to
          // come to rest before interacting with it.
          data-travel-status={travelStatus}
          onTravelStatusChange={setTravelStatus}
          contentPlacement={isSmallDevice ? "bottom" : "right"}
          tracks={isSmallDevice ? "bottom" : "right"}
          swipeOvershoot={isSmallDevice}
          nativeEdgeSwipePrevention
        >
          <Sheet.Backdrop
            className="desk-sheet-backdrop"
            themeColorDimming="auto"
          />
          <Sheet.Content
            className={cn(
              "desk-sheet-content",
              isSmallDevice
                ? "desk-sheet-content-bottom"
                : "desk-sheet-content-side",
            )}
          >
            <Sheet.BleedingBackground
              className={cn(
                "desk-sheet-bg",
                isSmallDevice && "desk-sheet-bg-bottom",
              )}
            />

            {/* Kept out of the scrolling body so it stays put on long content. */}
            {isSmallDevice ? (
              <Sheet.Handle
                className="desk-sheet-handle"
                action="dismiss"
                aria-label="Close"
              />
            ) : (
              <Sheet.Trigger
                action="dismiss"
                aria-label="Close"
                className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Sheet.Trigger>
            )}

            <div className="desk-sheet-body flex flex-col gap-4 font-display text-ink">
              <div>
                <Sheet.Title className="text-lg font-bold tracking-tight sm:text-xl">
                  {`Desk ${desk.block}.${desk.row}.${desk.column}`}
                </Sheet.Title>
                <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {`Block ${desk.block} · row ${desk.row} · ${placement[desk.column] ?? `column ${desk.column}`}`}
                </Sheet.Description>
              </div>

              <div className="grid gap-1">
                <span className="text-xs text-ink-muted">Assigned to</span>
                <p className="flex items-center gap-2 text-[15px] font-semibold capitalize">
                  {desk.user ? (
                    <>
                      <Avatar user={desk.user} />
                      {`${desk.user.firstName} ${desk.user.lastName || ""}`}
                    </>
                  ) : (
                    "None"
                  )}
                </p>
                {!desk.user && (
                  <span className="text-xs text-ink-muted">
                    Not assigned to anyone. Ask an admin (Christian, Sara,
                    Michael or Vaggelis) to make it yours.
                  </span>
                )}
              </div>

              <div className="grid gap-1">
                <span className="text-xs text-ink-muted">Today</span>
                {sitter ? (
                  <div className="flex items-center gap-2 text-[15px]">
                    <Avatar user={sitter} tone={sitterIsMe ? "moss" : "ink"} />
                    <p className="font-semibold capitalize">
                      {`${sitter.firstName} ${sitter.lastName}`}
                    </p>
                    <span className="text-ink-muted">{today}</span>
                  </div>
                ) : (
                  <p className="text-[15px] font-semibold">{today}</p>
                )}
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs text-ink-muted">Next two weeks</span>
                <div
                  aria-hidden="true"
                  className="flex gap-3 text-[11px] text-ink-muted"
                >
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block h-[9px] w-[14px] rounded-[2px] border border-ink bg-paper" />
                    Free
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block h-[9px] w-[14px] rounded-[2px] border border-ink bg-taken" />
                    Taken
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <i className="inline-block h-[9px] w-[14px] rounded-[2px] border border-moss-edge bg-moss" />
                    Yours
                  </span>
                </div>
                <div className="grid gap-1.5">
                  {weeks.map(({ label, offset }) => (
                    <div
                      key={label}
                      className="grid grid-cols-[60px_repeat(5,1fr)] items-center gap-1 text-[11px] text-ink-muted"
                    >
                      <span>{label}</span>
                      {workdaysOfWeek(gridStart, offset).map(
                        ({ day, date }) => (
                          <DayCell
                            key={day}
                            day={day}
                            date={date}
                            reservation={reservationFor(day, gridWeek + offset)}
                            isPast={isBefore(date, startOfDay(now))}
                            isSelected={formatDate(date) === selectedDay}
                            userId={userId}
                          />
                        ),
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                {allowedToReserve ? (
                  <>
                    <Button variant="primary" size="tall" asChild>
                      <Link to={`/reserve/${desk.id}`} prefetch="render">
                        Book days
                      </Link>
                    </Button>
                    <p className="text-center text-[13px] text-ink-muted">
                      This is your desk. Pick the days you'll be in.
                    </p>
                  </>
                ) : showReserveForToday ? (
                  <>
                    <fetcher.Form method="POST" action="/reserve">
                      <input type="hidden" name="deskId" value={desk.id} />
                      <input type="hidden" name="week" value={currentWeek} />
                      <input type="hidden" name={todaysDay} value="on" />

                      <Button
                        variant="primary"
                        size="tall"
                        className="w-full"
                        disabled={isSubmitting}
                        name="intent"
                        value="reserve-guest"
                        type="submit"
                      >
                        Reserve for today
                      </Button>
                    </fetcher.Form>
                    <p className="text-center text-[13px] text-ink-muted">
                      {desk.user
                        ? "Someone else's desk can only be borrowed for today."
                        : "An unclaimed desk can be borrowed for today."}
                    </p>
                  </>
                ) : (
                  <p className="text-center text-[13px] text-ink-muted">
                    {isWeekend
                      ? "Bookings open again on Monday."
                      : desk.user
                        ? "Taken today. Someone else's desk can only be borrowed for today."
                        : "Taken today."}
                  </p>
                )}

                {allowedToEdit && (
                  <Button variant="quiet" size="tall" asChild>
                    <Link to={`/desks/${desk.id}/edit`}>Edit desk info</Link>
                  </Button>
                )}
              </div>
            </div>
          </Sheet.Content>
        </Sheet.View>
      </Sheet.Portal>
    </Sheet.Root>
  );
}

function Avatar({
  user,
  tone = "ink",
}: {
  user: { firstName: string; lastName: string };
  tone?: "ink" | "moss";
}) {
  let initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`;

  // Drawn with a pseudo-element so the initials never join the name's text.
  return (
    <span
      aria-hidden="true"
      data-initials={initials}
      className={cn(
        "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold uppercase text-white before:content-[attr(data-initials)]",
        tone === "moss" ? "bg-moss" : "bg-taken",
      )}
    />
  );
}

function DayCell({
  day,
  date,
  reservation,
  isPast,
  isSelected,
  userId,
}: {
  day: Weekday;
  date: Date;
  reservation?: DeskSheetProps["desk"]["reservations"][number];
  isPast: boolean;
  isSelected: boolean;
  userId?: string;
}) {
  let status = reservation
    ? reservation.users.id === userId
      ? "yours"
      : "taken"
    : isPast
      ? "past"
      : "free";

  let who =
    status === "yours"
      ? "reserved by you"
      : status === "taken"
        ? `taken by ${reservation?.users.firstName}`
        : status;

  return (
    <span
      role="img"
      aria-label={`${format(date, "EEE d MMM")}, ${who}`}
      data-day={day}
      className={cn(
        "grid h-[26px] place-items-center rounded-[5px] border text-[11px] font-semibold",
        isSelected && "ring-2 ring-ink ring-offset-1",
        status === "free" && "border-ink bg-paper text-ink",
        status === "taken" && "border-ink bg-taken text-white",
        status === "yours" && "border-moss-edge bg-moss text-white",
        status === "past" && "border-line bg-paper-muted text-dim",
      )}
    >
      {date.getDate()}
    </span>
  );
}
