import { format } from "date-fns";
import { Suspense } from "react";
import {
  Await,
  type MetaFunction,
  type ShouldRevalidateFunctionArgs,
  useSearchParams,
} from "react-router";
import { DayStrip, DeskFilters } from "~/components/desk-filters";
import { DeskSheet } from "~/components/desk-sheet";
import { DeskTile, type DeskTileState } from "~/components/desk-tile";
import { ErrorCard } from "~/components/error-card";
import { Skeleton } from "~/components/ui/skeleton";
import { Wall } from "~/components/wall";
import { requireAuthCookie } from "~/cookies.server";
import { formatDate, normalizeDay, parseDate } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { reserveDesk } from "~/lib/reservations.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_index";

export const meta: MetaFunction = () => {
  return [{ title: "Desks" }];
};

type DeskQuery = {
  showFree: string | null;
  column: string | null;
  block: string | null;
  /** The day the map shows, in `dd.MM.yyyy`. */
  selectedDayFilter: string;
};

async function loadDesks({
  showFree,
  column,
  block,
  selectedDayFilter,
}: DeskQuery) {
  let desksRes = await db.query.desks.findMany({
    columns: {
      block: true,
      row: true,
      column: true,
      id: true,
    },
    with: {
      reservations: {
        columns: {
          date: true,
          week: true,
          day: true,
        },
        with: {
          users: {
            columns: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
      user: {
        columns: {
          firstName: true,
          lastName: true,
          id: true,
        },
      },
    },
  });

  let desksAggregatedByBlock = desksRes.reduce(
    (acc, desk) => {
      if (
        !acc[desk.block] &&
        (block === null || block === "all" || block === desk.block.toString())
      ) {
        acc[desk.block] = [];
      }

      let reserved = !!desk.reservations.find(
        (r) => r.date === selectedDayFilter,
      );

      if (
        (showFree && reserved) ||
        (column !== null && column !== "all" && desk.column !== Number(column))
      ) {
        acc[desk.block]?.push({
          ...desk,
          disabled: true,
          reserved: true,
        });
      } else if (reserved && !showFree) {
        acc[desk.block]?.push({ ...desk, reserved: true });
      } else {
        acc[desk.block]?.push(desk);
      }

      return acc;
    },
    {} as Record<
      number,
      Array<
        (typeof desksRes)[number] & { disabled?: boolean; reserved?: boolean }
      >
    >,
  );

  let sortedDesksOnBlockRowAndColumn = Object.entries(
    desksAggregatedByBlock,
  ).reduce(
    (acc, [block, desks]) => {
      acc[block] = desks.sort((a, b) => a.row - b.row || a.column - b.column);

      return acc;
    },
    {} as Record<
      string,
      Array<
        (typeof desksRes)[number] & { disabled?: boolean; reserved?: boolean }
      >
    >,
  );

  return sortedDesksOnBlockRowAndColumn;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  let { userId, role } = await requireAuthCookie(request);

  // "Today" comes from the server so the first render and hydration agree
  // even when the browser sits in another timezone. A missing or malformed
  // `selected-day` means today.
  let today = formatDate(new Date());
  let selectedDay = normalizeDay(url.searchParams.get("selected-day")) ?? today;

  // Not awaited on purpose: the shell streams immediately and the desk grid
  // fills in once the query resolves.
  let desks = loadDesks({
    showFree: url.searchParams.get("show-free"),
    column: url.searchParams.get("column"),
    block: url.searchParams.get("block"),
    selectedDayFilter: selectedDay,
  });

  return { desks, userId, role, today, selectedDay };
}

// Booking happens in the desk sheet, so its fetcher posts here and the grid
// revalidates with the new reservations while the sheet stays open.
export async function action({ request }: Route.ActionArgs) {
  let { userId } = await requireAuthCookie(request);

  return reserveDesk(userId, await request.formData());
}

// Fetcher actions that fail skip revalidation by default. A 409 means someone
// else just took the desk, so refresh the grid to show who.
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return actionStatus === 409 || defaultShouldRevalidate;
}

// Client navigations and revalidations (filter changes, reservation fetchers)
// await the query so `useNavigation` and fetchers stay pending until the
// refreshed grid is actually available. The initial document load still
// streams, because `clientLoader.hydrate` is off by default.
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  let data = await serverLoader();

  return { ...data, desks: await data.desks };
}

type Desks = Awaited<ReturnType<typeof loadDesks>>;

export default function Index({ loaderData }: Route.ComponentProps) {
  let { selectedDay, today } = loaderData;
  let dateLabel = format(parseDate(selectedDay), "EEE d MMM");

  return (
    <section className="flex w-full max-w-3xl flex-col gap-5 font-display text-ink">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-[20px] font-bold tracking-tight sm:text-[22px]">
            Desks
          </h1>
          <p className="text-sm text-ink-muted">
            {dateLabel}
            <Suspense>
              <Await resolve={loaderData.desks} errorElement={null}>
                {(desks) => (
                  <FreeCount desks={desks} selectedDay={selectedDay} />
                )}
              </Await>
            </Suspense>
          </p>
        </div>

        <DayStrip today={today} />
      </header>

      <DeskFilters />

      <Legend />

      <Suspense fallback={<DesksSkeleton />}>
        <Await
          resolve={loaderData.desks}
          errorElement={<ErrorCard message="Could not load desks." />}
        >
          {(desks) => (
            <FloorPlan
              desks={desks}
              userId={loaderData.userId}
              role={loaderData.role}
              selectedDay={selectedDay}
            />
          )}
        </Await>
      </Suspense>
    </section>
  );
}

// Counted from the reservations themselves, so the column and free-only
// filters (which only grey desks out) do not change the number. The block
// filter does, since it narrows which desks are loaded at all.
function FreeCount({
  desks,
  selectedDay,
}: {
  desks: Desks;
  selectedDay: string;
}) {
  let all = Object.values(desks).flat();
  let free = all.filter(
    (desk) => !desk.reservations.some((r) => r.date === selectedDay),
  ).length;

  return <span>{` · ${free} of ${all.length} free`}</span>;
}

let placements: Record<string, string> = {
  "1": " by the window",
  "2": " in the middle",
  "3": " by the aisle",
};

// The floor as it is laid out today: blocks stacked in order, three columns
// (window, middle, aisle), two rows per block except block 4, a wall before
// block 7. Chairs sit on the outside of each block so the rows read at a glance.
function FloorPlan({
  desks,
  userId,
  role,
  selectedDay,
}: {
  desks: Desks;
  userId: string;
  role?: "admin" | "user" | null;
  selectedDay: string;
}) {
  let [searchParams, setSearchParams] = useSearchParams();
  let all = Object.values(desks).flat();
  // "Book my desk" links here with `?desk=<id>` to open that desk's sheet.
  let openDesk = searchParams.get("desk");

  function closeDeskLink() {
    if (!openDesk) return;
    setSearchParams(
      (params) => {
        params.delete("desk");
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  }
  let nothingToPick = all.length > 0 && all.every((desk) => desk.disabled);
  let where = placements[searchParams.get("column") ?? ""] ?? "";

  return (
    <div className="relative max-w-[420px] pl-[26px] pr-[22px] sm:pl-8 sm:pr-7">
      {nothingToPick && (
        <p role="status" className="mb-3 text-[13px] text-ink-muted">
          {`No free desks${where} on ${format(parseDate(selectedDay), "EEEE")}. Try another day or placement.`}
        </p>
      )}

      <div
        aria-hidden="true"
        className="absolute bottom-1.5 left-1.5 top-7 w-2.5 rounded-[3px] border-[1.5px] border-mist-edge bg-mist"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1.5 right-2 top-7 border-l-2 border-dashed border-line"
      />

      <div
        aria-hidden="true"
        className="grid grid-cols-3 gap-2.5 text-center text-[11px] font-bold text-ink-muted"
      >
        <span>window</span>
        <span>middle</span>
        <span>aisle</span>
      </div>

      {Object.entries(desks).map(([block, desksData]) => (
        <div key={block} className="flex flex-col [&+&]:pt-5">
          {block === "7" && <Wall />}

          <div className="mt-2 text-[13px] font-bold">Block {block}</div>

          <div
            className={cn(
              "grid grid-cols-3 gap-x-2.5 gap-y-[22px] pb-3 pt-5 sm:gap-y-[26px] sm:pb-3.5 sm:pt-6",
              block === "4" ? "grid-rows-1" : "grid-rows-2",
            )}
          >
            {desksData.map((desk) => {
              let onSelectedDay = desk.reservations.find(
                (r) => r.date === selectedDay,
              );
              // Yours when you sit there that day, or it is your desk and
              // nobody else has it. A borrowed desk reads as taken even to
              // its owner; the sheet still lets them book other days.
              let state: DeskTileState = onSelectedDay
                ? onSelectedDay.users.id === userId
                  ? "mine"
                  : "taken"
                : desk.user?.id === userId
                  ? "mine"
                  : "free";
              let sitter =
                onSelectedDay && onSelectedDay.users.id !== desk.user?.id
                  ? onSelectedDay.users.firstName
                  : null;

              return (
                <DeskSheet
                  key={desk.id}
                  desk={desk}
                  userId={userId}
                  allowedToReserve={desk.user?.id === userId}
                  allowedToEdit={role === "admin"}
                  selectedDay={selectedDay}
                  autoOpen={openDesk === String(desk.id)}
                  onClose={closeDeskLink}
                >
                  <DeskTile
                    style={{ gridColumn: desk.column, gridRow: desk.row }}
                    name={desk.user?.firstName}
                    label={`${desk.block}.${desk.row}.${desk.column}`}
                    row={desk.row}
                    state={state}
                    sitter={sitter}
                    dimmed={desk.disabled}
                  />
                </DeskSheet>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Legend() {
  let swatch = "inline-block h-[9px] w-[14px] rounded-[2px] border";

  return (
    <div className="flex flex-wrap gap-4 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-ink bg-paper")} /> Free
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-ink bg-taken")} /> Taken
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-moss-edge bg-moss")} /> Yours
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-line bg-paper")} /> Unclaimed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <i className={cn(swatch, "border-dashed border-dim bg-transparent")} />{" "}
        Filtered out
      </span>
    </div>
  );
}

// Mirrors the office layout rendered above: blocks 1-7 in a 3x2 grid, block 4
// is a single row, and a wall sits above block 7.
const skeletonBlocks = ["1", "2", "3", "4", "5", "6", "7"];

function DesksSkeleton() {
  let [searchParams] = useSearchParams();
  let blockFilter = searchParams.get("block");
  let blocks =
    blockFilter === null || blockFilter === "all"
      ? skeletonBlocks
      : skeletonBlocks.filter((block) => block === blockFilter);

  return (
    <div className="max-w-[420px] pl-[26px] pr-[22px] sm:pl-8 sm:pr-7">
      {blocks.map((block) => {
        let singleRow = block === "4";

        return (
          <div key={block} className="flex flex-col [&+&]:pt-5">
            {block === "7" && <Wall />}

            <div className="mt-2 text-[13px] font-bold">Block {block}</div>
            <div
              className={cn(
                "grid grid-cols-3 gap-x-2.5 gap-y-[22px] pb-3 pt-5 sm:gap-y-[26px] sm:pb-3.5 sm:pt-6",
                singleRow ? "grid-rows-1" : "grid-rows-2",
              )}
            >
              {Array.from({ length: singleRow ? 3 : 6 }).map((_, i) => (
                <Skeleton key={i} className="h-11 w-full rounded sm:h-[50px]" />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
