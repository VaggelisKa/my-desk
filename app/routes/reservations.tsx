import { useLoaderData } from "@remix-run/react";
import { type LoaderFunctionArgs } from "@vercel/remix";
import { eq } from "drizzle-orm";
import { ReservationsTable } from "~/components/reservations-table";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema.server";

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

  return <ReservationsTable />;
}
