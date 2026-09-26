import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Sheet } from "@silk-hq/components";
import { differenceInCalendarDays, format } from "date-fns";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Search,
  X,
} from "lucide-react";
import {
  Fragment,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useFetcher, useOutletContext } from "react-router";
import { useMediaQuery } from "usehooks-ts";
import { DeskChip, SegmentSwitch } from "~/components/bookings";
import { Button } from "~/components/ui/button";
import type {
  AdminActionData,
  AdminBooking,
  AdminDesk,
  AdminPerson,
} from "~/lib/admin.server";
import { parseDate } from "~/lib/dates";
import { focusNeighbour, rescueFocus } from "~/lib/focus";
import { capitalize, cn, deskLabel, deskPlace, plural } from "~/lib/utils";

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
  results,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /** How many rows the search leaves, read out as you type ("3 desks"). */
  results?: string;
}) {
  return (
    <div className="relative">
      <p aria-live="polite" className="sr-only">
        {value.trim() && results ? `${results} shown` : ""}
      </p>
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
        className="h-11 w-full rounded-[10px] border border-field bg-paper pl-9 pr-3 text-base text-ink placeholder:text-ink-muted focus-visible:border-moss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss"
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
        results={plural(shown.length, "desk")}
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
                    {/* The chip is hidden from screen readers. */}
                    <span className="sr-only">{deskLabel(desk)}</span>
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
                    <DeskAdminSheet desk={desk} data={data} index={index} menu>
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
        count ? "font-semibold text-ink" : "text-ink-muted",
      )}
    >
      {short
        ? count || <Dash spoken="None" />
        : count
          ? `${count} booked`
          : "None booked"}
    </span>
  );
}

/** An empty table cell's dash, with a word for screen readers. */
function Dash({ spoken }: { spoken: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{spoken}</span>
    </>
  );
}

function DeskAdminSheet({
  desk,
  data,
  index,
  menu,
  children,
}: {
  desk: AdminDesk;
  data: AdminData;
  index: Index;
  /** Opens a menu of actions instead, each with a sheet of its own. */
  menu?: boolean;
  children: ReactNode;
}) {
  let bookings = index.bookingsOfDesk(desk.id);
  let title = `Desk ${deskLabel(desk)}`;
  let actions: Action[] = [
    { sub: "owner", label: desk.owner ? "Change owner" : "Give to someone" },
    { sub: "bookings", label: "Upcoming bookings" },
  ];
  if (desk.owner) {
    actions.push({
      sub: "unassign",
      label: "Unassign desk",
      danger: true,
    });
  }

  return (
    <AdminSheet
      trigger={children}
      menu={menu ? { label: title, actions } : undefined}
      title={title}
      description={deskPlace(desk)}
      rows={(open) => (
        <>
          <SettingsList>
            <SettingsRow
              label="Owner"
              value={desk.owner ? fullName(desk.owner) : "Nobody"}
              valueClassName="capitalize"
              onClick={() => open("owner")}
            />
            <SettingsRow
              label="Upcoming bookings"
              value={bookedDays(bookings.length)}
              onClick={() => open("bookings")}
            />
          </SettingsList>
          {desk.owner && (
            <SettingsList>
              <SettingsAction
                label="Unassign desk"
                onClick={() => open("unassign")}
              />
            </SettingsList>
          )}
        </>
      )}
      page={(sub, close) =>
        sub === "unassign"
          ? {
              title: "Unassign desk",
              description: title,
              body: (
                <UnassignConfirm desk={desk} index={index} onDone={close} />
              ),
            }
          : sub === "owner"
            ? {
                title: desk.owner ? "Change owner" : "Give to someone",
                description: title,
                body: (
                  <OwnerChoice
                    desk={desk}
                    data={data}
                    index={index}
                    onDone={close}
                  />
                ),
              }
            : {
                title: "Upcoming bookings",
                description: title,
                body: (
                  <BookingSection
                    bookings={bookings}
                    index={index}
                    show="person"
                    clearFields={{ intent: "clear-desk", deskId: desk.id }}
                    empty="Nobody has booked this desk from today on."
                  />
                ),
              }
      }
    />
  );
}

