import { format } from "date-fns";
import { type MetaFunction } from "react-router";
import { DeskButton } from "~/components/desk-button";
import { DeskModal } from "~/components/desk-selection-modal";
import { FiltersForm } from "~/components/filters-form";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { cn } from "~/lib/utils";
import { Route } from "./+types/_index";

export const meta: MetaFunction = () => {
  return [{ title: "View desks" }];
};

export async function loader({ request }: Route.LoaderArgs) {
  let { userId, role } = await requireAuthCookie(request);
  let url = new URL(request.url);
  let showFree = url.searchParams.get("show-free");
  let column = url.searchParams.get("column");
  let block = url.searchParams.get("block");
  let selectedDayFilter = url.searchParams.get("selected-day");

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

  return { desks: sortedDesksOnBlockRowAndColumn, userId, role };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <section className="flex flex-col gap-16 md:flex-row md:gap-24">
      <FiltersForm />

      <div className="flex flex-1 flex-col gap-8">
        {Object.entries(loaderData.desks).map(([block, desksData]) => {
          return (
            <div key={block} className="flex flex-col gap-2">
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
        })}
      </div>
    </section>
  );
}
