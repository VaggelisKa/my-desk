import {
  addDays,
  differenceInCalendarDays,
  format,
  isSameMonth,
  startOfWeek,
} from "date-fns";
import { X } from "lucide-react";
import { NavLink, useFetcher, useLocation, useNavigation } from "react-router";
import { parseDate } from "~/lib/dates";
import { capitalize, cn, deskLabel, enterAt } from "~/lib/utils";

// The Bookings tab (design/design-options.html, "My reservations" and
// "Bookings"): one heading and an Upcoming · Recurring switch. The tab is
// self-contained, with no actions that send you to another tab. Upcoming is
// /reservations and Recurring is /automatic-reservations, so both keep their
// own loader and action.

export type OwnDesk = {
  id: number;
  block: number;
  row: number;
  column: number;
};

let placement: Record<number, string> = {
  1: "by the window",
  2: "in the middle",
  3: "by the aisle",
};

// One word each, for where a row has little room.
let shortPlacement: Record<number, string> = {
  1: "window",
  2: "middle",
  3: "aisle",
};

export function deskPlace(
  desk: { block: number; column: number },
  { short = false } = {},
) {
  let where = (short ? shortPlacement : placement)[desk.column];
  return `Block ${desk.block} · ${where ?? `column ${desk.column}`}`;
}

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

export function BookingsHeader({ desk }: { desk: OwnDesk | null }) {
  return (
    <header className="flex flex-col gap-5">
      {/* No actions that jump to another tab: booking happens on Desks. */}
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        Bookings
      </h1>

      {/* Recurring only makes sense with a desk of your own to repeat. */}
      {desk && <SegmentSwitch />}
    </header>
  );
}

let SEGMENTS = [
  { to: "/reservations", label: "Upcoming" },
  { to: "/automatic-reservations", label: "Recurring" },
];

/**
 * A sliding switch between sibling pages, like Upcoming · Recurring. Each tab
 * keeps it in its layout, so it stays mounted across the switch and the pill
 * slides rather than jumps. It moves as soon as you tap, not when the other
 * page has loaded, like the dock.
 */
