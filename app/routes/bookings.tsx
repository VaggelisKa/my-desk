import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { BookingsHeader } from "~/components/bookings";
import { requireUser } from "~/cookies.server";
import { cached } from "~/lib/tab-cache";
import type { Route } from "./+types/bookings";

// The Bookings tab: Upcoming (/bookings) and Recurring
// (/bookings/recurring) keep their own loaders and actions, and share
// this header so the switch between them stays mounted and animates.

export async function loader(args: Route.LoaderArgs) {
  let { desk } = await requireUser(args);

  return { desk };
}

// The same for Upcoming and Recurring, so one entry serves both.
export function clientLoader({
  serverLoader,
  request,
}: Route.ClientLoaderArgs) {
  return cached("routes/bookings", request, () => serverLoader());
}

// Your desk only changes when an admin reassigns it, not on anything done on
// these pages, so switching segments does not refetch it. A revalidation of
// the same page still runs, so a background refresh can show newer data.
export function shouldRevalidate({
  formMethod,
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod || currentUrl.href === nextUrl.href
    ? defaultShouldRevalidate
    : false;
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
