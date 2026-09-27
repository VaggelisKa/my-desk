import { differenceInCalendarDays, format } from "date-fns";
import { X } from "lucide-react";
import { useState } from "react";
import { useFetcher } from "react-router";
import {
  type AdminData,
  focusRing,
  fullName,
  groupHeading,
  type Index,
  listClass,
  matches,
  NothingFound,
  rowButton,
  SearchField,
  tableWrap,
  td,
  useIndex,
} from "~/components/admin/shared";
import { ConfirmAction } from "~/components/admin/sheets";
import { DeskChip } from "~/components/desk-chip";
import type { AdminBooking } from "~/lib/admin.server";
import { parseDate } from "~/lib/dates";
import { focusNeighbour } from "~/lib/focus";
import { cn, deskLabel, plural } from "~/lib/utils";

// Admin › Bookings: every upcoming booking grouped by day.

function dayHeading(date: Date, today: Date) {
  let diff = differenceInCalendarDays(date, today);
  let prefix = diff === 0 ? "Today · " : diff === 1 ? "Tomorrow · " : "";
  return `${prefix}${format(date, "EEE d MMM")}`;
}

export function BookingsByDay({ data }: { data: AdminData }) {
  let index = useIndex(data);
  let [query, setQuery] = useState("");
  let shown = data.bookings.filter((booking) => {
    let person = index.people.get(booking.userId);
    let desk = index.desks.get(booking.deskId);
    return matches(
      query,
      person && fullName(person),
      booking.userId,
      desk && deskLabel(desk),
    );
  });
  let days = [...new Set(shown.map((b) => b.date))];

  return (
    <div className="flex flex-col gap-6">
      <SearchField
        id="admin-bookings-search"
        label="Search person or desk"
        value={query}
        onChange={setQuery}
        results={plural(shown.length, "booking")}
      />

      {data.bookings.length === 0 ? (
        <NothingFound>Nothing is booked from today on.</NothingFound>
      ) : days.length === 0 ? (
        <NothingFound>No booking matches “{query.trim()}”.</NothingFound>
      ) : null}

      {days.map((date) => {
        let dayBookings = shown.filter((b) => b.date === date);
        let all = data.bookings.filter((b) => b.date === date).length;
        let label = dayHeading(parseDate(date), index.today);

        return (
          <section
            key={date}
            aria-label={label}
            data-admin-day={label}
            className="flex flex-col gap-2.5 md:hidden"
          >
            <div className={groupHeading}>
              <h2>
                {label}
                <span className="ml-2 font-medium normal-case tracking-normal text-ink-muted">
                  {plural(all, "booking")}
                </span>
              </h2>
              <ConfirmAction
                label="Clear day"
                question={`Cancel all ${plural(all, "booking")} on ${format(parseDate(date), "EEEE d MMM")}?`}
                confirmLabel={`Clear ${plural(all, "booking")}`}
                fields={{ intent: "clear-day", date }}
              />
            </div>
            <ul className={listClass}>
              {dayBookings.map((booking) => (
                <BookingRow
                  key={`${booking.deskId}-${booking.date}`}
                  booking={booking}
                  index={index}
                  show="both"
                />
              ))}
            </ul>
          </section>
        );
      })}

      {days.length > 0 && (
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead className="sr-only">
              <tr>
                <th>Desk</th>
                <th>Person</th>
                <th>Kind</th>
                <th>Actions</th>
              </tr>
            </thead>
            {days.map((date, i) => {
              let dayBookings = shown.filter((b) => b.date === date);
              let all = data.bookings.filter((b) => b.date === date).length;
              let label = dayHeading(parseDate(date), index.today);

              return (
                <tbody key={date} data-admin-day={label}>
                  <tr
                    className={cn(
                      "bg-paper-muted",
                      i > 0 && "border-t border-line",
                    )}
                  >
                    <th
                      colSpan={4}
                      scope="colgroup"
                      className="px-4 py-2 text-left"
                    >
                      <div className={cn(groupHeading, "px-0")}>
                        <span>
                          {label}
                          <span className="ml-2 font-medium normal-case tracking-normal text-ink-muted">
                            {plural(all, "booking")}
                          </span>
                        </span>
                        <ConfirmAction
                          label="Clear day"
                          question={`Cancel all ${plural(all, "booking")} on ${format(parseDate(date), "EEEE d MMM")}?`}
                          confirmLabel={`Clear ${plural(all, "booking")}`}
                          fields={{ intent: "clear-day", date }}
                        />
                      </div>
                    </th>
                  </tr>
                  {dayBookings.map((booking) => (
                    <BookingTableRow
                      key={`${booking.deskId}-${booking.date}`}
                      booking={booking}
                      index={index}
                    />
                  ))}
                </tbody>
              );
            })}
          </table>
        </div>
      )}
    </div>
  );
}

