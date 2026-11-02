import { differenceInCalendarDays, format } from "date-fns";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Field, FormSheet, Select } from "~/components/admin/form-sheet";
import { useAdminFetcher, type AdminData } from "~/components/admin/shared";
import { Button } from "~/components/ui/button";
import { adminBookingDays, formatDate, parseDate } from "~/lib/dates";
import { capitalize, deskLabel, MAX_DESKS_PER_DAY } from "~/lib/utils";

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
  // What the admin picked. What the form shows is worked out from it on
  // every render, so a desk someone books meanwhile, or a person removed,
  // empties its field instead of silently showing another one.
  let [personId, setPersonId] = useState("");
  let [pickedDate, setPickedDate] = useState("");
  let [pickedDesk, setPickedDesk] = useState("");

  let person = data.people.find((p) => p.id === personId);
  let dayValues = days.map((day) => formatDate(day));
  let date = dayValues.includes(pickedDate) ? pickedDate : (dayValues[0] ?? "");
  let booked = new Set(
    data.bookings.filter((b) => b.date === date).map((b) => b.deskId),
  );
  let free = data.desks.filter((desk) => !booked.has(desk.id));
  let isFree = (value: string) => free.some((d) => String(d.id) === value);
  // The desk picked by hand while it is free; otherwise their own desk.
  let own = person?.deskId != null ? String(person.deskId) : "";
  let deskId = isFree(pickedDesk) ? pickedDesk : isFree(own) ? own : "";
  let alreadyBooked = person
    ? data.bookings.filter((b) => b.userId === person.id && b.date === date)
    : [];

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
            value={person ? personId : ""}
            onChange={(event) => {
              setPersonId(event.target.value);
              // A new person starts from their own desk.
              setPickedDesk("");
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
            onChange={(event) => setPickedDate(event.target.value)}
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
            onChange={(event) => setPickedDesk(event.target.value)}
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
      {/* Always there, so screen readers hear it when the text changes. */}
      <p role="status" className="text-[13px] text-ink-muted empty:hidden">
        {person && alreadyBooked.length > 0
          ? `${capitalize(person.firstName)} already has desk ${alreadyBooked
              .map((b) => {
                let desk = data.desks.find((d) => d.id === b.deskId);
                return desk ? deskLabel(desk) : String(b.deskId);
              })
              .join(
                " and ",
              )} that day${alreadyBooked.length >= MAX_DESKS_PER_DAY ? `, the most one person can book` : ""}.`
          : ""}
      </p>
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
