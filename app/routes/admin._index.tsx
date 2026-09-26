import { DeskList, useAdminData } from "~/components/admin";

export default function AdminDeskListPage() {
  return <DeskList data={useAdminData()} />;
}
