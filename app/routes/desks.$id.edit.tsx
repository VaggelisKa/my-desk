import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
} from "@remix-run/server-runtime";
import type { MetaFunction } from "@vercel/remix";
import { and, asc, eq } from "drizzle-orm";
import {
  jsonWithError,
  redirectWithError,
  redirectWithToast,
} from "remix-toast";
import { ReservationsTable } from "~/components/reservations-table";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TypographyH1 } from "~/components/ui/typography";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks, reservations, users } from "~/lib/db/schema.server";
import { deleteCron } from "~/lib/easy-cron";

export let meta: MetaFunction = () => [
  {
    title: "Edit desk information",
  },
];

export async function loader({ request, params }: LoaderFunctionArgs) {
  let { role } = await requireAuthCookie(request);

  if (role !== "admin") {
    return redirectWithError("/", {
      message: "Unauthorized!",
      description: "You cannot access admin routes as a normal user.",
    });
  }

  let deskData = await db.query.desks.findFirst({
    where: eq(desks.id, Number(params.id)),
    with: {
      user: true,
      reservations: {
        with: {
          desks: {
            columns: {
              id: false,
              userId: false,
            },
          },
          users: true,
        },
        columns: {
          userId: false,
        },
        orderBy: [asc(reservations.dateTimestamp)],
      },
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
    return redirectWithError("/", {
      message: "Unauthorized",
      description: "You cannot access admin routes as a normal user",
    });
  }

  if (isNaN(Number(params.id))) {
    return json({ message: "Invalid desk data" }, { status: 400 });
  }

  let deskId = Number(params.id);
  let formData = await request.formData();
  let updatedUserId = String(formData.get("user-id"))?.toLowerCase();
  let currentUserId = String(formData.get("current-user-id"));
  let currentUserCronId = String(formData.get("current-user-cron-id"));

  if (!updatedUserId) {
    return jsonWithError(null, { message: "Invalid user id" });
  }

  await db
    .update(desks)
    .set({ userId: updatedUserId })
    .where(eq(desks.id, deskId));

  if (currentUserCronId) {
    await Promise.all([
      db
        .update(users)
        .set({ autoReservationsCronId: currentUserCronId })
        .where(
          and(
            eq(users.id, currentUserId),
            eq(users.autoReservationsCronId, currentUserCronId),
          ),
        ),
      deleteCron({ cronId: currentUserCronId }),
    ]);
  }

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
    <section className="flex w-full flex-col items-center gap-16 sm:w-auto">
      <TypographyH1>Edit desk info</TypographyH1>

      <Form
        method="PUT"
        className="flex w-full max-w-full flex-col gap-4 sm:max-w-xs"
      >
        <input
          type="hidden"
          name="current-user-cron-id"
          value={data.user?.autoReservationsCronId || undefined}
        />
        <input type="hidden" name="current-user-id" value={data.user?.id} />

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

      {!!data.reservations.length && (
        <ReservationsTable reservations={data.reservations} />
      )}
    </section>
  );
}
