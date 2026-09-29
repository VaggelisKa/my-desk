import { eq } from "drizzle-orm";
import { data } from "react-router";
import { dataWithError, redirectWithSuccess } from "remix-toast";
import { ProfilePage } from "~/components/profile";
import { early, requireUser } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { desks, users } from "~/lib/db/schema";
import type { Route } from "./+types/users.edit.$id";

// Error responses, so the error page says why and the status is right,
// instead of a 500.
let notFound = () =>
  data("There is no one with this user ID.", { status: 404 });
let notAllowed = () =>
  data("You are not allowed to edit this information", { status: 403 });

export let meta: Route.MetaFunction = () => [{ title: "Profile" }];

export async function loader(args: Route.LoaderArgs) {
  let paramsUserId = args.params?.id?.toLowerCase();

  // Never the case: the route only matches with an ID.
  if (!paramsUserId) {
    throw notFound();
  }

  // Started alongside the sign-in check; read only once every check passed.
  let profile = early(
    Promise.all([
      db.query.users.findFirst({ where: eq(users.id, paramsUserId) }),
      db.query.desks.findFirst({ where: eq(desks.userId, paramsUserId) }),
    ]),
  );
  let { userId, role } = await requireUser(args);

  if (userId !== paramsUserId && role !== "admin") {
    throw notAllowed();
  }

  let [userFromDb, desk] = await profile;

  if (!userFromDb) {
    throw notFound();
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

export async function action(args: Route.ActionArgs) {
  let { request, params } = args;
  let { userId: sessionUserId, role } = await requireUser(args);
  // The user comes from the URL the loader authorized, not the form.
  let userId = params.id?.toLowerCase();

  if (!userId) {
    throw notFound();
  }

  if (userId !== sessionUserId && role !== "admin") {
    throw notAllowed();
  }

  let formData = await request.formData();
  let firstName = String(formData.get("firstName") ?? "").trim();
  let lastName = String(formData.get("lastName") ?? "").trim();

  if (!firstName || !lastName) {
    return dataWithError(
      null,
      { message: "First and last name are both needed" },
      { status: 400 },
    );
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
