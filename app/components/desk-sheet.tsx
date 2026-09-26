import { Sheet } from "@silk-hq/components";
import { addDays, format, isBefore, isSameDay } from "date-fns";
import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { Button } from "~/components/ui/button";
import {
  formatDate,
  LAST_BOOKING_HOUR,
  parseDate,
  workdaysOfWeek,
  type Weekday,
} from "~/lib/dates";
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
  /** The signed-in user, to show their own bookings in moss. */
  userId?: string;
  /** The day shown on the map, in `dd.MM.yyyy`; marked in the two-week grid. */
  selectedDay?: string;
  /**
   * Today in `dd.MM.yyyy`, from the loader, so the sheet agrees with the map
   * and the server on which day it is even when the browser's clock or
   * timezone does not.
   */
  today?: string;
  /** Placement in the floor plan; Silk wraps the tile, so it goes on the wrapper. */
  style?: React.CSSProperties;
  /** Opens the sheet once the page is interactive, for links to a desk. */
  autoOpen?: boolean;
  onClose?: () => void;
};

// On a weekend the first row is the week ahead, so it is not "this" week.
function weekRows(isWeekend: boolean): { label: string; offset: 0 | 1 }[] {
  return [
    { label: isWeekend ? "Upcoming week" : "This week", offset: 0 },
    { label: "Next week", offset: 1 },
  ];
}

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
  1: "By the window",
  2: "In the middle",
  3: "By the aisle",
};

/**
 * Desk detail as a Silk sheet: from the bottom on phones, from the right on
 * larger screens. Shows who the desk belongs to, who has it today and the next
 * two weeks. The owner books days straight from that grid; anyone else can
 * take a free desk for today.
 */
