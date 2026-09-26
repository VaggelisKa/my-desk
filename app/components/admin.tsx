import { Sheet } from "@silk-hq/components";
import { differenceInCalendarDays, format } from "date-fns";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import {
  DeskChip,
  deskLabel,
  deskPlace,
  SegmentSwitch,
} from "~/components/bookings";
import { Button } from "~/components/ui/button";
import type { AdminBooking, AdminDesk, AdminPerson } from "~/lib/admin.server";
import { parseDate } from "~/lib/dates";
import { cn } from "~/lib/utils";

// The Admin tab (design option B): a sliding Desks · People · Bookings switch
// over searchable lists. Every row opens a sheet where the work happens, so
// the tab never sends you anywhere else. Anything that removes bookings or
// takes a desk away asks once more, and says what it will change.

export type AdminData = {
  desks: AdminDesk[];
  people: AdminPerson[];
  bookings: AdminBooking[];
  /** The signed-in admin. */
  me: string;
  /** Today in `dd.MM.yyyy`, the office's. */
  today: string;
};

export function useAdminData() {
  return useOutletContext<AdminData>();
}

let SEGMENTS = [
  { to: "/admin", label: "Desks" },
  { to: "/admin/people", label: "People" },
  { to: "/admin/bookings", label: "Bookings" },
];

export function AdminHeader() {
  return (
    <header className="flex flex-col gap-5">
      <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
        Admin
      </h1>
      <SegmentSwitch label="Admin" segments={SEGMENTS} />
    </header>
  );
}

let focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2";

function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

/** Lookups every list and sheet shares. */
function useIndex(data: AdminData) {
  return useMemo(() => {
    let people = new Map(data.people.map((p) => [p.id, p]));
    let desks = new Map(data.desks.map((d) => [d.id, d]));
    let byDesk = new Map<number, AdminBooking[]>();
    let byPerson = new Map<string, AdminBooking[]>();

    for (let booking of data.bookings) {
      byDesk.set(booking.deskId, [
        ...(byDesk.get(booking.deskId) ?? []),
        booking,
      ]);
      byPerson.set(booking.userId, [
        ...(byPerson.get(booking.userId) ?? []),
        booking,
      ]);
    }

    return {
      people,
      desks,
      bookingsOfDesk: (id: number) => byDesk.get(id) ?? [],
      bookingsOfPerson: (id: string) => byPerson.get(id) ?? [],
      today: parseDate(data.today),
    };
  }, [data]);
}

type Index = ReturnType<typeof useIndex>;

function matches(query: string, ...values: (string | null | undefined)[]) {
  let q = query.trim().toLowerCase();
  return !q || values.some((value) => value?.toLowerCase().includes(q));
}

function SearchField({
  id,
  label,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        autoFocus={autoFocus}
        autoComplete="off"
        className="focus-visible:ring-moss/30 h-11 w-full rounded-[10px] border border-line bg-paper pl-9 pr-3 text-base text-ink placeholder:text-ink-muted focus-visible:border-moss focus-visible:outline-none focus-visible:ring-2"
      />
    </div>
  );
}

let listClass =
  "flex flex-col overflow-hidden rounded-xl border border-line bg-paper";
let rowClass = cn(
  "flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 hover:bg-paper-muted sm:px-5",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-moss",
);
let groupHeading =
  "flex flex-wrap items-baseline justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted";

// Desktop (768px and up) shows tables, phones keep the lists. Both are in the
// page and CSS picks one, so there is no flash while the page hydrates.
let tableWrap =
  "hidden overflow-hidden rounded-xl border border-line bg-paper md:block";
let th =
  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted";
let td = "px-4 py-2.5 align-middle";
// The row's own button stretches over the whole row, so any cell opens it.
let tableRow =
  "relative border-t border-line hover:bg-paper-muted focus-within:bg-paper-muted";
let stretched =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";
let rowButton = cn(
  "inline-flex h-8 items-center rounded-lg px-2.5 text-[13px] font-semibold text-ink-muted hover:text-ink",
  focusRing,
);

type SortDir = "asc" | "desc";
type SortValue = string | number | null;

/**
 * Sorts a table by one column at a time. Tapping a column sorts by it, and
 * tapping it again flips the direction. Empty values (no owner, no desk) go
 * last whichever way it sorts; ties keep the list's own order.
 */
