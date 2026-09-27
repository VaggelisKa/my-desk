import { ArrowDown, ArrowUp, ChevronsUpDown, Search } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useFetcher, useOutletContext } from "react-router";
import { focusRing } from "~/components/admin/helpers";
import { SegmentSwitch } from "~/components/segment-switch";
import type {
  AdminActionData,
  AdminBooking,
  AdminDesk,
  AdminPerson,
} from "~/lib/admin.server";
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

/** Lookups every list and sheet shares. */
export function useIndex(data: AdminData) {
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

export type Index = ReturnType<typeof useIndex>;

export function SearchField({
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

export let listClass =
  "flex flex-col overflow-hidden rounded-xl border border-line bg-paper";

export let groupHeading =
  "flex flex-wrap items-baseline justify-between gap-2 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-ink-muted";

// Desktop (768px and up) shows tables, phones keep the lists. Both are in the
// page and CSS picks one, so there is no flash while the page hydrates.
export let tableWrap =
  "hidden overflow-hidden rounded-xl border border-line bg-paper md:block";

export let th =
  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-muted";

export let td = "px-4 py-2.5 align-middle";

// The row's own button stretches over the whole row, so any cell opens it.
export let tableRow =
  "relative border-t border-line hover:bg-paper-muted focus-within:bg-paper-muted";

export let stretched =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none";

type SortDir = "asc" | "desc";

type SortValue = string | number | null;

/**
 * Sorts a table by one column at a time. Tapping a column sorts by it, and
 * tapping it again flips the direction. Empty values (no owner, no desk) go
 * last whichever way it sorts; ties keep the list's own order.
 */
export function useSort<T, K extends string>(
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

export function SortHeader<K extends string>({
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

export function NothingFound({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line bg-paper px-5 py-8 text-sm text-ink-muted">
      {children}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Desks                                                              */
/* ------------------------------------------------------------------ */

export function BookedCount({
  count,
  short,
}: {
  count: number;
  short?: boolean;
}) {
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
export function Dash({ spoken }: { spoken: string }) {
  return (
    <>
      <span aria-hidden="true">–</span>
      <span className="sr-only">{spoken}</span>
    </>
  );
}

/**
 * A fetcher for /admin that runs `onDone` once its action succeeded. A failed
 * one leaves the sheet where it is, with its toast saying why.
 */
export function useAdminFetcher(onDone: () => void) {
  let fetcher = useFetcher<AdminActionData>();
  let finish = useEffectEvent(onDone);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data?.ok) finish();
  }, [fetcher.state, fetcher.data]);

  return fetcher;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-moss-soft px-1.5 py-px text-[10.5px] font-semibold uppercase tracking-[0.05em] text-moss-edge">
      {children}
    </span>
  );
}
