import { Label } from "@radix-ui/react-label";
import { Form, redirect } from "@remix-run/react";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@vercel/remix";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TypographyH1 } from "~/components/ui/typography";
import { userCookie } from "~/cookies.server";

export let meta: MetaFunction = () => [
  {
    title: "Guest login",
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
  let errors: { employeeNumber?: string; name?: string } = {};

  if (!employeeNumber) {
    errors.employeeNumber = "Employee number is required";
  }

  if (!firstName) {
    errors.name = "Name is required";
  }

  if (Object.keys(errors).length) {
    return json({ ok: false, errors }, { status: 400 });
  }

  return redirect("/", {
    headers: {
      "Set-Cookie": await userCookie.serialize({
        userId: employeeNumber,
        firstName,
        lastName,
      }),
    },
  });
}

export default function guestLoginPage() {
  return (
    <section className="flex flex-col gap-16">
      <TypographyH1>Guest login portal</TypographyH1>

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
          <Label htmlFor="last-name">Last name (Optional)</Label>

          <Input
            id="last-name"
            name="last-name"
            type="text"
            placeholder="Doe"
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
