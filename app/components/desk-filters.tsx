import { addDays, format, isAfter, isWeekend, startOfDay } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  useLocation,
  useNavigation,
  useSearchParams,
  useSubmit,
} from "react-router";
import {
  defaultDay,
  formatDate,
  normalizeDay,
  parseDate,
  workdaysOfWeek,
} from "~/lib/dates";
import { cn } from "~/lib/utils";
import { useSlidingHighlight } from "./sliding-highlight";

// The day pill glides and settles without the dock's overshoot: in a tight
// strip a bounce pokes past the day and drifts back, which reads as a wobble.
// Labels change colour on the same curve so they turn white as the pill lands.
const DAY_EASE =
  "duration-[350ms] [transition-timing-function:cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none";

let COLUMNS = [
  { value: "1", label: "Window" },
  { value: "2", label: "Middle" },
  { value: "3", label: "Aisle" },
];

let BLOCKS = ["1", "2", "3", "4", "5", "6", "7"];

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

function chip(active: boolean) {
  return cn(
    "inline-flex h-11 shrink-0 cursor-pointer select-none items-center gap-1 rounded-full border px-3.5 text-xs font-semibold transition-colors sm:h-9",
    focusRing,
    active
      ? "border-moss bg-moss-soft text-ink"
      : "border-line bg-paper text-ink-muted hover:bg-paper-muted",
  );
}

/**
 * The filter chips under the day strip. Everything is a plain GET form field,
 * so the URL stays the source of truth and links to a filtered view keep
 * working. On phones the row scrolls sideways instead of wrapping.
 */
export function DeskFilters() {
  let [searchParams] = useSearchParams();
  let submit = useSubmit();
  let formRef = useRef<HTMLFormElement>(null);

  let column = searchParams.get("column") ?? "all";
  let block = searchParams.get("block") ?? "all";
  let showFree = searchParams.get("show-free") === "on";

  // The checkbox and select are controlled so they flip at once and keep
  // focus while the navigation runs, and resync from the URL afterwards
  // (Back/Forward included).
  let [showFreeValue, setShowFreeValue] = useState(showFree);
  let [blockValue, setBlockValue] = useState(block);
  useEffect(() => setShowFreeValue(showFree), [showFree]);
  useEffect(() => setBlockValue(block), [block]);

  function submitWith(overrides: Record<string, string>) {
    if (!formRef.current) return;

    let formData = new FormData(formRef.current);
    formData.set("column", column);
    for (let [key, value] of Object.entries(overrides)) {
      formData.set(key, value);
    }

    submit(formData, { preventScrollReset: true });
  }

  return (
    <Form
      ref={formRef}
      method="GET"
      preventScrollReset
      className="-mx-4 flex items-center gap-1.5 overflow-x-auto px-4 py-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0"
      onChange={() => submitWith({})}
    >
      {searchParams.has("selected-day") && (
        <input
          type="hidden"
          name="selected-day"
          value={searchParams.get("selected-day")!}
        />
      )}

      <label
        className={cn(
          chip(showFreeValue),
          "relative has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-moss has-[:focus-visible]:ring-offset-2",
        )}
      >
        <input
          type="checkbox"
          name="show-free"
          checked={showFreeValue}
          onChange={(event) => setShowFreeValue(event.target.checked)}
          aria-label="Free only"
          className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
        />
        <span aria-hidden="true">Free only</span>
      </label>

      {COLUMNS.map(({ value, label }) => {
        let active = column === value;

        return (
          <button
            key={value}
            type="submit"
            name="column"
            value={active ? "all" : value}
            aria-pressed={active}
            className={chip(active)}
            onClick={(event) => {
              event.preventDefault();
              submitWith({ column: active ? "all" : value });
            }}
          >
            {label}
          </button>
        );
      })}

      <label
        className={cn(
          chip(blockValue !== "all"),
          "relative pr-8 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-moss has-[:focus-visible]:ring-offset-2",
        )}
      >
        <span className="sr-only">Block</span>
        <select
          name="block"
          value={blockValue}
          onChange={(event) => setBlockValue(event.target.value)}
          className="absolute inset-0 cursor-pointer appearance-none text-base opacity-0"
        >
          <option value="all">All blocks</option>
          {BLOCKS.map((b) => (
            <option key={b} value={b}>
              Block {b}
            </option>
          ))}
        </select>
        <span aria-hidden="true">
          {blockValue === "all" ? "Block" : `Block ${blockValue}`}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute right-3 h-3.5 w-3.5"
        />
      </label>
    </Form>
  );
}

