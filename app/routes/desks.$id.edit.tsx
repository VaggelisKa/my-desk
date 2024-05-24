import { Form, useLoaderData } from "@remix-run/react";
import { redirect, type LoaderFunctionArgs } from "@remix-run/server-runtime";
import { eq } from "drizzle-orm";
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
    throw new Error("Desk not found");
  }

  return deskData;
}

export default function EditDeskPage() {
  let data = useLoaderData<typeof loader>();

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

        <Button className="w-full" type="submit">
          Edit
        </Button>
      </Form>
    </section>
  );
}
