import { PeopleList } from "~/components/admin/people-list";
import { useAdminData } from "~/components/admin/shared";

export default function AdminPeopleListPage() {
  return (
    <div className="enter">
      <PeopleList data={useAdminData()} />
    </div>
  );
}
