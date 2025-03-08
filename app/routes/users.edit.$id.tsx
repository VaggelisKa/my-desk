import { eq } from "drizzle-orm";
import { Form } from "react-router";
import { redirectWithSuccess } from "remix-toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/users.edit.$id";

export async function loader({ params, request }: Route.LoaderArgs) {
  let { userId, role } = await requireAuthCookie(request);
  let paramsUserId = params?.id?.toLowerCase();

  if (!paramsUserId) {
    throw new Error("User id is required");
  }

  if (userId !== paramsUserId && role !== "admin") {
    throw new Error("You are not allowed to edit this information");
  }

  let userFromDb = await db.query.users.findFirst({
    where: eq(users.id, paramsUserId),
  });

  if (!userFromDb) {
    throw new Error("User not found");
  }

  return userFromDb;
}

export async function action({ request }: Route.ActionArgs) {
  let formData = await request.formData();
  let userId = String(formData.get("user-id"));
  let updatedFirstName = String(formData.get("firstName"));
  let updatedLastName = String(formData.get("lastName"));

  if ((!updatedFirstName && !updatedLastName) || userId == "null") {
    return null;
  }

  await db
    .update(users)
    .set({ firstName: updatedFirstName, lastName: updatedLastName })
    .where(eq(users.id, userId));

  return redirectWithSuccess("/", {
    message: `User ${userId} updated successfully`,
  });
}

export default function UserEditPage({ loaderData }: Route.ComponentProps) {
  return (
    <section className="flex w-full flex-col items-center gap-16 sm:w-auto ">
      <Form
        method="PUT"
        className="flex w-full max-w-full flex-col gap-4 sm:max-w-xs"
      >
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="user-id">User id</Label>

          <Input
            id="user-id"
            name="user-id"
            type="text"
            defaultValue={loaderData.id}
            readOnly
          />

          <p className="text-xs text-gray-600">
            You cannot edit your id, if it is wrong please contact an admin!
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>

          <Input
            id="firstName"
            name="firstName"
            type="text"
            defaultValue={loaderData.firstName}
            autoFocus
            required
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="lastName">Last name</Label>

          <Input
            id="lastName"
            name="lastName"
            type="text"
            defaultValue={loaderData.lastName}
            required
          />
        </fieldset>

        <Button className="w-full" type="submit" disabled={false}>
          Edit
        </Button>
      </Form>
    </section>
  );
}
