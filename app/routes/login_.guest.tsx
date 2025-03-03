import { Label } from "@radix-ui/react-label";
import {
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@vercel/remix";
import { Form, data, redirect } from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TypographyH1 } from "~/components/ui/typography";
import { userCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema.server";

export let meta: MetaFunction = () => [
  {
    title: "Create new user",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let employeeNumber = await userCookie.parse(cookieHeader);

  if (employeeNumber) {
    throw redirect("/");
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  let formData = await request.formData();
  let employeeNumber = String(formData.get("employee-number"));
  let firstName = String(formData.get("name"));
  let lastName = String(formData.get("last-name"));
  let errors: {
    employeeNumber?: string;
    firstName?: string;
    lastName?: string;
  } = {};

  if (!employeeNumber) {
    errors.employeeNumber = "Employee number is required";
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
      id: employeeNumber.toLowerCase(),
      firstName,
      lastName,
    })
    .onConflictDoNothing()
    .returning({ id: users.id });

  return redirect("/", {
    headers: {
      "Set-Cookie": await userCookie.serialize({
        userId: newUser?.[0]?.id || employeeNumber,
      }),
    },
  });
}

export default function guestLoginPage() {
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
            maxLength={6}
          />
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
          Login
        </Button>
      </Form>
    </section>
  );
}
