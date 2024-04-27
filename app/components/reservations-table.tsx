import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TypographyH1 } from "./ui/typography";
import { TrashIcon } from "@radix-ui/react-icons";
import { format } from "date-fns";

export function ReservationsTable() {
  return (
    <div key="1" className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between">
        <TypographyH1 className="text-2xl font-bold lg:text-3xl">
          Reservations
        </TypographyH1>
        <div className="flex items-center space-x-4">
          <Input placeholder="Search reservations..." type="text" />
        </div>
      </div>
      <div className="overflow-x-auto">
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
                Reserved under
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-700 dark:text-gray-300">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  {format("2023-04-26", "dd.MM.yyyy").toString()}
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  Block 2, Row 2, Column 3
                </div>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900 dark:text-gray-100">
                  Evangelos karavasileiadis
                </div>
              </td>

              <td className="px-4 py-3">
                <div className="flex items-center space-x-2">
                  <Button size="icon" variant="destructive">
                    <span className="sr-only">Delete reservation</span>
                    <TrashIcon className="h-5 w-5 font-bold" />
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-6 flex justify-end" />
    </div>
  );
}
