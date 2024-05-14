import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";
import { DeskButton } from "~/components/desk-button";
import { DeskModal } from "~/components/desk-selection-modal";
import { FiltersForm } from "~/components/filters-form";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";

export const meta: MetaFunction = () => {
  return [{ title: "View desks" }];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let { userId } = await requireAuthCookie(request);
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
    where: (desks, { eq }) =>
      Number(column) ? eq(desks.column, Number(column)) : undefined,
  });

  let desksAggregatedByBlock = desksRes.reduce(
    (acc, desk) => {
      if (
        showFree &&
        !!desk.reservations.find((r) => r.date === "14.05.2024")
      ) {
        return acc;
      }

      if (!acc[desk.block]) {
        acc[desk.block] = [];
      }

      acc[desk.block].push(desk);

      return acc;
    },
    {} as Record<number, typeof desksRes>,
  );

  return { desks: desksAggregatedByBlock, userId };
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
              <div className="grid grid-cols-3 gap-2">
                {desksData.map((desk) => (
                  <DeskModal
                    key={desk.id}
                    TriggerElement={
                      <DeskButton
                        style={{
                          gridColumnStart: desk.column,
                          gridColumnEnd: desk.column,
                        }}
                        name={desk.user?.firstName}
                      />
                    }
                    // @ts-expect-error Fix the type
                    desk={desk}
                    allowedToReserve={desk.user?.id === data.userId}
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
