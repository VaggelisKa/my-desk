import { Link, useLoaderData } from "@remix-run/react";
import { type MetaFunction, type LoaderFunctionArgs } from "@vercel/remix";
import { eq } from "drizzle-orm";
import { ReservationsTable } from "~/components/reservations-table";
import { Button } from "~/components/ui/button";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema.server";

export let meta: MetaFunction = () => [
  {
    title: "View Reservations",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let userId = await requireAuthCookie(request);
  let reservationsRes = await db.query.reservations.findMany({
    with: {
      desks: {
        columns: {
          id: false,
          userId: false,
        },
      },
    },
    columns: {
      userId: false,
    },
    where: eq(reservations.userId, userId),
  });

  console.log(reservationsRes);

  return { reservations: reservationsRes };
}

export default function ReservationsPage() {
  let { reservations } = useLoaderData<typeof loader>();

  return reservations.length ? (
    <ReservationsTable />
  ) : (
    <div className="flex flex-col items-center justify-center gap-6">
      <CalendarCheckIcon className="h-16 w-16 text-gray-400 dark:text-gray-500" />
      <div className="space-y-2 text-center">
        <h3 className="text-2xl font-semibold">No Reservations Yet</h3>
        <p className="text-gray-500 dark:text-gray-500">
          You haven't made any reservations yet!
        </p>
      </div>
      <Button className="padding-0 w-full md:w-auto" asChild>
        <Link className="flex gap-1 p-4" to="/reserve">
          Make a reservation
        </Link>
      </Button>
    </div>
  );
}

function CalendarCheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
      <line x1="16" x2="16" y1="2" y2="6" />
      <line x1="8" x2="8" y1="2" y2="6" />
      <line x1="3" x2="21" y1="10" y2="10" />
      <path d="m9 16 2 2 4-4" />
    </svg>
  );
}
