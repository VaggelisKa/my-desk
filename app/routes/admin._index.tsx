import { DeskList } from "~/components/admin/desk-list";
import { useAdminData } from "~/components/admin/shared";

export default function AdminDeskListPage() {
  return (
    <div className="enter">
      <DeskList data={useAdminData()} />
    </div>
  );
}
