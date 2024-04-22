import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";

import { requireAuthCookie } from "~/cookies.server";

import { DeskButton } from "~/components/desk-button";
import { DialogDemo } from "~/components/desk-selection-modal";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema.server";
import { eq } from "drizzle-orm";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

let desksMock = {
  1: [
    { row: 1, seat: 1, userId: "1" },
    { row: 1, seat: 2, userId: "2" },
    { row: 1, seat: 3, userId: "3" },
    { row: 2, seat: 1, userId: "4" },
    { row: 2, seat: 2, userId: "5" },
    { row: 2, seat: 3, userId: "6" },
  ],
  2: [
    { row: 1, seat: 1, userId: "7" },
    { row: 1, seat: 2, userId: "8" },
    { row: 1, seat: 3, userId: "9" },
    { row: 2, seat: 1, userId: "10" },
    { row: 2, seat: 2, userId: "11" },
    { row: 2, seat: 3, userId: "12" },
  ],
  3: [
    { row: 1, seat: 1, userId: "7" },
    { row: 1, seat: 2, userId: "8" },
    { row: 1, seat: 3, userId: "9" },
    { row: 2, seat: 1, userId: "10" },
    { row: 2, seat: 2, userId: "11" },
    { row: 2, seat: 3, userId: "12" },
  ],
  4: [
    { row: 1, seat: 1, userId: "7" },
    { row: 1, seat: 2, userId: "8" },
    { row: 1, seat: 3, userId: "9" },
  ],
  5: [
    { row: 1, seat: 1, userId: "7" },
    { row: 1, seat: 2, userId: "8" },
    { row: 1, seat: 3, userId: "9" },
    { row: 2, seat: 1, userId: "10" },
    { row: 2, seat: 2, userId: "11" },
    { row: 2, seat: 3, userId: "12" },
  ],
  6: [
    { row: 1, seat: 1, userId: "7" },
    { row: 1, seat: 2, userId: "8" },
    { row: 1, seat: 3, userId: "9" },
    { row: 2, seat: 1, userId: "10" },
    { row: 2, seat: 2, userId: "11" },
    { row: 2, seat: 3, userId: "12" },
  ],
};

export async function loader({ request }: LoaderFunctionArgs) {
  let employeeNumber = await requireAuthCookie(request);
  let user = await db.select().from(users).where(eq(users.id, employeeNumber));

  return { user };
}

export default function Index() {
  let loaderData = useLoaderData<typeof loader>();

  console.log(loaderData);

  return (
    <section>
      <div className="flex flex-col gap-8">
        {Object.entries(desksMock).map(([block, desks]) => {
          return (
            <div key={block} className="flex flex-col gap-2">
              <span className="text-lg font-bold">Block {block}</span>
              <div className="grid grid-cols-3 gap-2">
                {desks.map((desk) => (
                  <DialogDemo
                    key={desk.row + desk.seat}
                    TriggerElement={<DeskButton />}
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
