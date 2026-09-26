import { DeskList, useAdminData } from "~/components/admin";

export default function AdminDeskListPage() {
  return (
    <div className="enter">
      <DeskList data={useAdminData()} />
    </div>
  );
}
