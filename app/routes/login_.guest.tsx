import { Label } from "@radix-ui/react-label";
import { Form, data, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TypographyH1 } from "~/components/ui/typography";
import { getAuthUser, serializeAuthCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/login_.guest";

export let meta: Route.MetaFunction = () => [
  {
    title: "Create new user",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  let user = await getAuthUser(request);

  if (user) {
    throw redirect("/");
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  let formData = await request.formData();
  let employeeNumber = String(formData.get("employee-number"))
    .toLowerCase()
    .trim();
  let firstName = String(formData.get("name"));
  let lastName = String(formData.get("last-name"));
  let errors: {
    employeeNumber?: string;
    firstName?: string;
    lastName?: string;
  } = {};

  if (!employeeNumber) {
    errors.employeeNumber = "Employee number is required";
  } else if (employeeNumber.length !== 6) {
    // Must match the login action's rule, otherwise accounts registered here
    // could never sign back in once their session expires.
    errors.employeeNumber = "Employee number must be exactly 6 characters";
  }

  if (!firstName) {
    errors.firstName = "Name is required";
  }

  if (!lastName) {
    errors.lastName = "Last name is required";
  }

  if (Object.keys(errors).length) {
    return data({ ok: false, errors }, { status: 400 });
  }

  let newUser = await db
    .insert(users)
    .values({
      id: employeeNumber,
      firstName,
      lastName,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  // A conflicting insert means the id belongs to an existing account. Issuing
  // a cookie for it here would let anyone log in as that user, so reject it.
  if (!newUser?.[0]?.id) {
    return data(
      {
        ok: false,
        errors: {
          employeeNumber:
            "This user id is already registered, please use the login page instead",
        },
      },
      { status: 409 },
    );
  }

  return redirect("/", {
    headers: {
      "Set-Cookie": await serializeAuthCookie(newUser[0].id),
    },
  });
}

export default function guestLoginPage({ actionData }: Route.ComponentProps) {
  return (
    <section className="flex w-full flex-col gap-16 sm:w-auto">
      <TypographyH1>Register new account</TypographyH1>

      <Form method="POST" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="employee-number">User ID</Label>

          <Input
            id="employee-number"
            name="employee-number"
            type="text"
            placeholder="g01234"
            autoFocus
            required
            minLength={6}
            maxLength={6}
          />

          {actionData?.errors?.employeeNumber ? (
            <p className="text-sm text-red-500">
              {actionData.errors.employeeNumber}
            </p>
          ) : null}
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="name">First name</Label>

          <Input
            id="name"
            name="name"
            type="text"
            placeholder="John"
            required
          />
        </fieldset>

        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="last-name">Last name</Label>

          <Input
            id="last-name"
            name="last-name"
            type="text"
            placeholder="Doe"
            required
          />
        </fieldset>

        <Button
          className="w-full"
          name="intent"
          value="employee-login"
          type="submit"
        >
          Register
        </Button>
      </Form>
    </section>
  );
}
