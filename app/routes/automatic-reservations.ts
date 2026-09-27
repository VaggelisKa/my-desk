import { redirect } from "react-router";

// Old address of Bookings › Recurring, kept for bookmarks.
export function loader() {
  return redirect("/bookings/recurring", 301);
}