function BookingTableRow({
  booking,
  index,
}: {
  booking: AdminBooking;
  index: Index;
}) {
  let fetcher = useFetcher();
  let person = index.people.get(booking.userId);
  let desk = index.desks.get(booking.deskId);
  let name = person ? fullName(person) : booking.userId;
  let label = desk ? deskLabel(desk) : String(booking.deskId);
  let borrowed = desk?.owner?.id !== booking.userId;
  let when = format(parseDate(booking.date), "EEE d MMM");

  // Hidden straight away; if cancelling fails the loader brings it back.
  if (fetcher.state !== "idle") {
    return null;
  }

  return (
    <tr className="border-t border-line hover:bg-paper-muted">
      <td className={cn(td, "w-px")}>
        <DeskChip label={label} tone={borrowed ? "taken" : "mine"} />
        <span className="sr-only">{label}</span>
      </td>
      <td className={td}>
        <span className="font-semibold capitalize">{name}</span>
        <span className="ml-2 text-ink-muted">{booking.userId}</span>
      </td>
      <td className={cn(td, "text-ink-muted")}>
        {borrowed ? "Borrowed" : "Own desk"}
      </td>
      <td className={cn(td, "w-px pr-2")}>
        <fetcher.Form
          method="post"
          action="/admin"
          onSubmit={(event) =>
            focusNeighbour(event.currentTarget, "[data-cancel-booking]")
          }
        >
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="deskId" value={booking.deskId} />
          <input type="hidden" name="date" value={booking.date} />
          <input type="hidden" name="userId" value={booking.userId} />
          <button
            type="submit"
            data-cancel-booking
            aria-label={`Cancel ${name}'s booking on ${when}, desk ${label}`}
            className={cn(rowButton, "hover:text-danger")}
          >
            Cancel
          </button>
        </fetcher.Form>
      </td>
    </tr>
  );
}

/** A booking's line: who, which desk, or both, with a cancel button. */
function BookingRow({
  booking,
  index,
  show,
}: {
  booking: AdminBooking;
  index: Index;
  show: "person" | "desk" | "both";
}) {
  let fetcher = useFetcher();
  let person = index.people.get(booking.userId);
  let desk = index.desks.get(booking.deskId);
  let date = parseDate(booking.date);
  let name = person ? fullName(person) : booking.userId;
  let label = desk ? deskLabel(desk) : String(booking.deskId);
  let borrowed = desk?.owner?.id !== booking.userId;
  let when = format(date, "EEE d MMM");

  // Hidden straight away; if cancelling fails the loader brings it back.
  if (fetcher.state !== "idle") {
    return null;
  }

  let { title, detail } = bookingRowText({ show, when, name, label, borrowed });

  return (
    <li className="flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 sm:px-5">
      {show === "both" && (
        <DeskChip label={label} tone={borrowed ? "taken" : "mine"} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-sm font-semibold leading-tight",
            show !== "desk" && "capitalize",
          )}
        >
          {title}
          {show === "both" && (
            <span className="sr-only">{`, desk ${label}`}</span>
          )}
        </span>
        <span className="truncate text-xs leading-tight text-ink-muted">
          {detail}
        </span>
      </div>
      <fetcher.Form
        method="post"
        action="/admin"
        onSubmit={(event) =>
          focusNeighbour(
            event.currentTarget,
            "[data-cancel-booking]",
            event.currentTarget.closest<HTMLElement>("[data-sheet-step]"),
          )
        }
      >
        <input type="hidden" name="intent" value="cancel" />
        <input type="hidden" name="deskId" value={booking.deskId} />
        <input type="hidden" name="date" value={booking.date} />
        <input type="hidden" name="userId" value={booking.userId} />
        <button
          type="submit"
          data-cancel-booking
          aria-label={`Cancel ${name}'s booking on ${when}, desk ${label}`}
          className={cn(
            "-mr-1.5 inline-grid size-10 place-items-center rounded-lg text-[13px] font-semibold text-ink-muted transition-colors hover:bg-paper-muted hover:text-danger sm:mr-0 sm:inline-flex sm:h-9 sm:w-auto sm:px-3",
            focusRing,
          )}
        >
          <X aria-hidden="true" className="size-[18px] sm:hidden" />
          <span aria-hidden="true" className="hidden sm:inline">
            Cancel
          </span>
        </button>
      </fetcher.Form>
    </li>
  );
}

// The chip carries the desk number where there is one, so the second line
// says whose desk it is rather than repeating it.
function bookingRowText({
  show,
  when,
  name,
  label,
  borrowed,
}: {
  show: "person" | "desk" | "both";
  when: string;
  name: string;
  label: string;
  borrowed: boolean;
}) {
  let suffix = borrowed ? " · borrowed" : "";
  if (show === "person") return { title: name, detail: `${when}${suffix}` };
  if (show === "desk") return { title: when, detail: `Desk ${label}${suffix}` };
  return { title: name, detail: borrowed ? "Borrowed" : "Own desk" };
}

/** Bookings inside a sheet, with "Clear all" for the lot. */
export function BookingSection({
  bookings,
  index,
  show,
  clearFields,
  empty,
}: {
  bookings: AdminBooking[];
  index: Index;
  show: "person" | "desk";
  clearFields: Record<string, string | number>;
  empty: string;
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-muted">
          From today on
          {bookings.length > 0 && ` · ${bookings.length}`}
        </span>
        {bookings.length > 0 && (
          <ConfirmAction
            label="Clear all"
            question={`Cancel all ${plural(bookings.length, "booking")}?`}
            confirmLabel={`Clear ${plural(bookings.length, "booking")}`}
            fields={clearFields}
          />
        )}
      </div>
      {bookings.length ? (
        <ul className={listClass}>
          {bookings.map((booking) => (
            <BookingRow
              key={`${booking.deskId}-${booking.date}`}
              booking={booking}
              index={index}
              show={show}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-muted">{empty}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared                                                             */
/* ------------------------------------------------------------------ */
