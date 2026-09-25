import { eq } from "drizzle-orm";
import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { BookingsHeader } from "~/components/bookings";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks } from "~/lib/db/schema";
import type { Route } from "./+types/_bookings";

// The Bookings tab: Upcoming (/reservations) and Recurring
// (/automatic-reservations) keep their own loaders and actions, and share
// this header so the switch between them stays mounted and animates.

export async function loader({ request }: Route.LoaderArgs) {
  let { userId } = await requireAuthCookie(request);
  let desk = await db.query.desks.findFirst({
    where: eq(desks.userId, userId),
    columns: { id: true, block: true, row: true, column: true },
  });

  return { desk: desk ?? null };
}

// Your desk only changes when an admin reassigns it, not on anything done on
// these pages, so switching segments does not refetch it.
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod ? defaultShouldRevalidate : false;
}

export default function BookingsLayout({
  loaderData: { desk },
}: Route.ComponentProps) {
  return (
    <section className="flex w-full flex-col gap-8 font-display text-ink">
      <BookingsHeader desk={desk} />
      <Outlet />
    </section>
  );
}
