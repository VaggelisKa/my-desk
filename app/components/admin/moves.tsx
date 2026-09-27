import { differenceInCalendarDays } from "date-fns";
import { fullName } from "~/components/admin/helpers";
import { type Index, useAdminFetcher } from "~/components/admin/shared";
import { ConfirmStep } from "~/components/admin/sheets";
import { Button } from "~/components/ui/button";
import type { AdminDesk, AdminPerson } from "~/lib/admin.server";
import { parseDate } from "~/lib/dates";
import { capitalize, deskLabel, plural } from "~/lib/utils";

// Confirmations for moving a desk to someone else or unassigning it, shared
// by the Desks and People lists. Both say what will change first.

function futureOnDesk(index: Index, deskId: number, personId: string) {
  return index
    .bookingsOfDesk(deskId)
    .filter(
      (b) =>
        b.userId === personId &&
        differenceInCalendarDays(parseDate(b.date), index.today) > 0,
    ).length;
}

/**
 * Unassigning takes more than the desk, so it says what goes before it runs:
 * the owner's booked days after today and their weekly booking.
 */
export function UnassignConfirm({
  desk,
  index,
  onDone,
}: {
  desk: AdminDesk | null | undefined;
  index: Index;
  onDone: () => void;
}) {
  return (
    <>
      {desk?.owner && (
        <p className="text-[15px] leading-snug text-ink">
          {unassignConsequences(desk, desk.owner.id, index)}
        </p>
      )}
      {/* Stays mounted once the desk has no owner, so the page can close. */}
      <ConfirmStep
        confirmLabel="Unassign desk"
        fields={{ intent: "unassign", deskId: desk?.id ?? "" }}
        onDone={onDone}
      />
    </>
  );
}

function unassignConsequences(desk: AdminDesk, ownerId: string, index: Index) {
  let owner = index.people.get(ownerId);
  let count = futureOnDesk(index, desk.id, ownerId);
  let bookedToday = index
    .bookingsOfDesk(desk.id)
    .some(
      (b) =>
        b.userId === ownerId &&
        differenceInCalendarDays(parseDate(b.date), index.today) === 0,
    );

  return (
    `${capitalize(owner?.firstName ?? "The owner")} loses desk ${deskLabel(desk)}` +
    (count ? ` and ${plural(count, "booked day")} on it after today.` : ".") +
    (bookedToday ? " Their booking today stays." : "") +
    (owner?.hasRecurring ? " Their weekly booking stops." : "")
  );
}

/** What moving `desk` to `person` changes, one line per person affected. */
function moveConsequences(desk: AdminDesk, person: AdminPerson, index: Index) {
  let lines: string[] = [];
  let owner = desk.owner ? index.people.get(desk.owner.id) : undefined;

  if (owner) {
    let count = futureOnDesk(index, desk.id, owner.id);
    lines.push(
      `${capitalize(owner.firstName)} loses desk ${deskLabel(desk)}` +
        (count
          ? ` and ${plural(count, "booked day")} on it after today.`
          : ".") +
        (owner.hasRecurring ? " Their weekly booking stops." : ""),
    );
  }

  let current = person.deskId !== null ? index.desks.get(person.deskId) : null;
  if (current && current.id !== desk.id) {
    let count = futureOnDesk(index, current.id, person.id);
    lines.push(
      `${capitalize(person.firstName)}'s desk ${deskLabel(current)} becomes unclaimed` +
        "." +
        (count
          ? ` ${plural(count, "booked day")} on it after today ${count === 1 ? "is" : "are"} cancelled.`
          : "") +
        (person.hasRecurring ? " Their weekly booking stops." : ""),
    );
  }

  if (!lines.length) {
    lines.push(
      `${capitalize(person.firstName)} gets desk ${deskLabel(desk)}. Nothing else changes.`,
    );
  }

  return lines;
}

export function MoveConfirm({
  desk,
  person,
  index,
  onBack,
  onDone,
}: {
  desk: AdminDesk;
  person: AdminPerson;
  index: Index;
  onBack: () => void;
  onDone: () => void;
}) {
  let fetcher = useAdminFetcher(onDone);
  let busy = fetcher.state !== "idle";
  let lines = moveConsequences(desk, person, index);

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void fetcher.submit(event.currentTarget);
      }}
    >
      <input type="hidden" name="intent" value="reassign" />
      <input type="hidden" name="deskId" value={desk.id} />
      <input type="hidden" name="userId" value={person.id} />

      <div className="grid gap-1">
        <span className="text-xs text-ink-muted">Move to</span>
        <p className="text-[15px] font-semibold capitalize">
          {fullName(person)}
          <span className="font-normal normal-case text-ink-muted">{` · ${person.id}`}</span>
        </p>
      </div>

      <ul className="flex flex-col gap-1.5 rounded-[10px] bg-paper-muted px-3.5 py-3 text-[13px] leading-snug">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <div className="flex flex-col gap-2">
        <Button type="submit" variant="primary" size="tall" disabled={busy}>
          {busy ? "Moving..." : `Move desk to ${capitalize(person.firstName)}`}
        </Button>
        <Button type="button" variant="quiet" size="tall" onClick={onBack}>
          Pick someone else
        </Button>
      </div>
    </fetcher.Form>
  );
}
