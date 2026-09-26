import { BookingsByDay, useAdminData } from "~/components/admin";

export default function AdminBookingsByDayPage() {
  return <BookingsByDay data={useAdminData()} />;
}
