import { Outlet, type ShouldRevalidateFunctionArgs } from "react-router";
import { AdminHeader, type AdminData } from "~/components/admin";
import {
  handleAdminAction,
  loadAdminData,
  requireAdmin,
} from "~/lib/admin.server";
import { formatDate, officeNow } from "~/lib/dates";
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

// Switching segments shows the same data, so only a change refetches it.
export function shouldRevalidate({
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  return formMethod ? defaultShouldRevalidate : false;
}

export default function AdminLayout({ loaderData }: Route.ComponentProps) {
  return (
    <section className="flex w-full flex-col gap-6 font-display text-ink">
      <AdminHeader />
      <Outlet context={loaderData satisfies AdminData} />
    </section>
  );
}
