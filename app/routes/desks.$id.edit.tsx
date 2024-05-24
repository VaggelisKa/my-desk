import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  json,
  redirect,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/server-runtime";
import { eq } from "drizzle-orm";
import { redirectWithError, redirectWithToast } from "remix-toast";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks } from "~/lib/db/schema.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  let { role } = await requireAuthCookie(request);

  if (role !== "admin") {
    return redirect("/");
  }

  let deskData = await db.query.desks.findFirst({
    where: eq(desks.id, Number(params.id)),
    with: {
      user: true,
    },
  });

  if (!deskData) {
    return redirectWithError("/", { message: "Desk not found!" });
  }

  return deskData;
}

export async function action({ request, params }: ActionFunctionArgs) {
  let { role } = await requireAuthCookie(request);

  if (role !== "admin") {
    return redirect("/", { status: 403 });
  }

  if (isNaN(Number(params.id))) {
    return json({ message: "Invalid desk data" }, { status: 400 });
  }

  let deskId = Number(params.id);
  let formData = await request.formData();
  let updatedUserId = String(formData.get("user-id"));

  if (!updatedUserId) {
    return json({ message: "Invalid user id" }, { status: 400 });
  }

  await db
    .update(desks)
    .set({ userId: updatedUserId })
    .where(eq(desks.id, deskId));

  return redirectWithToast(`/`, {
    message: "Desk updated successfully!",
    type: "success",
  });
}

export default function EditDeskPage() {
  let data = useLoaderData<typeof loader>();
  let navigation = useNavigation();
  let isSubmitting = navigation.state !== "idle";

  return (
    <section className="flex flex-col gap-16 w-full sm:w-auto">
      <TypographyH1>Edit desk info</TypographyH1>

      <Form method="PUT" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="user-id">Assigned user id</Label>

          <Input
            id="user-id"
            name="user-id"
            type="text"
            defaultValue={data.user?.id}
            autoFocus
            required
            maxLength={6}
            minLength={6}
          />
        </fieldset>

        <Button className="w-full" type="submit" disabled={isSubmitting}>
          Edit
        </Button>
      </Form>
    </section>
  );
}
