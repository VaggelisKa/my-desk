import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { BookingsHeader } from "~/components/bookings";
import { requireAuthCookie } from "~/cookies.server";
import type { Route } from "./+types/bookings";

// The Bookings tab: Upcoming (/bookings) and Recurring
// (/bookings/recurring) keep their own loaders and actions, and share
// this header so the switch between them stays mounted and animates.

export async function loader({ request }: Route.LoaderArgs) {
  let { desk } = await requireAuthCookie(request);

  return { desk };
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
