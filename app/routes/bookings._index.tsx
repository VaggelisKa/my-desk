import { data, useRouteLoaderData } from "react-router";
import { BookingList, EmptyBookings } from "~/components/bookings";
import { claimedUserId, early, requireUser } from "~/cookies.server";
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

export async function loader(args: Route.LoaderArgs) {
  // The cookie already names who is asking, so their bookings load alongside
  // the check that they still exist, and go out only once that passed.
  let bookings = early(
    claimedUserId(args).then((id) => (id ? listUpcomingBookings(id) : [])),
  );
  await requireUser(args);

  return {
    bookings: await bookings,
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

export async function action(args: Route.ActionArgs) {
  let { request } = args;
  let user = await requireUser(args);

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
