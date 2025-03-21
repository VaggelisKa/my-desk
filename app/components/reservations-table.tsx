import { TrashIcon } from "@radix-ui/react-icons";
import { useFetcher } from "react-router";
import { Button } from "~/components/ui/button";
import { type users } from "~/lib/db/schema";

export function ReservationsTable({
  reservations,
}: {
  reservations: {
    deskId: number | null;
    day: string;
    week: number;
    date: string | null;
    desks: {
      row: number;
      block: number;
      column: number;
    } | null;
    users: typeof users.$inferSelect;
  }[];
}) {
  let fetcher = useFetcher();

  function isDeleting(reservation: (typeof reservations)[number]) {
    return (
      fetcher.state === "submitting" &&
      fetcher.formData?.get("desk-id") === String(reservation.deskId) &&
      fetcher.formData?.get("reservation-date") === String(reservation.date) &&
      fetcher.formData?.get("reservation-user-id") ===
        String(reservation.users.id) &&
      fetcher.formData?.get("reservation-day") === String(reservation.day)
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="relative overflow-x-auto">
        <table className="w-full table-auto">
          <thead className="bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Date
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Desk
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Reserved For
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {reservations.map((reservation) => (
              <tr
                key={reservation.deskId + reservation.day + reservation.week}
                className="border-b border-gray-200 dark:border-gray-700"
              >
                <td className="px-4 py-3">
                  <div className="font-medium capitalize text-gray-900 dark:text-gray-100">
                    {`${reservation.day} (${reservation.date})`}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-nowrap font-medium text-gray-900 dark:text-gray-100">
                    Block {reservation.desks?.block}, Row{" "}
                    {reservation.desks?.row}, Column {reservation.desks?.column}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium capitalize text-gray-900 dark:text-gray-100">
                    {reservation.users.firstName} {reservation.users.lastName}
                  </div>
                </td>

                <td className="px-4 py-3">
                  <fetcher.Form
                    method="DELETE"
                    action="/reservations"
                    className="flex items-center space-x-2"
                  >
                    {reservation.date && (
                      <input
                        name="reservation-date"
                        value={reservation.date}
                        type="text"
                        readOnly
                        hidden
                      />
                    )}
                    <input
                      name="reservation-user-id"
                      value={reservation.users.id}
                      type="text"
                      readOnly
                      hidden
                    />
                    <input
                      name="reservation-day"
                      value={reservation.day}
                      type="text"
                      readOnly
                      hidden
                    />
                    <input
                      name="desk-id"
                      type="text"
                      value={String(reservation.deskId)}
                      readOnly
                      hidden
                    />

                    <Button
                      disabled={isDeleting(reservation)}
                      type="submit"
                      size="icon"
                      variant="destructive"
                    >
                      <span className="sr-only">Delete reservation</span>
                      <TrashIcon className="h-5 w-5 font-bold" />
                    </Button>
                  </fetcher.Form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex justify-end" />
    </div>
  );
}
