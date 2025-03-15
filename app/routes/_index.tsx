import { format } from "date-fns";
import { Suspense } from "react";
import { type MetaFunction } from "react-router";
import { DesksArea, DesksAreaSkeleton } from "~/components/desks-area";
import { FiltersForm } from "~/components/filters-form";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import type { Route } from "./+types/_index";

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

  let desksPromise = db.query.desks
    .findMany({
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
    })
    .then((desksRes) => {
      let desksAggregatedByBlock = desksRes.reduce(
        (acc, desk) => {
          if (
            !acc[desk.block] &&
            (block === null ||
              block === "all" ||
              block === desk.block.toString())
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
            (column !== null &&
              column !== "all" &&
              desk.column !== Number(column))
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
            (typeof desksRes)[number] & {
              disabled?: boolean;
              reserved?: boolean;
            }
          >
        >,
      );

      let sortedDesksOnBlockRowAndColumn = Object.entries(
        desksAggregatedByBlock,
      ).reduce(
        (acc, [block, desks]) => {
          acc[block] = desks.sort(
            (a, b) => a.row - b.row || a.column - b.column,
          );

          return acc;
        },
        {} as Record<
          string,
          Array<
            (typeof desksRes)[number] & {
              disabled?: boolean;
              reserved?: boolean;
            }
          >
        >,
      );

      return sortedDesksOnBlockRowAndColumn;
    });

  return { desksPromise, userId, role };
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <section className="flex flex-col gap-16 lg:flex-row lg:gap-24">
      <FiltersForm />

      <Suspense fallback={<DesksAreaSkeleton />}>
        <DesksArea
          desksPromise={loaderData.desksPromise}
          userId={loaderData.userId}
          role={loaderData.role}
        />
      </Suspense>
    </section>
  );
}
