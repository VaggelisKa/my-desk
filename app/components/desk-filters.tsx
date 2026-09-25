import { format, isAfter, startOfDay } from "date-fns";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useSearchParams, useSubmit } from "react-router";
import {
  formatDate,
  normalizeDay,
  parseDate,
  workdaysOfWeek,
} from "~/lib/dates";
import { cn } from "~/lib/utils";

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
  let [searchParams] = useSearchParams();
  let today = todayParam ? parseDate(todayParam) : new Date();
  // A missing or malformed param means today, like the route.
  let selectedParam = normalizeDay(searchParams.get("selected-day"));
  let selected = selectedParam ? parseDate(selectedParam) : today;

  let thisWeek = workdaysOfWeek(today, 0);
  let nextWeek = workdaysOfWeek(today, 1);
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

  return (
    <nav
      aria-label="Day"
      className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", className)}
    >
      <div className="grid w-full grid-cols-5 gap-1 sm:inline-flex sm:w-auto sm:gap-0.5 sm:rounded-full sm:border sm:border-line sm:bg-paper-muted sm:p-[3px]">
        {days.map(({ day, date }) => {
          let key = formatDate(date);
          let isSelected = key === selectedKey;
          let isPast = key !== todayKey && date < today;
          let className = cn(
            "grid h-11 place-items-center rounded-lg border border-line bg-paper-muted text-center text-xs font-bold transition-colors sm:h-auto sm:rounded-full sm:border-0 sm:bg-transparent sm:px-3 sm:py-1.5 sm:text-[13px] sm:font-semibold",
            focusRing,
            isSelected
              ? "border-ink bg-ink text-white sm:bg-ink"
              : "text-ink-muted hover:text-ink",
          );

          // Past days cannot be booked and their reservations are cleaned up,
          // so they are shown but not offered.
          if (isPast && !isSelected) {
            return (
              <span
                key={day}
                aria-disabled="true"
                aria-label={`${format(date, "EEEE d MMMM")}, past`}
                className={cn(
                  className,
                  "border-transparent bg-transparent text-dim line-through decoration-1 hover:text-dim",
                )}
              >
                {format(date, "EEE")}
              </span>
            );
          }

          return (
            <Link
              key={day}
              to={linkTo(date)}
              preventScrollReset
              aria-current={isSelected ? "date" : undefined}
              aria-label={format(date, "EEEE d MMMM")}
              className={className}
            >
              {format(date, "EEE")}
            </Link>
          );
        })}
      </div>

      {!(inNextWeek && thisWeekIsOver) && (
        <Link
          to={linkTo(otherWeekDay)}
          preventScrollReset
          className={cn(
            "inline-flex min-h-11 items-center rounded-sm text-[13px] font-semibold text-ink-muted hover:text-ink sm:min-h-0",
            focusRing,
          )}
        >
          {inNextWeek ? "← This week" : "Next week →"}
        </Link>
      )}
    </nav>
  );
}
