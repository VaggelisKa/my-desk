import { db } from "~/lib/db/drizzle.server";

type DeskQuery = {
  showFree: string | null;
  column: string | null;
  block: string | null;
  /** The day the map shows, in `dd.MM.yyyy`. */
  selectedDayFilter: string;
};

/**
 * Every desk with its owner and bookings, grouped by block and sorted by
 * row and column. Desks the filters leave out come back `disabled`.
 */
export async function loadDesks({
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
        acc[desk.block]?.push({ ...desk, disabled: true });
      } else {
        acc[desk.block]?.push(desk);
      }

      return acc;
    },
    {} as Record<
      number,
      Array<(typeof desksRes)[number] & { disabled?: boolean }>
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
      Array<(typeof desksRes)[number] & { disabled?: boolean }>
    >,
  );

  return sortedDesksOnBlockRowAndColumn;
}