export function SegmentSwitch({
  label = "Bookings",
  segments = SEGMENTS,
}: {
  label?: string;
  segments?: { to: string; label: string }[];
}) {
  let location = useLocation();
  let navigation = useNavigation();
  let pathname = navigation.location?.pathname ?? location.pathname;
  let active = Math.max(
    0,
    segments.findIndex((segment) => segment.to === pathname),
  );

  return (
    <nav
      aria-label={label}
      className="relative grid self-start rounded-full bg-paper-muted p-1 ring-1 ring-inset ring-line"
      style={{
        width: `${segments.length * 112 + 8}px`,
        maxWidth: "100%",
        gridTemplateColumns: `repeat(${segments.length}, minmax(0, 1fr))`,
      }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1 rounded-full bg-paper shadow-[0_1px_3px_rgb(31_42_46/0.14)] ring-1 ring-line transition-transform duration-500 [transition-timing-function:cubic-bezier(0.34,1.36,0.64,1)] motion-reduce:transition-none"
        style={{
          width: `calc(${100 / segments.length}% - ${8 / segments.length}px)`,
          transform: `translateX(${active * 100}%)`,
        }}
      />
      {segments.map(({ to, label }, index) => (
        <NavLink
          key={to}
          to={to}
          end
          prefetch="intent"
          preventScrollReset
          className={cn(
            "relative inline-flex h-9 items-center justify-center rounded-full px-3 text-[13px] font-semibold transition-colors duration-300",
            focusRing,
            index === active ? "text-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          {label}
        </NavLink>
      ))}
    </nav>
  );
}

/** The desk as a small slab, the same shapes and colours as the map. */
export function DeskChip({
  label,
  tone,
}: {
  label: string;
  tone: "mine" | "taken" | "free";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid h-8 min-w-[48px] shrink-0 place-items-center rounded border-[1.5px] px-1.5 text-[11px] font-bold tracking-[0.03em]",
        tone === "mine" &&
          "border-moss-edge bg-moss text-white shadow-[0_3px_0_var(--moss-edge)]",
        tone === "taken" &&
          "border-ink bg-taken text-white shadow-[0_3px_0_var(--ink)]",
        tone === "free" &&
          "border-ink bg-paper text-ink shadow-[0_3px_0_var(--ink)]",
      )}
    >
      {label}
    </span>
  );
}

export type Booking = {
  deskId: number;
  day: string;
  date: string;
  userId: string;
  desk: { block: number; row: number; column: number };
  /** First name of the desk's owner, when it is not you. */
  ownerName: string | null;
  mine: boolean;
};

type Week = { key: string; label: string; range: string; bookings: Booking[] };

function weekRange(monday: Date) {
  let friday = addDays(monday, 4);
  return isSameMonth(monday, friday)
    ? `${format(monday, "d")}–${format(friday, "d MMM")}`
    : `${format(monday, "d MMM")} – ${format(friday, "d MMM")}`;
}

/** Bookings grouped into Sunday-start weeks, like the rest of the app. */
function groupByWeek(bookings: Booking[], today: Date): Week[] {
  let thisWeek = startOfWeek(today);
  let weeks = new Map<string, Week>();

  for (let booking of bookings) {
    let sunday = startOfWeek(parseDate(booking.date));
    let key = format(sunday, "yyyy-MM-dd");
    let offset = Math.round(differenceInCalendarDays(sunday, thisWeek) / 7);
    let monday = addDays(sunday, 1);

    if (!weeks.has(key)) {
      weeks.set(key, {
        key,
        label:
          offset === 0
            ? "This week"
            : offset === 1
              ? "Next week"
              : `Week of ${format(monday, "d MMM")}`,
        range: weekRange(monday),
        bookings: [],
      });
    }
    weeks.get(key)!.bookings.push(booking);
  }

  return [...weeks.values()];
}

function relativeDay(date: Date, today: Date) {
  let diff = differenceInCalendarDays(date, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return format(date, "EEEE");
}

export function BookingList({
  bookings,
  today,
}: {
  bookings: Booking[];
  /** Today in `dd.MM.yyyy`, from the loader so server and client agree. */
  today: string;
}) {
  let todayDate = parseDate(today);

  return (
    <div className="flex flex-col gap-8">
      {groupByWeek(bookings, todayDate).map((week, index) => (
        <section
          key={week.key}
          aria-labelledby={`week-${week.key}`}
          className="enter flex flex-col gap-2.5"
          style={enterAt(index)}
        >
          <h2
            id={`week-${week.key}`}
            className="flex items-baseline gap-2 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted"
          >
            {week.label}
            <span className="font-medium normal-case tracking-normal text-dim">
              {week.range}
            </span>
          </h2>
          <ul className="flex flex-col overflow-hidden rounded-xl border border-line bg-paper">
            {week.bookings.map((booking) => (
              <BookingRow
                key={`${booking.deskId}-${booking.date}`}
                booking={booking}
                today={todayDate}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function BookingRow({ booking, today }: { booking: Booking; today: Date }) {
  let fetcher = useFetcher();
  let date = parseDate(booking.date);
  let isToday = differenceInCalendarDays(date, today) === 0;
  let removing = fetcher.state !== "idle";
  let label = deskLabel(booking.desk);
  let title = booking.mine
    ? "Your desk"
    : booking.ownerName
      ? `${capitalize(booking.ownerName)}'s desk`
      : `Desk ${label}`;
  // Only today can be borrowed, so a borrowed row needs no date of its own.
  let detail = (short: boolean) =>
    booking.mine
      ? deskPlace(booking.desk, { short })
      : short
        ? `Borrowed · block ${booking.desk.block}`
        : `${deskPlace(booking.desk)} · borrowed for today`;

  // Hidden straight away; if the delete fails the loader brings it back.
  if (removing) {
    return null;
  }

  return (
    <li
      data-date={booking.date}
      className={cn(
        "grid grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-x-3 border-b border-line px-4 py-3.5 last:border-b-0 sm:grid-cols-[88px_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-5",
      )}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[15px] font-bold leading-tight">
          {format(date, "EEE d")}
        </span>
        <span
          className={cn(
            "text-xs leading-tight text-ink-muted",
            isToday && "font-semibold text-moss-edge",
          )}
        >
          {relativeDay(date, today)}
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-3">
        <DeskChip label={label} tone={booking.mine ? "mine" : "taken"} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-sm font-semibold leading-tight">
            {title}
            {/* The chip is hidden from screen readers, so say the number once. */}
            {title !== `Desk ${label}` && (
              <span className="sr-only">{`, desk ${label}`}</span>
            )}
          </span>
          <span className="truncate text-xs leading-tight text-ink-muted">
            <span className="sm:hidden">{detail(true)}</span>
            <span className="hidden sm:inline">{detail(false)}</span>
          </span>
        </div>
      </div>

      <fetcher.Form method="DELETE" action="/reservations">
        <input type="hidden" name="reservation-date" value={booking.date} />
        <input
          type="hidden"
          name="reservation-user-id"
          value={booking.userId}
        />
        <input type="hidden" name="reservation-day" value={booking.day} />
        <input type="hidden" name="desk-id" value={booking.deskId} />
        <button
          type="submit"
          aria-label={`Remove ${format(date, "EEE d MMM")}, desk ${label}`}
          className={cn(
            "-mr-1.5 inline-grid size-10 place-items-center rounded-lg text-[13px] font-semibold text-ink-muted transition-colors hover:bg-paper-muted hover:text-danger sm:mr-0 sm:inline-flex sm:h-9 sm:w-auto sm:px-3",
            focusRing,
          )}
        >
          {/* A quiet cross on phones, where the row has no room for a word. */}
          <X aria-hidden="true" className="size-[18px] sm:hidden" />
          <span aria-hidden="true" className="hidden sm:inline">
            Remove
          </span>
        </button>
      </fetcher.Form>
    </li>
  );
}

export function EmptyBookings({ desk }: { desk: OwnDesk | null }) {
  return (
    <div className="enter flex flex-col gap-1.5 rounded-xl border border-dashed border-line bg-paper px-5 py-8 sm:px-8 sm:py-10">
      <h2 className="text-[15px] font-bold">Nothing booked yet</h2>
      <p className="max-w-[46ch] text-pretty text-sm leading-relaxed text-ink-muted">
        {desk
          ? "Days you book on the Desks tab show up here, along with the ones your weekly booking under Recurring takes care of."
          : "When you take a free desk on the Desks tab, it shows up here."}
      </p>
    </div>
  );
}
