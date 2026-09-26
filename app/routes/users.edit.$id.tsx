import { eq } from "drizzle-orm";
import { redirectWithSuccess } from "remix-toast";
import { ProfilePage } from "~/components/profile";
import { requireAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks, users } from "~/lib/db/schema";
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

  let [userFromDb, desk] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, paramsUserId) }),
    db.query.desks.findFirst({ where: eq(desks.userId, paramsUserId) }),
  ]);

  if (!userFromDb) {
    throw new Error("User not found");
  }

  return {
    user: {
      id: userFromDb.id,
      firstName: userFromDb.firstName,
      lastName: userFromDb.lastName,
      role: userFromDb.role,
    },
    desk: desk
      ? { block: desk.block, row: desk.row, column: desk.column }
      : null,
    isSelf: userId === paramsUserId,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  let { userId: sessionUserId, role } = await requireAuthCookie(request);
  // The user comes from the URL the loader authorized, not the form.
  let userId = params.id?.toLowerCase();

  if (!userId) {
    throw new Error("User id is required");
  }

  if (userId !== sessionUserId && role !== "admin") {
    throw new Error("You are not allowed to edit this information");
  }

  let formData = await request.formData();
  let firstName = String(formData.get("firstName") ?? "").trim();
  let lastName = String(formData.get("lastName") ?? "").trim();

  if (!firstName || !lastName) {
    return null;
  }

  await db
    .update(users)
    .set({ firstName, lastName })
    .where(eq(users.id, userId));

  // Stay on the page: the profile belongs to no tab to go back to.
  return redirectWithSuccess(`/users/edit/${userId}`, {
    message:
      userId === sessionUserId
        ? "Profile saved"
        : `Saved ${firstName} ${lastName}'s profile`,
  });
}

export default function UserEditPage({ loaderData }: Route.ComponentProps) {
  return <ProfilePage {...loaderData} />;
}
