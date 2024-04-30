import {
  Form,
  Link,
  redirect,
  useActionData,
  useNavigation,
} from "@remix-run/react";
import {
  json,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "@vercel/remix";
import { useEffect, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TypographyH1 } from "~/components/ui/typography";
import { userCookie } from "~/cookies.server";

let validEmployeeNumbers = ["g04255", "g04256"];

export let meta: MetaFunction = () => [
  {
    title: "Employee login",
  },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let userData = await userCookie.parse(cookieHeader);

  if (userData?.userId) {
    throw redirect("/");
  }

  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  let formData = await request.formData();
  let employeeNumber = String(formData.get("employee-number"));
  let hasError = !validEmployeeNumbers.includes(employeeNumber.toLowerCase());

  if (hasError) {
    return json(
      { ok: false, error: "Invalid employee number" },
      { status: 401 },
    );
  }

  return redirect("/", {
    headers: {
      "Set-Cookie": await userCookie.serialize({ userId: employeeNumber }),
    },
  });
}

export default function LoginPage() {
  let inputRef = useRef<HTMLInputElement>(null);
  let data = useActionData<typeof action>();
  let navigation = useNavigation();

  useEffect(() => {
    if (data?.error && navigation.state === "idle") {
      inputRef.current?.focus();
    }
  }, [data?.error, navigation]);

  return (
    <section className="flex flex-col gap-16">
      <TypographyH1>Employee login</TypographyH1>

      <Form method="POST" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="employee-number">User ID</Label>

          <Input
            ref={inputRef}
            id="employee-number"
            name="employee-number"
            type="text"
            autoFocus
            required
            maxLength={6}
          />

          {data?.error && (
            <p aria-live="polite" className="text-sm text-red-400">
              {data?.error}
            </p>
          )}
        </fieldset>

        <div className="w-full">
          <Button
            className="w-full"
            name="intent"
            value="employee-login"
            type="submit"
          >
            Login
          </Button>

          <p className="pt-2">
            Don't have a desk assigned?{" "}
            <Link
              className="text-blue-400 underline outline-blue-300"
              to="/login/guest"
            >
              Click here
            </Link>
          </p>
        </div>
      </Form>
    </section>
  );
}