/** Picks the desk's new owner, then says what that changes. */
function OwnerChoice({
  desk,
  data,
  index,
  onDone,
}: {
  desk: AdminDesk;
  data: AdminData;
  index: Index;
  onDone: () => void;
}) {
  let [step, go, frame, key] = useSteps<{ person?: AdminPerson }>({});

  return (
    <div key={key} {...frame}>
      {step.person ? (
        <MoveConfirm
          desk={desk}
          person={step.person}
          index={index}
          onBack={() => go({})}
          onDone={onDone}
        />
      ) : (
        <PersonPicker
          data={data}
          index={index}
          exclude={desk.owner?.id}
          onPick={(person) => go({ person })}
        />
      )}
    </div>
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

/**
 * Unassigning takes more than the desk, so it says what goes before it runs:
 * the owner's booked days after today and their weekly booking.
 */
function UnassignConfirm({
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

/**
 * A fetcher for /admin that runs `onDone` once its action succeeded. A failed
 * one leaves the sheet where it is, with its toast saying why.
 */
function useAdminFetcher(onDone: () => void) {
  let fetcher = useFetcher<AdminActionData>();
  let finish = useEffectEvent(onDone);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) finish();
  }, [fetcher.state, fetcher.data]);

  return fetcher;
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

function PersonPicker({
  data,
  index,
  exclude,
  onPick,
}: {
  data: AdminData;
  index: Index;
  exclude?: string;
  onPick: (person: AdminPerson) => void;
}) {
  let [query, setQuery] = useState("");
  let people = data.people
    .filter((p) => p.id !== exclude)
    .filter((p) => matches(query, fullName(p), p.id));

  return (
    <div className="flex flex-col gap-3">
      <SearchField
        id="admin-person-picker"
        label="Search name or ID"
        value={query}
        onChange={setQuery}
        results={`${people.length} ${people.length === 1 ? "person" : "people"}`}
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
        results={`${shown.length} ${shown.length === 1 ? "person" : "people"}`}
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
                      {person.hasRecurring ? "Set up" : <Dash spoken="Off" />}
                    </td>
                    <td className={cn(td, "text-right")}>
                      <BookedCount
                        count={index.bookingsOfPerson(person.id).length}
                        short
                      />
                    </td>
                    <td className={cn(td, "w-px whitespace-nowrap pr-2")}>
                      <PersonSheet
                        person={person}
                        data={data}
                        index={index}
                        menu
                      >
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
  menu,
  children,
}: {
  person: AdminPerson;
  data: AdminData;
  index: Index;
  /** Opens a menu of actions instead, each with a sheet of its own. */
  menu?: boolean;
  children: ReactNode;
}) {
  let desk = person.deskId !== null ? index.desks.get(person.deskId) : null;
  let isMe = person.id === data.me;
  let isAdmin = person.role === "admin";
  let bookings = index.bookingsOfPerson(person.id);
  let name = fullName(person);
  let first = capitalize(person.firstName);
  let actions: Action[] = [
    { sub: "desk", label: desk ? "Move to another desk" : "Give a desk" },
    { sub: "name", label: "Rename" },
  ];
  // Quick ones run straight from the menu; the rest open a sheet.
  if (!isMe) {
    actions.push({
      label: isAdmin ? "Remove admin role" : "Make admin",
      run: {
        intent: "set-role",
        userId: person.id,
        role: isAdmin ? "user" : "admin",
      },
    });
  }
  actions.push({ sub: "bookings", label: "Upcoming bookings" });
  if (person.hasRecurring) {
    actions.push({
      label: "Stop weekly booking",
      danger: true,
      run: { intent: "stop-recurring", userId: person.id },
    });
  }
  if (desk) {
    actions.push({
      sub: "unassign",
      label: "Unassign desk",
      danger: true,
    });
  }

  return (
    <AdminSheet
      trigger={children}
      menu={menu ? { label: capitalize(name), actions } : undefined}
      title={name}
      titleClassName="capitalize"
      description={[
        person.id,
        desk ? `Desk ${deskLabel(desk)}` : "No desk",
        isAdmin && "Admin",
      ]
        .filter(Boolean)
        .join(" · ")}
      rows={(open) => (
        <>
          <SettingsList>
            <SettingsRow
              label="Desk"
              value={desk ? deskLabel(desk) : "None"}
              onClick={() => open("desk")}
            />
            <SettingsRow
              label="Name"
              value={name}
              valueClassName="capitalize"
              onClick={() => open("name")}
            />
            <SettingsRow
              label="Role"
              value={isAdmin ? "Admin" : "Member"}
              // You can't take the role from yourself: another admin can.
              onClick={isMe ? undefined : () => open("role")}
            />
          </SettingsList>
          <SettingsList title="Bookings">
            <SettingsRow
              label="Upcoming"
              value={bookedDays(bookings.length)}
              onClick={() => open("bookings")}
            />
            <SettingsRow
              label="Weekly booking"
              value={person.hasRecurring ? "Set up" : "Off"}
              // Only its owner can set one up, so off has nothing to open.
              onClick={person.hasRecurring ? () => open("weekly") : undefined}
            />
          </SettingsList>
          {desk && (
            <SettingsList>
              <SettingsAction
                label="Unassign desk"
                onClick={() => open("unassign")}
              />
            </SettingsList>
          )}
        </>
      )}
      page={(sub, close) => {
        let description = capitalize(name);
        switch (sub) {
          case "unassign":
            return {
              title: "Unassign desk",
              description,
              body: (
                <UnassignConfirm desk={desk} index={index} onDone={close} />
              ),
            };
          case "desk":
            return {
              title: desk ? "Move to another desk" : "Give a desk",
              description,
              body: (
                <DeskChoice
                  person={person}
                  desk={desk}
                  data={data}
                  index={index}
                  onDone={close}
                />
              ),
            };
          case "name":
            return {
              title: "Name",
              description,
              body: <RenameForm person={person} onDone={close} />,
            };
          case "role":
            return {
              title: "Role",
              description,
              body: <RoleChoice person={person} onDone={close} />,
            };
          case "weekly":
            return {
              title: "Weekly booking",
              description,
              body: (
                <>
                  <p className="text-[15px] leading-snug text-ink">
                    Books {desk ? `desk ${deskLabel(desk)}` : "their desk"} on
                    the same days every week. If you stop it, the days it
                    already booked stay booked.
                  </p>
                  <ConfirmStep
                    confirmLabel="Stop weekly booking"
                    fields={{ intent: "stop-recurring", userId: person.id }}
                    onDone={close}
                  />
                </>
              ),
            };
        }
        return {
          title: "Upcoming bookings",
          description,
          body: (
            <BookingSection
              bookings={bookings}
              index={index}
              show="desk"
              clearFields={{ intent: "clear-person", userId: person.id }}
              empty={`${first} has nothing booked from today on.`}
            />
          ),
        };
      }}
    />
  );
}

/** Picks the person's new desk, then says what that changes. */
function DeskChoice({
  person,
  desk,
  data,
  index,
  onDone,
}: {
  person: AdminPerson;
  desk: AdminDesk | null | undefined;
  data: AdminData;
  index: Index;
  onDone: () => void;
}) {
  let [step, go, frame, key] = useSteps<{ desk?: AdminDesk }>({});

  return (
    <div key={key} {...frame}>
      {step.desk ? (
        <MoveConfirm
          desk={step.desk}
          person={person}
          index={index}
          onBack={() => go({})}
          onDone={onDone}
        />
      ) : (
        <DeskPicker
          data={data}
          exclude={desk?.id}
          onPick={(picked) => go({ desk: picked })}
        />
      )}
    </div>
  );
}

function RoleChoice({
  person,
  onDone,
}: {
  person: AdminPerson;
  onDone: () => void;
}) {
  let [picked, setPicked] = useState(() => person.role);
  let first = capitalize(person.firstName);
  let roles = [
    { role: "user", label: "Member", hint: "Books desks" },
    { role: "admin", label: "Admin", hint: "Also has this Admin tab" },
  ] as const;

  return (
    <>
      <ul className={listClass} aria-label="Role">
        {roles.map(({ role, label, hint }) => (
          <li key={role} className="border-b border-line last:border-b-0">
            <button
              type="button"
              aria-pressed={picked === role}
              onClick={() => setPicked(role)}
              className={cn(rowClass, "border-b-0")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="text-[15px] font-medium">{label}</span>
                <span className="text-xs text-ink-muted">{hint}</span>
              </span>
              {picked === role && (
                <Check aria-hidden="true" className="size-4 text-moss-edge" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {picked !== person.role && (
        <ConfirmStep
          question={
            picked === "admin"
              ? `${first} gets this Admin tab and can change any desk or booking.`
              : `${first} loses the Admin tab.`
          }
          confirmLabel={picked === "admin" ? "Make admin" : "Remove admin role"}
          tone={picked === "admin" ? "primary" : "danger"}
          fields={{ intent: "set-role", userId: person.id, role: picked }}
          onDone={onDone}
        />
      )}
    </>
  );
}

function DeskPicker({
  data,
  exclude,
  onPick,
}: {
  data: AdminData;
  exclude?: number;
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
      <SearchField
        id="admin-desk-picker"
        label="Search desk or owner"
        value={query}
        onChange={setQuery}
        results={plural(desks.length, "desk")}
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

function RenameForm({
  person,
  onDone,
}: {
  person: AdminPerson;
  onDone: () => void;
}) {
  let fetcher = useAdminFetcher(onDone);
  let [firstName, setFirstName] = useState(() => person.firstName);
  let [lastName, setLastName] = useState(() => person.lastName);
  let busy = fetcher.state !== "idle";

  let changed =
    firstName.trim() !== person.firstName ||
    lastName.trim() !== person.lastName;
  let input =
    "h-11 w-full rounded-[10px] border border-field bg-paper px-3 text-base text-ink focus-visible:border-moss focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-moss";

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
      <input type="hidden" name="intent" value="rename" />
      <input type="hidden" name="userId" value={person.id} />
      <label className="grid gap-1.5 text-[13px] text-ink-muted">
        First name
        <input
          name="firstName"
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          required
          autoComplete="off"
          className={input}
        />
      </label>
      <label className="grid gap-1.5 text-[13px] text-ink-muted">
        Last name
        <input
          name="lastName"
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          required
          autoComplete="off"
          className={input}
        />
      </label>
      <Button
        type="submit"
        variant="primary"
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
function BookingSection({
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

/**
 * A link that asks once more before it posts: the first tap swaps it for
 * the question, the real button and "Keep". Built into the page because the
 * browser's confirm() is easy to click through and looks out of place.
 */
function ConfirmAction({
  label,
  question,
  confirmLabel,
  fields,
}: {
  label: string;
  question: string;
  confirmLabel: string;
  fields: Record<string, string | number>;
}) {
  let fetcher = useFetcher();
  let [asking, setAsking] = useState(false);
  let busy = fetcher.state !== "idle";
  let questionId = useId();
  // Set when the question closes with focus inside it, so the button that
  // asked gets focus back rather than the page.
  let returnFocus = useRef(false);
  let focusOnReturn = (node: HTMLButtonElement | null) => {
    if (node && returnFocus.current) {
      returnFocus.current = false;
      node.focus();
    }
  };

  if (!asking) {
    return (
      <button
        ref={focusOnReturn}
        type="button"
        onClick={() => setAsking(true)}
        className={cn(
          "rounded text-[13px] font-semibold normal-case tracking-normal text-danger hover:underline",
          focusRing,
        )}
      >
        {label}
      </button>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/admin"
      onSubmit={(event) => {
        event.preventDefault();
        let form = event.currentTarget;
        let hadFocus = form.contains(document.activeElement);
        // What was asked about may be gone afterwards (the bookings it
        // cleared, the owner it removed); then focus goes to the sheet.
        let home = form.closest<HTMLElement>("[data-sheet-step]");
        void fetcher.submit(form).then(() => {
          returnFocus.current = hadFocus;
          setAsking(false);
          if (hadFocus) rescueFocus(home);
        });
      }}
      className="border-danger/40 bg-danger/5 flex w-full basis-full flex-col gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13px] font-normal normal-case leading-snug tracking-normal text-ink"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <p id={questionId}>{question}</p>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="tall"
          variant="primary"
          disabled={busy}
          autoFocus
          // Focus lands here, so the question is read out with it.
          aria-describedby={questionId}
          className="hover:bg-danger/90 flex-1 bg-danger focus-visible:ring-danger"
        >
          {busy ? "Working..." : confirmLabel}
        </Button>
        <Button
          type="button"
          variant="quiet"
          size="tall"
          className="flex-1"
          onClick={(event) => {
            returnFocus.current = event.currentTarget.contains(
              document.activeElement,
            );
            setAsking(false);
          }}
        >
          Keep
        </Button>
      </div>
    </fetcher.Form>
  );
}

/** A settings-style group: rows that show a value and open a page. */
function SettingsList({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  let id = useId();
  return (
    <div className="grid gap-2">
      {title && (
        <h3 id={id} className="px-1 text-[13px] text-ink-muted">
          {title}
        </h3>
      )}
      <ul className={listClass} aria-labelledby={title ? id : undefined}>
        {children}
      </ul>
    </div>
  );
}

/**
 * One row of a settings list. With `onClick` it opens its page and ends in a
 * chevron; without, it only shows the value.
 */
function SettingsRow({
  label,
  value,
  valueClassName,
  onClick,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  onClick?: () => void;
}) {
  let content = (
    <>
      <span className="shrink-0 text-[15px] font-medium">{label}</span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-right text-[15px] text-ink-muted",
          valueClassName,
        )}
      >
        {value}
      </span>
      {onClick && (
        <ChevronRight
          aria-hidden="true"
          className="-mr-1 size-4 shrink-0 text-ink-muted"
        />
      )}
    </>
  );

  return (
    <li className="border-b border-line last:border-b-0">
      {onClick ? (
        <button
          type="button"
          aria-haspopup="dialog"
          onClick={onClick}
          className={cn(rowClass, "min-h-12 border-b-0")}
        >
          {content}
        </button>
      ) : (
        <div
          className={cn(rowClass, "min-h-12 border-b-0 hover:bg-transparent")}
        >
          {content}
        </div>
      )}
    </li>
  );
}

/** A red settings row that does its thing straight away, no page. */
function SettingsAction({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          rowClass,
          "min-h-12 border-b-0 text-[15px] font-medium text-danger",
        )}
      >
        {label}
      </button>
    </li>
  );
}

function bookedDays(count: number) {
  return count ? plural(count, "day") : "None";
}

/**
 * Steps inside a page (pick, then confirm). Moving on replaces the button
 * you pressed, so the new step takes focus instead of the page.
 */
function useSteps<T extends object>(first: T) {
  let [step, setStep] = useState(first);
  let [count, setCount] = useState(0);
  let moved = useRef(false);

  function go(next: T) {
    moved.current = true;
    setStep(next);
    setCount((n) => n + 1);
  }

  let frame = {
    tabIndex: -1,
    className: "flex flex-col gap-5 focus:outline-none",
    ref: (node: HTMLDivElement | null) => {
      if (node && moved.current) {
        moved.current = false;
        node.focus();
      }
    },
  };

  // A new key per step, so each step mounts fresh and takes focus.
  return [step, go, frame, count] as const;
}

/** The last step of a page: what will happen, and the button that does it. */
function ConfirmStep({
  question,
  confirmLabel,
  fields,
  tone = "danger",
  onDone,
}: {
  question?: string;
  confirmLabel: string;
  fields: Record<string, string | number>;
  tone?: "danger" | "primary";
  onDone: () => void;
}) {
  let fetcher = useAdminFetcher(onDone);
  let busy = fetcher.state !== "idle";
  let questionId = useId();

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
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {question && (
        <p
          id={questionId}
          className="rounded-[10px] bg-paper-muted px-3.5 py-3 text-[13px] leading-snug"
        >
          {question}
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        size="tall"
        disabled={busy}
        aria-describedby={question ? questionId : undefined}
        className={cn(
          tone === "danger" &&
            "hover:bg-danger/90 bg-danger focus-visible:ring-danger",
        )}
      >
        {busy ? "Working..." : confirmLabel}
      </Button>
    </fetcher.Form>
  );
}

type Sub =
  | "owner"
  | "bookings"
  | "desk"
  | "name"
  | "role"
  | "weekly"
  | "unassign";

/** An item of the desktop actions menu, and the page it opens. */
type Action = {
  label: string;
  danger?: boolean;
} & (
  | { sub: Sub; run?: never }
  /** Posts these fields straight away, no sheet. */
  | { run: Record<string, string | number>; sub?: never }
);

type Page = { title: string; description: string; body: ReactNode };

/**
 * The admin sheet, built on Silk's "sheet with stacking" pattern: a floating
 * card from the bottom on phones and from the right on larger screens. It
 * lists settings rows, and each row opens its page as a second card of the
 * same size stacked on top, which nudges this one back so its edge peeks
 * out. Closing the page (Back, a swipe, Escape) comes back here.
 */
function AdminSheet({
  trigger,
  title,
  titleClassName,
  description,
  rows,
  page,
  menu,
}: {
  trigger: ReactNode;
  title: string;
  titleClassName?: string;
  description: string;
  rows: (open: (sub: Sub) => void) => ReactNode;
  page: (sub: Sub, close: () => void) => Page;
  menu?: { label: string; actions: Action[] };
}) {
  if (menu) {
    return (
      <ActionsMenu
        trigger={trigger}
        label={menu.label}
        actions={menu.actions}
        page={page}
      />
    );
  }

  return (
    <StackedAdminSheet
      trigger={trigger}
      title={title}
      titleClassName={titleClassName}
      description={description}
      rows={rows}
      page={page}
    />
  );
}

/**
 * On larger screens a row's Manage button opens a menu of its actions, and
 * each action opens one sheet with just that page.
 */
function ActionsMenu({
  trigger,
  label,
  actions,
  page,
}: {
  trigger: ReactNode;
  label: string;
  actions: Action[];
  page: (sub: Sub, close: () => void) => Page;
}) {
  let fetcher = useFetcher();
  let [presented, setPresented] = useState(false);
  let [sub, setSub] = useState<Sub | null>(null);
  let [opened, setOpened] = useState(0);
  let [travelStatus, setTravelStatus] = useState("idleOutside");

  function open(next: Sub) {
    setSub(next);
    setOpened((n) => n + 1);
    setPresented(true);
  }

  let current = sub && page(sub, () => setPresented(false));

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            // Back to the page, not the row, when a sheet takes over.
            onCloseAutoFocus={(event) => presented && event.preventDefault()}
            className="z-30 min-w-56 rounded-xl border border-line bg-paper p-1.5 font-display text-ink shadow-[0_12px_32px_rgb(0_0_0/0.14)]"
          >
            <DropdownMenu.Label className="truncate px-2.5 pb-1.5 pt-1 text-xs capitalize text-ink-muted">
              {label}
            </DropdownMenu.Label>
            {actions.map((action, i) => (
              <Fragment key={action.label}>
                {action.danger && !actions[i - 1]?.danger && (
                  <DropdownMenu.Separator className="mx-1 my-1.5 h-px bg-line" />
                )}
                <DropdownMenu.Item
                  onSelect={() =>
                    action.run
                      ? void fetcher.submit(action.run, {
                          method: "post",
                          action: "/admin",
                        })
                      : open(action.sub)
                  }
                  aria-haspopup={action.sub ? "dialog" : undefined}
                  className={cn(
                    "flex cursor-pointer select-none items-center justify-between gap-4 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-paper-muted",
                    action.danger && "text-danger",
                  )}
                >
                  {action.label}
                  {action.sub && (
                    <ChevronRight
                      aria-hidden="true"
                      className="-mr-0.5 size-4 shrink-0 text-ink-muted"
                    />
                  )}
                </DropdownMenu.Item>
              </Fragment>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <Sheet.Root
        license="non-commercial"
        forComponent="closest"
        sheetRole="dialog"
        presented={presented && current !== null}
        onPresentedChange={setPresented}
      >
        <StackedCard
          isSmallDevice={false}
          status={{ "data-travel-status": travelStatus }}
          onTravelStatusChange={setTravelStatus}
          dismissLabel="Close"
        >
          {current && <PageBody key={opened} page={current} />}
        </StackedCard>
      </Sheet.Root>
    </>
  );
}

/** The phones' sheet: settings rows, each opening a page stacked on top. */
function StackedAdminSheet({
  trigger,
  title,
  titleClassName,
  description,
  rows,
  page,
}: {
  trigger: ReactNode;
  title: string;
  titleClassName?: string;
  description: string;
  rows: (open: (sub: Sub) => void) => ReactNode;
  page: (sub: Sub, close: () => void) => Page;
}) {
  let [presented, setPresented] = useState(false);
  let [sub, setSub] = useState<Sub | null>(null);
  let [subPresented, setSubPresented] = useState(false);
  let [opened, setOpened] = useState(0);
  let [travelStatus, setTravelStatus] = useState("idleOutside");
  let isNarrow = useMediaQuery("(max-width: 767px)");
  let [isSmallDevice, setIsSmallDevice] = useState(isNarrow);

  function present(value: boolean) {
    if (value) setIsSmallDevice(isNarrow);
    setSubPresented(false);
    setPresented(value);
  }

  function open(next: Sub) {
    setSub(next);
    setOpened((n) => n + 1);
    setSubPresented(true);
  }

  let current = sub && page(sub, () => setSubPresented(false));

  return (
    <Sheet.Root
      // Free to use for everyone and not commercialised, so the free
      // licence applies (https://silkhq.com/access).
      license="non-commercial"
      // The Admin tab's own stack, so its page can stack on it.
      forComponent="closest"
      sheetRole="dialog"
      presented={presented}
      onPresentedChange={(value) => present(value)}
    >
      <Sheet.Trigger asChild>{trigger}</Sheet.Trigger>

      <StackedCard
        isSmallDevice={isSmallDevice}
        // Lets tests wait for the sheet to come to rest, as on the desk sheet.
        status={{ "data-travel-status": travelStatus }}
        onTravelStatusChange={setTravelStatus}
        dismissLabel="Close"
        blur
      >
        <div className="flex flex-col gap-6">
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
          {rows(open)}
        </div>

        <PageSheet
          key={opened}
          isSmallDevice={isSmallDevice}
          presented={subPresented}
          onPresentedChange={setSubPresented}
          page={current}
        />
      </StackedCard>
    </Sheet.Root>
  );
}

/** A page of the admin sheet, stacked on top of it. */
function PageSheet({
  isSmallDevice,
  presented,
  onPresentedChange,
  page,
}: {
  isSmallDevice: boolean;
  presented: boolean;
  onPresentedChange: (value: boolean) => void;
  page: Page | null;
}) {
  let [travelStatus, setTravelStatus] = useState("idleOutside");

  return (
    <Sheet.Root
      license="non-commercial"
      forComponent="closest"
      sheetRole="dialog"
      presented={presented && page !== null}
      onPresentedChange={onPresentedChange}
    >
      <StackedCard
        isSmallDevice={isSmallDevice}
        status={{ "data-page-status": travelStatus }}
        onTravelStatusChange={setTravelStatus}
        dismissLabel="Back"
      >
        {page && <PageBody page={page} back />}
      </StackedCard>
    </Sheet.Root>
  );
}

/** A page's title, then what it does. `back` adds a Back link above. */
function PageBody({ page, back }: { page: Page; back?: boolean }) {
  return (
    <div
      data-sheet-step
      tabIndex={-1}
      className="flex flex-col gap-5 focus:outline-none"
    >
      <div className="flex flex-col gap-2">
        {back && (
          <Sheet.Trigger
            action="dismiss"
            className={cn(
              "-ml-1 inline-flex w-fit items-center gap-0.5 rounded text-[15px] font-semibold text-moss-edge hover:text-moss",
              focusRing,
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            Back
          </Sheet.Trigger>
        )}
        <div>
          <Sheet.Title className="pr-8 text-lg font-bold tracking-tight sm:text-xl">
            {page.title}
          </Sheet.Title>
          <Sheet.Description className="mt-0.5 text-[13px] capitalize text-ink-muted">
            {page.description}
          </Sheet.Description>
        </div>
      </div>
      {page.body}
    </div>
  );
}

/**
 * The floating card both levels share. Every card in the stack is the same
 * size, so the one underneath shows as an edge above (phones) or beside
 * (larger screens) the one on top.
 */
function StackedCard({
  isSmallDevice,
  status,
  onTravelStatusChange,
  dismissLabel,
  blur,
  children,
}: {
  isSmallDevice: boolean;
  status: Record<string, string>;
  onTravelStatusChange: (status: string) => void;
  dismissLabel: string;
  /** Blurs the page behind on phones, like the app's other sheets. */
  blur?: boolean;
  children: ReactNode;
}) {
  let placement = isSmallDevice ? ("bottom" as const) : ("right" as const);

  return (
    <Sheet.Portal>
      <Sheet.View
        {...status}
        className={cn("admin-sheet-view", `admin-sheet-${placement}`)}
        onTravelStatusChange={onTravelStatusChange}
        contentPlacement={placement}
        tracks={placement}
        swipeOvershoot={isSmallDevice}
        nativeEdgeSwipePrevention
      >
        <Sheet.Backdrop
          className="admin-sheet-backdrop"
          travelAnimation={{ opacity: [0, 0.2] }}
          themeColorDimming="auto"
        />
        {blur && isSmallDevice && (
          <Sheet.Outlet
            className="desk-sheet-blur"
            travelAnimation={{ opacity: [0, 1] }}
          />
        )}
        <Sheet.Content
          className="admin-sheet-content"
          stackingAnimation={isSmallDevice ? stackUp : stackLeft}
        >
          <div className="admin-sheet-card">
            {isSmallDevice && (
              <Sheet.Handle
                className="desk-sheet-handle"
                action="dismiss"
                aria-label={dismissLabel}
              />
            )}
            {/* The close button sits in the scrolling body, so it scrolls
            away with the title instead of floating over the content. */}
            <div className="admin-sheet-body relative font-display text-ink">
              {!isSmallDevice && (
                <Sheet.Trigger
                  action="dismiss"
                  aria-label="Close"
                  className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full text-ink-muted hover:bg-paper-muted hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </Sheet.Trigger>
              )}
              {children}
            </div>
          </div>
        </Sheet.Content>
      </Sheet.View>
    </Sheet.Portal>
  );
}

// Silk's stacking values: the card underneath moves 10px back and shrinks a
// little from its far edge, and each card further down tucks in 2.5px more.
let stackOffset = ({ progress }: { progress: number }) =>
  progress <= 1 ? `${progress * -10}px` : `calc(-12.5px + 2.5px * ${progress})`;
let stackUp = {
  translateY: stackOffset,
  scale: [1, 0.933] as [number, number],
  transformOrigin: "50% 0",
};
let stackLeft = {
  translateX: stackOffset,
  scale: [1, 0.933] as [number, number],
  transformOrigin: "0 50%",
};
