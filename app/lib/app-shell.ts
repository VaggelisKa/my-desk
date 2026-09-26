// Plain values the app chrome shares with the pages around it.

export type Tab = "desks" | "bookings" | "metrics" | "admin";

/**
 * The column the masthead and every signed-in page share, so the first tab
 * sits on the page title's left edge and the avatar on the content's right
 * edge. Both live inside the same 16px gutter.
 */
export let PAGE_COLUMN = "mx-auto w-full max-w-3xl";

/** Secondary pages have no tab of their own; their parent tab stays lit. */
export function activeTab(pathname: string): Tab | undefined {
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return "admin";
  }
  if (pathname.startsWith("/metrics")) {
    return "metrics";
  }
  if (
    pathname.startsWith("/reservations") ||
    pathname.startsWith("/automatic-reservations")
  ) {
    return "bookings";
  }
  if (pathname === "/") {
    return "desks";
  }
  return undefined;
}