/**
 * Mon to Fri as a segmented control, with a link to flip between this week
 * and next (next Monday going forward, this Friday going back). The selected day lives in the `selected-day` search param and
 * defaults to today. On a weekend the strip already shows next week.
 */
export function DayStrip({
  today: todayParam,
  className,
}: {
  /** Today in `dd.MM.yyyy`, from the loader so server and client agree. */
  today?: string;
  className?: string;
}) {
  let [currentParams] = useSearchParams();
  let { pathname } = useLocation();
  let navigation = useNavigation();
  // Follow a day or week you just picked straight away, so the highlight
  // slides while the desks load instead of after.
  let searchParams =
    navigation.location?.pathname === pathname
      ? new URLSearchParams(navigation.location.search)
      : currentParams;
  let today = todayParam ? parseDate(todayParam) : new Date();
  // A missing or malformed param means today (the coming Monday on a
  // weekend), like the route.
  let selectedParam = normalizeDay(searchParams.get("selected-day"));
  let selected = selectedParam ? parseDate(selectedParam) : defaultDay(today);

  // Weeks start on Sunday, so on a Saturday "this week" is already over.
  // Count from Sunday instead, so the weekend works like Sunday does: the
  // strip shows the coming week and the arrow reaches the one after.
  let weekFrom = today.getDay() === 6 ? addDays(today, 1) : today;
  let thisWeek = workdaysOfWeek(weekFrom, 0);
  let nextWeek = workdaysOfWeek(weekFrom, 1);
  // Compared by calendar day: the strip's dates are midnight, `selected` is not.
  let inNextWeek = isAfter(startOfDay(selected), thisWeek[4].date);
  let days = inNextWeek ? nextWeek : thisWeek;
  let selectedKey = formatDate(selected);
  let todayKey = formatDate(today);

  function linkTo(date: Date) {
    let params = new URLSearchParams(searchParams);
    params.set("selected-day", formatDate(date));

    return `?${params}`;
  }

  // Going forward lands on next Monday, going back on this Friday, so the
  // pick sits next to the week you came from. Once this week is over there is
  // nothing to go back to, so Friday is never in the past here.
  let otherWeekDay = inNextWeek ? thisWeek[4].date : nextWeek[0].date;
  let thisWeekIsOver = isAfter(startOfDay(today), thisWeek[4].date);

  let canGoBack = inNextWeek && !thisWeekIsOver;

  // Keyed by weekday, so flipping the week slides the pill across too.
  let selectedWeekday = days.find(
    ({ date }) => formatDate(date) === selectedKey,
  )?.day;
  let { position, animate, itemRef } = useSlidingHighlight(selectedWeekday);

  return (
    <nav
      aria-label="Day"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap sm:gap-x-1.5",
        className,
      )}
    >
      <WeekArrow
        to={canGoBack ? linkTo(otherWeekDay) : undefined}
        label="Previous week"
      >
        <ChevronLeft className="h-4 w-4" />
      </WeekArrow>

      <div className="relative isolate grid w-full grid-cols-5 gap-1 sm:inline-flex sm:w-auto sm:gap-0.5 sm:rounded-full sm:border sm:border-line sm:bg-paper-muted sm:p-[3px]">
        {position && (
          <span
            aria-hidden
            className={cn(
              "absolute left-0 top-0 rounded-lg bg-ink sm:rounded-full",
              animate && cn("transition-[transform,width,height]", DAY_EASE),
            )}
            style={{
              width: position.width,
              height: position.height,
              transform: `translate(${position.left}px, ${position.top}px)`,
            }}
          />
        )}
        {days.map(({ day, date }) => {
          let key = formatDate(date);
          return (
            <DayPill
              key={day}
              date={date}
              to={linkTo(date)}
              isSelected={key === selectedKey}
              isPast={key !== todayKey && date < today}
              measured={!!position}
              pillRef={itemRef(day)}
            />
          );
        })}
      </div>

      <WeekArrow
        to={inNextWeek ? undefined : linkTo(otherWeekDay)}
        label="Next week"
      >
        <ChevronRight className="h-4 w-4" />
      </WeekArrow>

      {!(inNextWeek && thisWeekIsOver) && (
        <Link
          to={linkTo(otherWeekDay)}
          preventScrollReset
          className={cn(
            "inline-flex min-h-11 items-center rounded-sm text-[13px] font-semibold text-ink-muted hover:text-ink sm:hidden",
            focusRing,
          )}
        >
          {inNextWeek
            ? `← ${isWeekend(today) ? "Upcoming week" : "This week"}`
            : "Next week →"}
        </Link>
      )}
    </nav>
  );
}

