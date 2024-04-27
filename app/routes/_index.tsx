import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";

import { requireAuthCookie } from "~/cookies.server";

import { DeskButton } from "~/components/desk-button";
import { DeskModal } from "~/components/desk-selection-modal";
import { db } from "~/lib/db/drizzle.server";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let userId = await requireAuthCookie(request);

  let desks = await db.query.desks.findMany({
    columns: {
      block: true,
      row: true,
      column: true,
      id: true,
    },
    with: {
      reservations: true,
      user: true,
    },
  });

  let desksAggregatedByBlock = desks.reduce(
    (acc, desk) => {
      if (!acc[desk.block]) {
        acc[desk.block] = [];
      }

      acc[desk.block].push(desk);

      return acc;
    },
    {} as Record<number, typeof desks>,
  );

  return { desks: desksAggregatedByBlock, userId };
}

export default function Index() {
  let data = useLoaderData<typeof loader>();

  return (
    <section>
      <div className="flex flex-col gap-8">
        {Object.entries(data.desks).map(([block, desks]) => {
          return (
            <div key={block} className="flex flex-col gap-2">
              <span className="text-lg font-bold">Block {block}</span>
              <div className="grid grid-cols-3 gap-2">
                {desks.map((desk) => (
                  <DeskModal
                    key={desk.id}
                    TriggerElement={<DeskButton name={desk.user?.firstName} />}
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