export function DeskSheet({
  desk,
  children,
  allowedToReserve,
  userId,
  selectedDay,
  today: todayValue,
  style,
  autoOpen = false,
  onClose,
}: DeskSheetProps) {
  let [presented, setPresented] = useState(false);
  let [picked, setPicked] = useState<string[]>([]);
  let [travelStatus, setTravelStatus] = useState<TravelStatus>("idleOutside");
  // Same breakpoint as the phone dock. Captured when the sheet
  // opens so rotating a phone mid-way does not flip the placement.
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);
  let fetcher = useFetcher();
  let now = new Date();
  let todayDate = parseDate(todayValue ?? formatDate(now));
  let todaysDay = days[todayDate.getDay()];
  let isWeekend = todaysDay === "saturday" || todaysDay === "sunday";
  // Weeks start on Sunday, so on a Saturday "this week" is already over and
  // the grid starts from the coming one (the day strip does the same).
  let gridStart = todaysDay === "saturday" ? addDays(todayDate, 1) : todayDate;
  let isSubmitting = fetcher.state !== "idle";

  // By the full date: week numbers restart around New Year, so "next week"
  // is not always this week's number plus one.
  function reservationOn(date: Date) {
    let value = formatDate(date);
    return desk.reservations.find((r) => r.date === value);
  }

  let grid = weekRows(isWeekend).map(({ label, offset }) => ({
    label,
    days: workdaysOfWeek(gridStart, offset).map(({ day, date }) => {
      let reservation = reservationOn(date);
      let isPast = isBefore(date, todayDate);
      let isClosed =
        isPast ||
        (isSameDay(date, todayDate) && now.getHours() >= LAST_BOOKING_HOUR);

      return {
        day,
        date,
        value: formatDate(date),
        reservation,
        isPast,
        bookable: !!allowedToReserve && !reservation && !isClosed,
      };
    }),
  }));

  // Days booked in the meantime (by this sheet or anyone else) drop out of
  // the pick on their own once the grid revalidates.
  let bookable = new Set(
    grid.flatMap(({ days }) =>
      days.filter((d) => d.bookable).map((d) => d.value),
    ),
  );
  let pickedDays = picked.filter((value) => bookable.has(value));

  function togglePick(value: string) {
    setPicked((current) =>
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  }

  let todaysReservation = reservationOn(todayDate);
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

  function handlePresentedChange(value: boolean) {
    if (value) {
      setIsSmallDevice(isNarrow);
    } else {
      setPicked([]);
      onClose?.();
    }
    setPresented(value);
  }

  useEffect(() => {
    if (autoOpen) handlePresentedChange(true);
    // Only when a link asks for it, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpen]);

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      // Bottom sheets join the page-level stack so the page sinks back behind
      // them. The side sheet stays out: the stack would put a no-op transform
      // on the page and make it flicker.
      forComponent={isSmallDevice ? "closest" : undefined}
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={handlePresentedChange}
      style={style}
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
          {isSmallDevice && (
            <Sheet.Outlet
              className="desk-sheet-blur"
              travelAnimation={{ opacity: [0, 1] }}
            />
          )}
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

            <div className="desk-sheet-body flex flex-col gap-5 font-display text-ink">
              <div>
                <Sheet.Title className="text-lg font-bold tracking-tight sm:text-xl">
                  {`Desk ${desk.block}.${desk.row}.${desk.column}`}
                </Sheet.Title>
                <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {/* The title already gives block and row, so only say where. */}
                  {placement[desk.column] ?? `Column ${desk.column}`}
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
                  <p className="text-[13px] text-ink-muted">
                    Ask an admin (Christian, Sara, Michael or Vaggelis) to make
                    it yours.
                  </p>
                )}
              </div>

              <div className="grid gap-1">
                <span className="text-xs text-ink-muted">Today</span>
                {sitter ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[15px]">
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

              <fetcher.Form
                method="POST"
                action="/?index"
                className="flex flex-col gap-6"
              >
                <input type="hidden" name="deskId" value={desk.id} />

                <fieldset className="grid gap-3">
                  <legend className="mb-3 flex w-full justify-between text-xs text-ink-muted">
                    <span>
                      {allowedToReserve ? "Book days" : "Next two weeks"}
                    </span>
                    {allowedToReserve && bookable.size > 0 && (
                      <span aria-hidden="true">Tap to pick</span>
                    )}
                  </legend>

                  <div
                    aria-hidden="true"
                    className="grid grid-cols-[80px_repeat(5,1fr)] gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-muted"
                  >
                    <span />
                    {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                      <span key={d}>{d}</span>
                    ))}
                  </div>

                  {grid.map(({ label, days }) => (
                    <div
                      key={label}
                      className="grid grid-cols-[80px_repeat(5,1fr)] items-center gap-1.5 text-[11px] text-ink-muted"
                    >
                      <span>{label}</span>
                      {days.map((d) =>
                        d.bookable ? (
                          <DayToggle
                            key={d.day}
                            date={d.date}
                            value={d.value}
                            checked={pickedDays.includes(d.value)}
                            onChange={() => togglePick(d.value)}
                          />
                        ) : (
                          <DayCell
                            key={d.day}
                            day={d.day}
                            date={d.date}
                            reservation={d.reservation}
                            isPast={d.isPast}
                            isSelected={d.value === selectedDay}
                            userId={userId}
                          />
                        ),
                      )}
                    </div>
                  ))}

                  <DayLegend />
                </fieldset>

                {allowedToReserve
                  ? bookable.size > 0 && (
                      <Button
                        variant="primary"
                        size="tall"
                        className="w-full"
                        disabled={isSubmitting || pickedDays.length === 0}
                        type="submit"
                      >
                        {isSubmitting
                          ? "Booking..."
                          : pickedDays.length === 0
                            ? "Pick days to book"
                            : `Book ${pickedDays.length} ${pickedDays.length === 1 ? "day" : "days"}`}
                      </Button>
                    )
                  : showReserveForToday && (
                      <>
                        <input
                          type="hidden"
                          name="date"
                          value={formatDate(todayDate)}
                        />
                        <Button
                          variant="primary"
                          size="tall"
                          className="w-full"
                          disabled={isSubmitting}
                          type="submit"
                        >
                          Reserve for today
                        </Button>
                      </>
                    )}
              </fetcher.Form>
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

  // A readout, not a control: the date over a status bar, with no box
  // around it so it never looks tappable.
  return (
    <span
      role="img"
      aria-label={`${format(date, "EEE d MMM")}, ${who}`}
      data-day={day}
      className={cn(
        "grid h-9 content-center justify-items-center gap-1 rounded-md text-[13px] font-semibold",
        isSelected && "bg-paper-muted",
        status === "past" ? "text-dim" : "text-ink",
      )}
    >
      {date.getDate()}
      <i
        aria-hidden="true"
        className={cn(
          "block h-1 w-[70%] rounded-full",
          status === "free" && "ring-1 ring-inset ring-line",
          status === "taken" && "bg-taken",
          status === "yours" && "bg-moss",
        )}
      />
    </span>
  );
}

/** A free day the owner can still book, as a real checkbox. */
function DayToggle({
  date,
  value,
  checked,
  onChange,
}: {
  date: Date;
  value: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={cn(
        "relative grid h-9 cursor-pointer place-items-center rounded-lg border-[1.5px] text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-moss has-[:focus-visible]:ring-offset-2",
        checked
          ? "border-moss-edge bg-moss text-white"
          : "border-dashed border-mist-edge bg-paper text-ink hover:bg-paper-muted",
      )}
    >
      <input
        type="checkbox"
        name="date"
        value={value}
        checked={checked}
        onChange={onChange}
        aria-label={`${format(date, "EEE d MMM")}, free`}
        // Invisible but covering the chip, so taps (and test clicks) land on
        // the real checkbox without scrolling to a clipped 1px box.
        className="absolute inset-0 cursor-pointer appearance-none rounded-lg opacity-0"
      />
      {date.getDate()}
      {checked && (
        <span
          aria-hidden="true"
          className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border-[1.5px] border-paper bg-moss-edge text-white"
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </span>
      )}
    </label>
  );
}

function DayLegend() {
  let bar = "inline-block h-1 w-3.5 rounded-full";

  return (
    <div
      aria-hidden="true"
      className="mt-1 flex flex-wrap gap-4 text-[11px] text-ink-muted"
    >
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(bar, "ring-1 ring-inset ring-line")} /> Free
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(bar, "bg-taken")} /> Taken
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(bar, "bg-moss")} /> Yours
      </span>
    </div>
  );
}
