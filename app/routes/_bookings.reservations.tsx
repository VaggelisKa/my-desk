import { getTime, startOfDay } from "date-fns";
import { and, asc, eq, gte } from "drizzle-orm";
import { data, useRouteLoaderData } from "react-router";
import { dataWithError, dataWithSuccess } from "remix-toast";
import {
  BookingList,
  EmptyBookings,
  type Booking,
} from "~/components/bookings";
import { requireAuthCookie } from "~/cookies.server";
import { formatDate } from "~/lib/dates";
import { db } from "~/lib/db/drizzle.server";
import { reservations } from "~/lib/db/schema";
import type { Route } from "./+types/_bookings.reservations";
import type { loader as bookingsLoader } from "./_bookings";

export let meta: Route.MetaFunction = () => [
  {
    title: "Bookings",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  let { userId } = await requireAuthCookie(request);
  let now = new Date();
  let rows = await db.query.reservations.findMany({
    with: {
      desks: {
        columns: { id: true, block: true, row: true, column: true },
        with: { user: { columns: { id: true, firstName: true } } },
      },
    },
    where: and(
      eq(reservations.userId, userId),
      gte(reservations.dateTimestamp, getTime(startOfDay(now))),
    ),
    orderBy: [asc(reservations.dateTimestamp)],
  });

  let bookings: Booking[] = rows.flatMap((r) =>
    r.desks && r.date && r.deskId !== null
      ? [
          {
            deskId: r.deskId,
            day: r.day,
            date: r.date,
            userId: r.userId,
            desk: r.desks,
            mine: r.desks.user?.id === userId,
            ownerName: r.desks.user?.firstName ?? null,
          },
        ]
      : [],
  );

  return {
    bookings,
    today: formatDate(now),
  };
}

export async function action({ request }: Route.ActionArgs) {
  let { userId, role } = await requireAuthCookie(request);
  let formData = await request.formData();
  let reservationDate = String(formData.get("reservation-date"));
  let reservationUserId = String(formData.get("reservation-user-id"));
  let reservationDay = String(formData.get("reservation-day"));
  let deskId = String(formData.get("desk-id"));

  if (!reservationDate || !reservationUserId || !reservationDay || !deskId) {
    return data("Reservation information missing", { status: 400 });
  }

  if (request.method === "DELETE") {
    let deleted = await db
      .delete(reservations)
      .where(
        and(
          // Regular users can only delete their own reservations, whichever
          // user id the form claims.
          role === "admin" ? undefined : eq(reservations.userId, userId),
          eq(reservations.date, reservationDate),
          eq(reservations.day, reservationDay),
          eq(reservations.deskId, Number(deskId)),
        ),
      )
      .returning({ deskId: reservations.deskId });

    if (!deleted.length) {
      return dataWithError(
        null,
        { message: "Reservation not found!" },
        { status: 404 },
      );
    }
  }

  return dataWithSuccess(
    null,
    { message: "Reservation deleted!" },
    { status: 200 },
  );
}

export default function ReservationsPage({
  loaderData: { bookings, today },
}: Route.ComponentProps) {
  let desk =
    useRouteLoaderData<typeof bookingsLoader>("routes/_bookings")?.desk;

  return bookings.length ? (
    <BookingList bookings={bookings} today={today} />
  ) : (
    <EmptyBookings desk={desk ?? null} />
  );
}
