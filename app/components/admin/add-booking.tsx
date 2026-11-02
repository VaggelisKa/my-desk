import { differenceInCalendarDays, format } from "date-fns";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Field, FormSheet, Select } from "~/components/admin/form-sheet";
import { useAdminFetcher, type AdminData } from "~/components/admin/shared";
import { Button } from "~/components/ui/button";
import { adminBookingDays, formatDate, parseDate } from "~/lib/dates";
import { capitalize, deskLabel } from "~/lib/utils";

// Admin › Bookings: books a desk for someone else, for example a guest who
// has no phone at hand or a colleague who asked. The server keeps the usual
// limits: weekdays this week and next, and two desks a day per person.

export function AddBooking({ data }: { data: AdminData }) {
  return (
    <FormSheet
      title="Add booking"
      description="Books a desk for someone else."
      intent="book"
      submit={{ label: "Book", busy: "Booking..." }}
      trigger={
        <Button
          type="button"
          variant="quiet"
          size="tall"
          aria-label="Add booking"
          className="gap-1.5"
        >
          <Plus aria-hidden="true" className="-ml-0.5 size-4" />
          {/* Phones say less, so the search keeps room for its hint. */}
          <span className="sm:hidden">Add</span>
          <span className="hidden sm:inline">Add booking</span>
        </Button>
      }
    >
      {({ id, close, ownSubmit }) => (
        <AddBookingForm id={id} data={data} onDone={close} submit={ownSubmit} />
      )}
    </FormSheet>
  );
}

function dayLabel(date: Date, today: Date) {
  let diff = differenceInCalendarDays(date, today);
  let prefix = diff === 0 ? "Today · " : diff === 1 ? "Tomorrow · " : "";
  return `${prefix}${format(date, "EEE d MMM")}`;
}

function AddBookingForm({
  id,
  data,
  onDone,
  submit,
}: {
  id: string;
  data: AdminData;
  onDone: () => void;
  /** Ends in its own Book button; phones have theirs in the header. */
  submit?: boolean;
}) {
  let today = parseDate(data.today);
  let days = adminBookingDays(today);
  // The sheet drops the form when it closes, so it opens empty next time.
  let fetcher = useAdminFetcher(onDone);
  let busy = fetcher.state !== "idle";
  let [personId, setPersonId] = useState("");
  let [date, setDate] = useState(() =>
    days.length ? formatDate(days[0]) : "",
  );
  let [deskId, setDeskId] = useState("");

  let person = data.people.find((p) => p.id === personId);
  let taken = (day: string) =>
    new Set(data.bookings.filter((b) => b.date === day).map((b) => b.deskId));
  let freeOn = (day: string) => {
    let booked = taken(day);
    return data.desks.filter((desk) => !booked.has(desk.id));
  };
  let free = freeOn(date);
  let alreadyBooked = person
    ? data.bookings.filter((b) => b.userId === person.id && b.date === date)
    : [];

  // Their own desk first, when it is free that day; otherwise the desk
  // picked so far, while it still is.
  function pickDesk(nextPerson: typeof person, day: string, current: string) {
    let open = new Set(freeOn(day).map((desk) => String(desk.id)));
    let own = nextPerson?.deskId != null ? String(nextPerson.deskId) : "";
    if (own && open.has(own)) return own;
    return open.has(current) ? current : "";
  }

  return (
    <fetcher.Form
      id={id}
      method="post"
      action="/admin"
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="intent" value="book" />
      <Field label="Person">
        {(props) => (
          <Select
            {...props}
            name="userId"
            required
            value={personId}
            onChange={(event) => {
              let next = data.people.find((p) => p.id === event.target.value);
              setPersonId(event.target.value);
              setDeskId(pickDesk(next, date, deskId));
            }}
          >
            <option value="" disabled>
              Pick a person
            </option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {`${capitalize(p.firstName)} ${capitalize(p.lastName)}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Day">
        {(props) => (
          <Select
            {...props}
            name="date"
            required
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setDeskId(pickDesk(person, event.target.value, deskId));
            }}
          >
            {days.map((day) => (
              <option key={day.getTime()} value={formatDate(day)}>
                {dayLabel(day, today)}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Desk">
        {(props) => (
          <Select
            {...props}
            name="deskId"
            required
            value={deskId}
            onChange={(event) => setDeskId(event.target.value)}
          >
            <option value="" disabled>
              {free.length ? "Pick a free desk" : "No desk is free that day"}
            </option>
            {free.map((desk) => (
              <option key={desk.id} value={desk.id}>
                {`Desk ${deskLabel(desk)}${desk.owner ? ` · ${capitalize(desk.owner.firstName)}'s desk` : ""}`}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {person && alreadyBooked.length > 0 && (
        <p role="status" className="text-[13px] text-ink-muted">
          {`${capitalize(person.firstName)} already has desk ${alreadyBooked
            .map((b) => {
              let desk = data.desks.find((d) => d.id === b.deskId);
              return desk ? deskLabel(desk) : String(b.deskId);
            })
            .join(" and ")} that day.`}
        </p>
      )}
      {submit && (
        <Button
          type="submit"
          variant="primary"
          size="tall"
          disabled={busy}
          className="mt-1"
        >
          {busy ? "Booking..." : "Book desk"}
        </Button>
      )}
    </fetcher.Form>
  );
}
