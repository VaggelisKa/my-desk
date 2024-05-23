import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";
import { format } from "date-fns";
import { DeskButton } from "~/components/desk-button";
import { DeskModal } from "~/components/desk-selection-modal";
import { FiltersForm } from "~/components/filters-form";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";

export const meta: MetaFunction = () => {
  return [{ title: "View desks" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let { userId, role } = await requireAuthCookie(request);
  let url = new URL(request.url);
  let showFree = url.searchParams.get("show-free");
  let column = url.searchParams.get("column");

  let desksRes = await db.query.desks.findMany({
    columns: {
      block: true,
      row: true,
      column: true,
      id: true,
    },
    with: {
      reservations: {
        with: {
          users: true,
        },
      },
      user: true,
    },
  });

  let desksAggregatedByBlock = desksRes.reduce(
    (acc, desk) => {
      if (!acc[desk.block]) {
        acc[desk.block] = [];
      }

      if (
        (showFree &&
          !!desk.reservations.find(
            (r) => r.date === format(new Date(), "dd.MM.yyyy"),
          )) ||
        (column !== null && column !== "all" && desk.column !== Number(column))
      ) {
        acc[desk.block].push({ ...desk, disabled: true });
      } else {
        acc[desk.block].push(desk);
      }

      return acc;
    },
    {} as Record<
      number,
      Array<(typeof desksRes)[number] & { disabled?: boolean }>
    >,
  );

  return { desks: desksAggregatedByBlock, userId, role };
}

export default function Index() {
  let data = useLoaderData<typeof loader>();

  return (
    <section className="flex flex-col gap-16 md:flex-row md:gap-24">
      <FiltersForm />

      <div className="flex flex-col gap-8 flex-1">
        {Object.entries(data.desks).map(([block, desksData]) => {
          return (
            <div key={block} className="flex flex-col gap-2">
              <span className="text-lg font-bold">Block {block}</span>
              <div className="grid grid-cols-3 grid-rows-2 gap-2">
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
                        disabled={desk.disabled}
                        name={desk.user?.firstName}
                      />
                    }
                    // @ts-expect-error Fix the type
                    desk={desk}
                    allowedToReserve={desk.user?.id === data.userId}
                    allowedToEdit={data.role === "admin"}
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
