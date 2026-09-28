import { SheetStack } from "@silk-hq/components";
import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { AdminHeader, type AdminData } from "~/components/admin/shared";
import {
  handleAdminAction,
  loadAdminData,
  requireAdmin,
} from "~/lib/admin.server";
import { formatDate, officeNow } from "~/lib/dates";
import { cached } from "~/lib/tab-cache";
import type { Route } from "./+types/admin";

// The Admin tab: Desks (/admin), People (/admin/people) and Bookings
// (/admin/bookings). They share one loader, one action and this header, so
// the switch stays mounted and every sheet sees the same data.

export let meta: Route.MetaFunction = () => [{ title: "Admin" }];

export async function loader({ request }: Route.LoaderArgs) {
  let { userId } = await requireAdmin(request);
  let data = await loadAdminData();

  return { ...data, me: userId, today: formatDate(officeNow()) };
}

export async function action({ request }: Route.ActionArgs) {
  return handleAdminAction(request);
}

// The same for every segment, so one entry serves all three.
export function clientLoader({
  serverLoader,
  request,
}: Route.ClientLoaderArgs) {
  return cached("routes/admin", request.signal, () => serverLoader());
}

// Switching segments shows the same data, so only a change refetches it. A
// revalidation of the same page still runs, so a background refresh can show
// newer data.
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

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    // The stack the admin sheets and their pages share.
    <SheetStack.Root asChild>
      <section className="flex w-full flex-col gap-6 font-display text-ink">
        <AdminHeader />
        <Outlet context={loaderData satisfies AdminData} />
      </section>
    </SheetStack.Root>
  );
}
