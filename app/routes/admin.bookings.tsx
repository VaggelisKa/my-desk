import { BookingsByDay, useAdminData } from "~/components/admin";

export default function AdminBookingsByDayPage() {
  return (
    <div className="enter">
      <BookingsByDay data={useAdminData()} />
    </div>
  );
}
