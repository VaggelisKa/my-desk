import { Form, useLoaderData } from "@remix-run/react";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/server-runtime";
import { eq } from "drizzle-orm";
import { redirectWithSuccess } from "remix-toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema.server";

export async function loader({ params, request }: LoaderFunctionArgs) {
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

export async function action({ request }: ActionFunctionArgs) {
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

export default function UserEditPage() {
  let data = useLoaderData<typeof loader>();

  return (
    <section className="flex flex-col gap-16 w-full sm:w-auto items-center ">
      <TypographyH1>Edit profile info</TypographyH1>

      <Form
        method="PUT"
        className="flex flex-col gap-4 max-w-full w-full sm:max-w-xs"
      >
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="user-id">User id</Label>

          <Input
            id="user-id"
            name="user-id"
            type="text"
            defaultValue={data.id}
            readOnly
          />

          <p className="text-xs text-gray-600">
            You cannot manually edit your id, if something is wrong please
            contact and admin!
          </p>
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="firstName">First name</Label>

          <Input
            id="firstName"
            name="firstName"
            type="text"
            defaultValue={data.firstName}
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
            defaultValue={data.lastName}
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
