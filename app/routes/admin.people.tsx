import { PeopleList, useAdminData } from "~/components/admin";

export default function AdminPeopleListPage() {
  return <PeopleList data={useAdminData()} />;
}
