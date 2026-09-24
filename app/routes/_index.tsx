import { format } from "date-fns";
import { Suspense } from "react";
import { Await, type MetaFunction, useSearchParams } from "react-router";
import { DeskButton } from "~/components/desk-button";
import { DeskModal } from "~/components/desk-selection-modal";
import { ErrorCard } from "~/components/error-card";
import { FiltersForm } from "~/components/filters-form";
import { Skeleton } from "~/components/ui/skeleton";
import { Wall } from "~/components/wall";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/_index";

export const meta: MetaFunction = () => {
  return [{ title: "View desks" }];
};

type DeskFilters = {
  showFree: string | null;
  column: string | null;
  block: string | null;
  selectedDayFilter: string | null;
};

async function loadDesks({
  showFree,
  column,
  block,
  selectedDayFilter,
}: DeskFilters) {
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

      let reserved = !!desk.reservations.find((r) =>
        selectedDayFilter?.length
          ? r.date === selectedDayFilter
          : r.date === format(new Date(), "dd.MM.yyyy"),
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

  // Not awaited on purpose: the shell streams immediately and the desk grid
  // fills in once the query resolves.
  let desks = loadDesks({
    showFree: url.searchParams.get("show-free"),
    column: url.searchParams.get("column"),
    block: url.searchParams.get("block"),
    selectedDayFilter: url.searchParams.get("selected-day"),
  });

  return { desks, userId, role };
}

// Client navigations and revalidations (filter changes, reservation fetchers)
// await the query so `useNavigation` and fetchers stay pending until the
// refreshed grid is actually available. The initial document load still
// streams, because `clientLoader.hydrate` is off by default.
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  let data = await serverLoader();

  return { ...data, desks: await data.desks };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <section className="flex flex-col gap-16 lg:flex-row lg:gap-24">
      <FiltersForm />

      <div className="flex flex-1 flex-col gap-8">
        <Suspense fallback={<DesksSkeleton />}>
          <Await
            resolve={loaderData.desks}
            errorElement={<ErrorCard message="Could not load desks." />}
          >
            {(desks) =>
              Object.entries(desks).map(([block, desksData]) => {
                return (
                  <div key={block} className="flex flex-col gap-2">
                    {block === "7" && <Wall className="mb-2" />}

                    <span className="text-lg font-bold">Block {block}</span>
                    <div
                      className={cn(
                        `grid grid-cols-3 grid-rows-2 gap-2`,
                        // Maybe there is a smarter way for this?
                        block === "4" && "grid-rows-1",
                      )}
                    >
                      {desksData.map((desk) => (
                        <DeskModal
                          key={desk.id}
                          TriggerElement={
                            <DeskButton
                              style={{
                                gridColumnStart: desk.column,
                                gridColumnEnd: desk.column,
                                gridRowStart: desk.row,
                                gridRowEnd: desk.row,
                              }}
                              className={
                                desk.reserved
                                  ? "border-b-2 border-b-red-400"
                                  : "border-b-2 border-b-green-400"
                              }
                              disabled={desk.disabled}
                              name={desk.user?.firstName}
                            />
                          }
                          desk={desk}
                          allowedToReserve={desk.user?.id === loaderData.userId}
                          allowedToEdit={loaderData.role === "admin"}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            }
          </Await>
        </Suspense>
      </div>
    </section>
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
    <>
      {blocks.map((block) => {
        let singleRow = block === "4";

        return (
          <div key={block} className="flex flex-col gap-2">
            {block === "7" && <Wall className="mb-2" />}

            <span className="text-lg font-bold">Block {block}</span>
            <div
              className={cn(
                "grid grid-cols-3 grid-rows-2 gap-2",
                singleRow && "grid-rows-1",
              )}
            >
              {Array.from({ length: singleRow ? 3 : 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[126px] w-[100px] rounded-lg" />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
