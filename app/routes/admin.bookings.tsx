import { BookingsByDay } from "~/components/admin/bookings-by-day";
import { useAdminData } from "~/components/admin/shared";

export default function AdminBookingsByDayPage() {
  return (
    <div className="enter">
      <BookingsByDay data={useAdminData()} />
    </div>
  );
}
