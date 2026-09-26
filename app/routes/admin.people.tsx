import { PeopleList, useAdminData } from "~/components/admin";

export default function AdminPeopleListPage() {
  return (
    <div className="enter">
      <PeopleList data={useAdminData()} />
    </div>
  );
}
