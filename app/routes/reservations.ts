import { redirect } from "react-router";

// Old address of Bookings › Upcoming, kept for bookmarks.
export function loader() {
  return redirect("/bookings", 301);
}
