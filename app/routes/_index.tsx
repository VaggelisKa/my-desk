import { format } from "date-fns";
import { Suspense } from "react";
import { Await, type MetaFunction } from "react-router";
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

const skeletonBlocks = [6, 6, 6, 3, 6, 6, 6];

function DesksSkeleton() {
  return (
    <>
      {skeletonBlocks.map((deskCount, blockIndex) => (
        <div key={blockIndex} className="flex flex-col gap-2">
          <Skeleton className="h-7 w-20" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: deskCount }).map((_, deskIndex) => (
              <Skeleton key={deskIndex} className="h-[124px] rounded-lg" />
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