/** A round arrow beside the day strip, desktop only. Greyed out without `to`. */
function WeekArrow({
  to,
  label,
  children,
}: {
  to?: string;
  label: string;
  children: React.ReactNode;
}) {
  let className =
    "hidden h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-muted sm:grid";

  if (!to) {
    return (
      <span aria-hidden="true" className={cn(className, "opacity-40")}>
        {children}
      </span>
    );
  }

  return (
    <Link
      to={to}
      preventScrollReset
      aria-label={label}
      className={cn(
        className,
        "hover:bg-paper-muted hover:text-ink",
        focusRing,
      )}
    >
      {children}
    </Link>
  );
}

/** One day in the strip: a link, or a struck-through label once it has passed. */
function DayPill({
  date,
  to,
  isSelected,
  isPast,
  measured,
  pillRef,
}: {
  date: Date;
  to: string;
  isSelected: boolean;
  isPast: boolean;
  /** The sliding pill has been measured and draws the fill. */
  measured: boolean;
  pillRef: (node: HTMLElement | null) => void;
}) {
  let className = cn(
    // On phones each day is a tile. Its fill sits in a layer behind the
    // sliding pill, so the pill stays in view as it crosses the tiles.
    "relative grid h-11 place-items-center rounded-lg text-center text-xs font-bold transition-colors before:absolute before:inset-0 before:-z-10 before:rounded-lg before:border before:border-line before:bg-paper-muted sm:h-auto sm:rounded-full sm:px-3 sm:py-1.5 sm:text-[13px] sm:font-semibold sm:before:hidden",
    DAY_EASE,
    focusRing,
    isSelected
      ? // The sliding pill draws the fill once it has been measured.
        cn("text-white", !measured && "bg-ink")
      : "text-ink-muted hover:text-ink",
  );

  // Past days cannot be booked and their reservations are cleaned up,
  // so they are shown but not offered.
  if (isPast && !isSelected) {
    return (
      <span
        ref={pillRef}
        aria-disabled="true"
        aria-label={`${format(date, "EEEE d MMMM")}, past`}
        className={cn(
          className,
          "text-dim line-through decoration-1 before:hidden hover:text-dim",
        )}
      >
        {format(date, "EEE")}
      </span>
    );
  }

  return (
    <Link
      ref={pillRef}
      to={to}
      preventScrollReset
      aria-current={isSelected ? "date" : undefined}
      aria-label={format(date, "EEEE d MMMM")}
      className={className}
    >
      {format(date, "EEE")}
    </Link>
  );
}