function useSort<T, K extends string>(
  rows: T[],
  columns: Record<K, { value: (row: T) => SortValue; first?: SortDir }>,
  initial: NoInfer<K>,
) {
  let [sort, setSort] = useState<{ key: K; dir: SortDir }>({
    key: initial,
    dir: columns[initial].first ?? "asc",
  });
  let value = columns[sort.key].value;
  let sorted = [...rows].sort((a, b) => {
    let x = value(a);
    let y = value(b);
    if (x === y) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    let order =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x).localeCompare(String(y), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return sort.dir === "asc" ? order : -order;
  });

  function toggle(key: K) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { key, dir: columns[key].first ?? "asc" },
    );
  }

  return { sorted, sort, toggle };
}

function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  column: K;
  sort: { key: K; dir: SortDir };
  onSort: (column: K) => void;
  align?: "left" | "right";
}) {
  let active = sort.key === column;
  let Icon = !active
    ? ChevronsUpDown
    : sort.dir === "asc"
      ? ArrowUp
      : ArrowDown;

  return (
    <th
      aria-sort={
        active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={cn(th, align === "right" && "text-right")}
    >
      <button
        type="button"
        onClick={() => onSort(column)}
        className={cn(
          "-mx-1 inline-flex items-center gap-1 rounded px-1 uppercase tracking-[inherit] hover:text-ink",
          active && "text-ink",
          align === "right" && "flex-row-reverse",
          focusRing,
        )}
      >
        {label}
        <Icon
          aria-hidden="true"
          className={cn("size-3", !active && "opacity-40")}
        />
      </button>
    </th>
  );
}

function NothingFound({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-paper px-5 py-8 text-sm text-ink-muted">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Desks                                                              */
/* ------------------------------------------------------------------ */

export function DeskList({ data }: { data: AdminData }) {
  let index = useIndex(data);
  let [query, setQuery] = useState("");
  let shown = data.desks.filter((desk) =>
    matches(
      query,
      deskLabel(desk),
      desk.owner && fullName(desk.owner),
      desk.owner?.id,
      desk.owner ? null : "unclaimed",
    ),
  );
  let blocks = [...new Set(shown.map((desk) => desk.block))];
  let table = useSort(
    shown,
    {
      desk: { value: (d) => d.block * 10000 + d.row * 100 + d.column },
      owner: { value: (d) => (d.owner ? fullName(d.owner) : null) },
      // Window, middle, aisle, then by block.
      place: { value: (d) => d.column * 100 + d.block },
      booked: {
        value: (d) => index.bookingsOfDesk(d.id).length,
        first: "desc",
      },
    },
    "desk",
  );

  return (
    <div className="flex flex-col gap-6">
      <SearchField
        id="admin-desk-search"
        label="Search desk or person"
        value={query}
        onChange={setQuery}
      />

      {blocks.length === 0 && (
        <NothingFound>No desk matches “{query.trim()}”.</NothingFound>
      )}

      {blocks.map((block) => (
        <section
          key={block}
          aria-labelledby={`block-${block}`}
          className="flex flex-col gap-2.5 md:hidden"
        >
          <h2 id={`block-${block}`} className={groupHeading}>
            Block {block}
          </h2>
          <ul className={listClass}>
            {shown
              .filter((desk) => desk.block === block)
              .map((desk) => (
                <li
                  key={desk.id}
                  className="border-b border-line last:border-b-0"
                >
                  <DeskAdminSheet desk={desk} data={data} index={index}>
                    <button
                      type="button"
                      className={cn(rowClass, "border-b-0")}
                    >
                      <DeskChip
                        label={deskLabel(desk)}
                        tone={desk.owner ? "taken" : "free"}
                      />
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-sm font-semibold capitalize leading-tight">
                          {desk.owner ? fullName(desk.owner) : "Unclaimed"}
                          <span className="sr-only">{`, desk ${deskLabel(desk)}`}</span>
                        </span>
                        <span className="truncate text-xs leading-tight text-ink-muted">
                          {desk.owner
                            ? `${desk.owner.id} · ${deskPlace(desk, { short: true })}`
                            : deskPlace(desk, { short: true })}
                        </span>
                      </span>
                      <BookedCount
                        count={index.bookingsOfDesk(desk.id).length}
                      />
                    </button>
                  </DeskAdminSheet>
                </li>
              ))}
          </ul>
        </section>
      ))}

      {shown.length > 0 && (
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortHeader
                  label="Desk"
                  column="desk"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Owner"
                  column="owner"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Place"
                  column="place"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Booked"
                  column="booked"
                  sort={table.sort}
                  onSort={table.toggle}
                  align="right"
                />
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.sorted.map((desk) => (
                <tr key={desk.id} className={tableRow}>
                  <td className={td}>
                    <DeskChip
                      label={deskLabel(desk)}
                      tone={desk.owner ? "taken" : "free"}
                    />
                  </td>
                  <td className={td}>
                    {desk.owner ? (
                      <>
                        <span className="font-semibold capitalize">
                          {fullName(desk.owner)}
                        </span>
                        <span className="ml-2 text-ink-muted">
                          {desk.owner.id}
                        </span>
                      </>
                    ) : (
                      <span className="text-ink-muted">Unclaimed</span>
                    )}
                  </td>
                  <td className={cn(td, "text-ink-muted")}>
                    {deskPlace(desk, { short: true })}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <BookedCount
                      count={index.bookingsOfDesk(desk.id).length}
                      short
                    />
                  </td>
                  <td className={cn(td, "w-px whitespace-nowrap pr-2")}>
                    <DeskAdminSheet
                      desk={desk}
                      data={data}
                      index={index}
                      quick={{
                        label: desk.owner ? "Reassign" : "Assign",
                        ariaLabel: `${desk.owner ? "Reassign" : "Assign"} desk ${deskLabel(desk)}`,
                        step: { name: "pick" },
                      }}
                    >
                      <button
                        type="button"
                        aria-label={`Manage desk ${deskLabel(desk)}`}
                        className={cn(rowButton, stretched)}
                      >
                        Manage
                      </button>
                    </DeskAdminSheet>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BookedCount({ count, short }: { count: number; short?: boolean }) {
  return (
    <span
      className={cn(
        "shrink-0 text-xs tabular-nums",
        count ? "font-semibold text-ink" : "text-dim",
      )}
    >
      {short ? count || "–" : count ? `${count} booked` : "None booked"}
    </span>
  );
}

function DeskAdminSheet({
  desk,
  data,
  index,
  quick,
  children,
}: {
  desk: AdminDesk;
  data: AdminData;
  index: Index;
  quick?: QuickOpen;
  children: ReactNode;
}) {
  let bookings = index.bookingsOfDesk(desk.id);

  return (
    <AdminSheet
      trigger={children}
      quick={quick}
      title={`Desk ${deskLabel(desk)}`}
      description={deskPlace(desk)}
    >
      {(step, setStep) =>
        step.name === "pick" ? (
          <PersonPicker
            data={data}
            index={index}
            exclude={desk.owner?.id}
            onBack={() => setStep({ name: "view" })}
            onPick={(person) =>
              setStep({ name: "confirm", personId: person.id })
            }
          />
        ) : step.name === "confirm" &&
          step.personId &&
          index.people.get(step.personId) ? (
          <MoveConfirm
            desk={desk}
            person={index.people.get(step.personId)!}
            index={index}
            onBack={() => setStep({ name: "pick" })}
            onDone={() => setStep({ name: "view" })}
          />
        ) : (
          <>
            <div className="grid gap-2">
              <span className="text-xs text-ink-muted">Owner</span>
              <p className="text-[15px] font-semibold capitalize">
                {desk.owner ? (
                  <>
                    {fullName(desk.owner)}
                    <span className="font-normal normal-case text-ink-muted">
                      {` · ${desk.owner.id}`}
                    </span>
                  </>
                ) : (
                  "Nobody, it is unclaimed"
                )}
              </p>
              <div className="mt-1 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="tall"
                  className="flex-1"
                  onClick={() => setStep({ name: "pick" })}
                >
                  {desk.owner ? "Change owner" : "Give to someone"}
                </Button>
                {desk.owner && (
                  <ConfirmAction
                    className="flex-1"
                    label="Unassign"
                    question={unassignQuestion(desk, index)}
                    confirmLabel="Unassign desk"
                    fields={{ intent: "unassign", deskId: desk.id }}
                  />
                )}
              </div>
            </div>

            <BookingSection
              title="Upcoming bookings"
              bookings={bookings}
              index={index}
              show="person"
              clearFields={{ intent: "clear-desk", deskId: desk.id }}
              empty="Nobody has booked this desk from today on."
            />
          </>
        )
      }
    </AdminSheet>
  );
}

function futureOnDesk(index: Index, deskId: number, personId: string) {
  return index
    .bookingsOfDesk(deskId)
    .filter(
      (b) =>
        b.userId === personId &&
        differenceInCalendarDays(parseDate(b.date), index.today) > 0,
    ).length;
}

function unassignQuestion(desk: AdminDesk, index: Index) {
  let owner = desk.owner!;
  let person = index.people.get(owner.id);
  let count = futureOnDesk(index, desk.id, owner.id);
  let parts = [`${capitalize(owner.firstName)} loses this desk`];

  if (count) parts.push(`and ${plural(count, "booked day")} on it after today`);
  let sentence = `${parts.join(" ")}.`;

  return person?.hasRecurring
    ? `${sentence} Their weekly booking stops.`
    : sentence;
}

function capitalize(name: string) {
  return name.charAt(0).toUpperCase() + name.slice(1);
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

function MoveConfirm({
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
  let fetcher = useFetcher();
  let busy = fetcher.state !== "idle";
  let lines = moveConsequences(desk, person, index);
  let wasBusy = useWasBusy(busy);

  useEffect(() => {
    if (wasBusy && !busy) onDone();
  }, [busy, wasBusy, onDone]);

  return (
    <fetcher.Form method="post" action="/admin" className="flex flex-col gap-4">
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

function useWasBusy(busy: boolean) {
  let [wasBusy, setWasBusy] = useState(false);
  useEffect(() => {
    if (busy) setWasBusy(true);
  }, [busy]);
  return wasBusy;
}

function PersonPicker({
  data,
  index,
  exclude,
  onBack,
  onPick,
}: {
  data: AdminData;
  index: Index;
  exclude?: string;
  onBack: () => void;
  onPick: (person: AdminPerson) => void;
}) {
  let [query, setQuery] = useState("");
  let people = data.people
    .filter((p) => p.id !== exclude)
    .filter((p) => matches(query, fullName(p), p.id));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Give this desk to</span>
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "rounded text-[13px] font-semibold text-ink-muted hover:text-ink",
            focusRing,
          )}
        >
          Cancel
        </button>
      </div>
      <SearchField
        id="admin-person-picker"
        label="Search name or ID"
        value={query}
        onChange={setQuery}
      />
      <ul className={listClass}>
        {people.map((person) => {
          let desk =
            person.deskId !== null ? index.desks.get(person.deskId) : null;
          return (
            <li
              key={person.id}
              className="border-b border-line last:border-b-0"
            >
              <button
                type="button"
                onClick={() => onPick(person)}
                className={cn(rowClass, "border-b-0 px-3.5 py-2.5 sm:px-3.5")}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold capitalize leading-tight">
                    {fullName(person)}
                  </span>
                  <span className="truncate text-xs leading-tight text-ink-muted">
                    {person.id} ·{" "}
                    {desk ? `has desk ${deskLabel(desk)}` : "no desk"}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-[13px] font-semibold text-moss-edge"
                >
                  Pick
                </span>
              </button>
            </li>
          );
        })}
        {people.length === 0 && (
          <li className="px-4 py-5 text-sm text-ink-muted">Nobody matches.</li>
        )}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* People                                                             */
/* ------------------------------------------------------------------ */

export function PeopleList({ data }: { data: AdminData }) {
  let index = useIndex(data);
  let [query, setQuery] = useState("");
  let shown = data.people.filter((person) => {
    let desk = person.deskId !== null ? index.desks.get(person.deskId) : null;
    return matches(query, fullName(person), person.id, desk && deskLabel(desk));
  });

  let deskOf = (person: AdminPerson) =>
    person.deskId !== null ? index.desks.get(person.deskId) : undefined;
  let table = useSort(
    shown,
    {
      name: { value: (p) => fullName(p) },
      id: { value: (p) => p.id },
      desk: {
        value: (p) => {
          let desk = deskOf(p);
          return desk
            ? desk.block * 10000 + desk.row * 100 + desk.column
            : null;
        },
      },
      weekly: { value: (p) => (p.hasRecurring ? 0 : null) },
      booked: {
        value: (p) => index.bookingsOfPerson(p.id).length,
        first: "desc",
      },
    },
    "name",
  );

  return (
    <div className="flex flex-col gap-6">
      <SearchField
        id="admin-people-search"
        label="Search name, ID or desk"
        value={query}
        onChange={setQuery}
      />

      {shown.length === 0 ? (
        <NothingFound>Nobody matches “{query.trim()}”.</NothingFound>
      ) : (
        <ul className={cn(listClass, "md:hidden")}>
          {shown.map((person) => {
            let desk =
              person.deskId !== null ? index.desks.get(person.deskId) : null;
            return (
              <li
                key={person.id}
                className="border-b border-line last:border-b-0"
              >
                <PersonSheet person={person} data={data} index={index}>
                  <button type="button" className={cn(rowClass, "border-b-0")}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-sm font-semibold leading-tight">
                        <span className="truncate capitalize">
                          {fullName(person)}
                        </span>
                        {person.role === "admin" && <Badge>Admin</Badge>}
                      </span>
                      <span className="truncate text-xs leading-tight text-ink-muted">
                        {person.id} ·{" "}
                        {desk ? `Desk ${deskLabel(desk)}` : "No desk"}
                      </span>
                    </span>
                    <BookedCount
                      count={index.bookingsOfPerson(person.id).length}
                    />
                  </button>
                </PersonSheet>
              </li>
            );
          })}
        </ul>
      )}

      {shown.length > 0 && (
        <div className={tableWrap}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <SortHeader
                  label="Name"
                  column="name"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="ID"
                  column="id"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Desk"
                  column="desk"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Weekly"
                  column="weekly"
                  sort={table.sort}
                  onSort={table.toggle}
                />
                <SortHeader
                  label="Booked"
                  column="booked"
                  sort={table.sort}
                  onSort={table.toggle}
                  align="right"
                />
                <th className={th}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.sorted.map((person) => {
                let desk =
                  person.deskId !== null
                    ? index.desks.get(person.deskId)
                    : null;
                return (
                  <tr key={person.id} className={tableRow}>
                    <td className={td}>
                      <span className="flex items-center gap-2">
                        <span className="font-semibold capitalize">
                          {fullName(person)}
                        </span>
                        {person.role === "admin" && <Badge>Admin</Badge>}
                      </span>
                    </td>
                    <td className={cn(td, "text-ink-muted")}>{person.id}</td>
                    <td className={td}>
                      {desk ? (
                        deskLabel(desk)
                      ) : (
                        <span className="text-ink-muted">No desk</span>
                      )}
                    </td>
                    <td className={cn(td, "text-ink-muted")}>
                      {person.hasRecurring ? "On" : "–"}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <BookedCount
                        count={index.bookingsOfPerson(person.id).length}
                        short
                      />
                    </td>
                    <td className={cn(td, "w-px whitespace-nowrap pr-2")}>
                      <PersonSheet person={person} data={data} index={index}>
                        <button
                          type="button"
                          aria-label={`${fullName(person)}, manage`}
                          className={cn(rowButton, stretched)}
                        >
                          Manage
                        </button>
                      </PersonSheet>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-moss-soft px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.05em] text-moss-edge">
      {children}
    </span>
  );
}

function PersonSheet({
  person,
  data,
  index,
  children,
}: {
  person: AdminPerson;
  data: AdminData;
  index: Index;
  children: ReactNode;
}) {
  let desk = person.deskId !== null ? index.desks.get(person.deskId) : null;
  let isMe = person.id === data.me;

  return (
    <AdminSheet
      trigger={children}
      title={fullName(person)}
      titleClassName="capitalize"
      description={[
        person.id,
        desk ? `Desk ${deskLabel(desk)}` : "No desk",
        person.role === "admin" && "Admin",
      ]
        .filter(Boolean)
        .join(" · ")}
    >
      {(step, setStep) =>
        step.name === "pick-desk" ? (
          <DeskPicker
            data={data}
            index={index}
            exclude={desk?.id}
            onBack={() => setStep({ name: "view" })}
            onPick={(picked) => setStep({ name: "confirm", deskId: picked.id })}
          />
        ) : step.name === "confirm" &&
          step.deskId &&
          index.desks.get(step.deskId) ? (
          <MoveConfirm
            desk={index.desks.get(step.deskId)!}
            person={person}
            index={index}
            onBack={() => setStep({ name: "pick-desk" })}
            onDone={() => setStep({ name: "view" })}
          />
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="primary"
                size="tall"
                className="flex-1"
                onClick={() => setStep({ name: "pick-desk" })}
              >
                {desk ? "Move to another desk" : "Give a desk"}
              </Button>
              {desk && (
                <ConfirmAction
                  className="flex-1"
                  label="Take desk away"
                  question={unassignQuestion(desk, index)}
                  confirmLabel="Unassign desk"
                  fields={{ intent: "unassign", deskId: desk.id }}
                />
              )}
            </div>

            <BookingSection
              title="Upcoming bookings"
              bookings={index.bookingsOfPerson(person.id)}
              index={index}
              show="desk"
              clearFields={{ intent: "clear-person", userId: person.id }}
              empty={`${capitalize(person.firstName)} has nothing booked from today on.`}
            />

            {person.hasRecurring && (
              <div className="grid gap-2">
                <span className="text-xs text-ink-muted">Weekly booking</span>
                <p className="text-[13px] text-ink">
                  Books {desk ? `desk ${deskLabel(desk)}` : "their desk"} on the
                  same days every week.
                </p>
                <ConfirmAction
                  label="Stop weekly booking"
                  question="Days it already booked stay booked."
                  confirmLabel="Stop it"
                  fields={{ intent: "stop-recurring", userId: person.id }}
                />
              </div>
            )}

            <RenameForm person={person} />

            <div className="grid gap-2">
              <span className="text-xs text-ink-muted">Role</span>
              {isMe ? (
                <p className="text-[13px] text-ink-muted">
                  You are an admin. Another admin can change that.
                </p>
              ) : (
                <ConfirmAction
                  label={
                    person.role === "admin" ? "Remove admin role" : "Make admin"
                  }
                  question={
                    person.role === "admin"
                      ? `${capitalize(person.firstName)} loses the Admin tab.`
                      : `${capitalize(person.firstName)} gets this Admin tab and can change any desk or booking.`
                  }
                  confirmLabel={
                    person.role === "admin" ? "Remove role" : "Make admin"
                  }
                  tone={person.role === "admin" ? "danger" : "primary"}
                  fields={{
                    intent: "set-role",
                    userId: person.id,
                    role: person.role === "admin" ? "user" : "admin",
                  }}
                />
              )}
            </div>
          </>
        )
      }
    </AdminSheet>
  );
}

function DeskPicker({
  data,
  index,
  exclude,
  onBack,
  onPick,
}: {
  data: AdminData;
  index: Index;
  exclude?: number;
  onBack: () => void;
  onPick: (desk: AdminDesk) => void;
}) {
  let [query, setQuery] = useState("");
  // Free desks first: that is usually what you are looking for.
  let desks = data.desks
    .filter((d) => d.id !== exclude)
    .filter((d) => matches(query, deskLabel(d), d.owner && fullName(d.owner)))
    .sort((a, b) => Number(!!a.owner) - Number(!!b.owner));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">Move to desk</span>
        <button
          type="button"
          onClick={onBack}
          className={cn(
            "rounded text-[13px] font-semibold text-ink-muted hover:text-ink",
            focusRing,
          )}
        >
          Cancel
        </button>
      </div>
      <SearchField
        id="admin-desk-picker"
        label="Search desk or owner"
        value={query}
        onChange={setQuery}
      />
      <ul className={listClass}>
        {desks.map((desk) => (
          <li key={desk.id} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onPick(desk)}
              className={cn(rowClass, "border-b-0 px-3.5 py-2.5 sm:px-3.5")}
            >
              <DeskChip
                label={deskLabel(desk)}
                tone={desk.owner ? "taken" : "free"}
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold capitalize leading-tight">
                  {desk.owner ? fullName(desk.owner) : "Unclaimed"}
                  <span className="sr-only">{`, desk ${deskLabel(desk)}`}</span>
                </span>
                <span className="truncate text-xs leading-tight text-ink-muted">
                  {deskPlace(desk, { short: true })}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="text-[13px] font-semibold text-moss-edge"
              >
                Pick
              </span>
            </button>
          </li>
        ))}
        {desks.length === 0 && (
          <li className="px-4 py-5 text-sm text-ink-muted">No desk matches.</li>
        )}
      </ul>
    </div>
  );
}

function RenameForm({ person }: { person: AdminPerson }) {
  let fetcher = useFetcher();
  let [firstName, setFirstName] = useState(person.firstName);
  let [lastName, setLastName] = useState(person.lastName);
  let busy = fetcher.state !== "idle";

  useEffect(() => {
    setFirstName(person.firstName);
    setLastName(person.lastName);
  }, [person.firstName, person.lastName]);

  let changed =
    firstName.trim() !== person.firstName ||
    lastName.trim() !== person.lastName;
  let input =
    "h-10 w-full rounded-[10px] border border-line bg-paper px-3 text-base text-ink focus-visible:border-moss focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss/30";

  return (
    <fetcher.Form method="post" action="/admin" className="grid gap-2">
      <span className="text-xs text-ink-muted">Name</span>
      <input type="hidden" name="intent" value="rename" />
      <input type="hidden" name="userId" value={person.id} />
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-1 text-xs text-ink-muted">
          First name
          <input
            name="firstName"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
            className={input}
          />
        </label>
        <label className="grid gap-1 text-xs text-ink-muted">
          Last name
          <input
            name="lastName"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
            className={input}
          />
        </label>
      </div>
      <Button
        type="submit"
        variant="quiet"
        size="tall"
        disabled={!changed || busy}
      >
        {busy ? "Saving..." : "Save name"}
      </Button>
    </fetcher.Form>
  );
}

/* ------------------------------------------------------------------ */
/* Bookings                                                           */
/* ------------------------------------------------------------------ */

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
                <span className="ml-2 font-medium normal-case tracking-normal text-dim">
                  {plural(all, "booking")}
                </span>
              </h2>
              <ConfirmAction
                variant="link"
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
                          <span className="ml-2 font-medium normal-case tracking-normal text-dim">
                            {plural(all, "booking")}
                          </span>
                        </span>
                        <ConfirmAction
                          variant="link"
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
      </td>
      <td className={td}>
        <span className="font-semibold capitalize">{name}</span>
        <span className="ml-2 text-ink-muted">{booking.userId}</span>
      </td>
      <td className={cn(td, "text-ink-muted")}>
        {borrowed ? "Borrowed" : "Own desk"}
      </td>
      <td className={cn(td, "w-px pr-2")}>
        <fetcher.Form method="post" action="/admin">
          <input type="hidden" name="intent" value="cancel" />
          <input type="hidden" name="deskId" value={booking.deskId} />
          <input type="hidden" name="date" value={booking.date} />
          <button
            type="submit"
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

  // The chip carries the desk number where there is one, so the second line
  // says whose desk it is rather than repeating it.
  let title = show === "desk" ? when : name;
  let detail =
    show === "person"
      ? `${when}${borrowed ? " · borrowed" : ""}`
      : show === "desk"
        ? `Desk ${label}${borrowed ? " · borrowed" : ""}`
        : borrowed
          ? "Borrowed"
          : "Own desk";

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
      <fetcher.Form method="post" action="/admin">
        <input type="hidden" name="intent" value="cancel" />
        <input type="hidden" name="deskId" value={booking.deskId} />
        <input type="hidden" name="date" value={booking.date} />
        <button
          type="submit"
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

/** Bookings inside a sheet, with "Clear all" for the lot. */
function BookingSection({
  title,
  bookings,
  index,
  show,
  clearFields,
  empty,
}: {
  title: string;
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
          {title}
          {bookings.length > 0 && ` · ${bookings.length}`}
        </span>
        {bookings.length > 0 && (
          <ConfirmAction
            variant="link"
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

/**
 * A button that asks once more before it posts: the first tap swaps it for
 * the question, the real button and "Keep". Built into the page because the
 * browser's confirm() is easy to click through and looks out of place.
 */
function ConfirmAction({
  label,
  question,
  confirmLabel,
  fields,
  tone = "danger",
  variant = "button",
  className,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  fields: Record<string, string | number>;
  tone?: "danger" | "primary";
  variant?: "button" | "link";
  className?: string;
}) {
  let fetcher = useFetcher();
  let [asking, setAsking] = useState(false);
  let busy = fetcher.state !== "idle";
  let wasBusy = useWasBusy(busy);

  useEffect(() => {
    if (wasBusy && !busy) setAsking(false);
  }, [busy, wasBusy]);

  if (!asking) {
    return variant === "link" ? (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className={cn(
          "rounded text-[13px] font-semibold normal-case tracking-normal text-danger hover:underline",
          focusRing,
          className,
        )}
      >
        {label}
      </button>
    ) : (
      <Button
        type="button"
        variant="quiet"
        size="tall"
        onClick={() => setAsking(true)}
        className={cn(tone === "danger" && "text-danger", className)}
      >
        {label}
      </Button>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      className={cn(
        "flex w-full basis-full flex-col gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13px] normal-case leading-snug tracking-normal text-ink",
        tone === "danger"
          ? "border-danger/40 bg-danger/5"
          : "border-line bg-paper-muted",
        variant === "link" && "font-normal",
      )}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p>{question}</p>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="tall"
          variant="primary"
          disabled={busy}
          autoFocus
          className={cn(
            "flex-1",
            tone === "danger" &&
              "hover:bg-danger/90 bg-danger focus-visible:ring-danger",
          )}
        >
          {busy ? "Working..." : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="tall"
          className="flex-1"
          onClick={() => setAsking(false)}
        >
          Keep
        </Button>
      </div>
    </fetcher.Form>
  );
}

/** A second button that opens the sheet straight at a later step. */
type QuickOpen = { label: string; ariaLabel: string; step: Step };

type Step =
  | { name: "view" }
  | { name: "pick" }
  | { name: "pick-desk" }
  | { name: "confirm"; personId?: string; deskId?: number };

/**
 * The admin sheet: from the bottom on phones and from the right on larger
 * screens, like the desk sheet on the Desks tab. It starts on its first step
 * every time it opens.
 */
function AdminSheet({
  trigger,
  quick,
  title,
  titleClassName,
  description,
  children,
}: {
  trigger: ReactNode;
  quick?: QuickOpen;
  title: string;
  titleClassName?: string;
  description: string;
  children: (step: Step, setStep: (step: Step) => void) => ReactNode;
}) {
  let [presented, setPresented] = useState(false);
  let [step, setStep] = useState<Step>({ name: "view" });
  let [opened, setOpened] = useState(0);
  let [travelStatus, setTravelStatus] = useState("idleOutside");
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);

  function handlePresentedChange(
    value: boolean,
    start: Step = { name: "view" },
  ) {
    if (value) {
      setIsSmallDevice(isNarrow);
      setStep(start);
      setOpened((n) => n + 1);
    }
    setPresented(value);
  }

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      forComponent={isSmallDevice ? "closest" : undefined}
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={(value) => handlePresentedChange(value)}
      className={quick ? "flex items-center justify-end gap-1" : undefined}
    >
      {quick && (
        <button
          type="button"
          aria-label={quick.ariaLabel}
          aria-haspopup="dialog"
          onClick={() => handlePresentedChange(true, quick.step)}
          // Above the row's stretched button, so it is not swallowed by it.
          className={cn(
            rowButton,
            "relative z-10 text-moss-edge hover:text-moss",
          )}
        >
          {quick.label}
        </button>
      )}
      <Sheet.Trigger asChild>{trigger}</Sheet.Trigger>

      <Sheet.Portal>
        <Sheet.View
          className="desk-sheet-view"
          // Lets tests wait for the sheet to come to rest, as on the desk sheet.
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

            <div className="desk-sheet-body flex flex-col gap-6 font-display text-ink">
              <div>
                <Sheet.Title
                  className={cn(
                    "pr-8 text-lg font-bold tracking-tight sm:text-xl",
                    titleClassName,
                  )}
                >
                  {title}
                </Sheet.Title>
                <Sheet.Description className="mt-0.5 text-[13px] text-ink-muted">
                  {description}
                </Sheet.Description>
              </div>
              <Fragment key={opened}>{children(step, setStep)}</Fragment>
            </div>
          </Sheet.Content>
        </Sheet.View>
      </Sheet.Portal>
    </Sheet.Root>
  );
}
