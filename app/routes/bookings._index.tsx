import { data, useRouteLoaderData } from "react-router";
import { BookingList, EmptyBookings } from "~/components/bookings";
import { requireAuthCookie } from "~/cookies.server";
import {
  listUpcomingBookings,
  removeBooking,
  removeBookings,
} from "~/lib/bookings.server";
import { formatDate, officeNow } from "~/lib/dates";
import { cacheKey, cached } from "~/lib/tab-cache";
import type { Route } from "./+types/bookings._index";
import type { loader as bookingsLoader } from "./bookings";

export let meta: Route.MetaFunction = () => [
  {
    title: "Bookings",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  let { userId } = await requireAuthCookie(request);

  return {
    bookings: await listUpcomingBookings(userId),
    today: formatDate(officeNow()),
  };
}

// Coming back shows your last list at once and refreshes it behind the scenes.
export function clientLoader({
  serverLoader,
  request,
}: Route.ClientLoaderArgs) {
  return cached(cacheKey("routes/bookings._index", request), request, () =>
    serverLoader(),
  );
}

export async function action({ request }: Route.ActionArgs) {
  let user = await requireAuthCookie(request);

  if (request.method !== "DELETE") {
    return data(null, { status: 405 });
  }

  let formData = await request.formData();

  return formData.get("intent") === "remove-many"
    ? removeBookings(user.userId, formData)
    : removeBooking(user, formData);
}

export default function UpcomingBookingsPage({
  loaderData: { bookings, today },
}: Route.ComponentProps) {
  let desk = useRouteLoaderData<typeof bookingsLoader>("routes/bookings")?.desk;

  return bookings.length ? (
    <BookingList bookings={bookings} today={today} />
  ) : (
    <EmptyBookings desk={desk ?? null} />
  );
}
