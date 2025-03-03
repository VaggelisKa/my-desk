import { eq } from "drizzle-orm";
import { useEffect, useRef } from "react";
import {
  Form,
  Link,
  data,
  redirect,
  useActionData,
  useNavigation,
  type ActionFunctionArgs,
  type LoaderFunctionArgs,
  type MetaFunction,
} from "react-router";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { TypographyH1 } from "~/components/ui/typography";
import { userCookie } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema.server";

export let meta: MetaFunction = () => [
  {
    title: "Login to your account",
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
  let userId = String(formData.get("user-id")).toLowerCase();

  if (!userId || userId.length !== 6) {
    return data(
      { ok: false, error: "Invalid employee number" },
      { status: 400 },
    );
  }

  let user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    return data({ ok: false, error: "No user found" }, { status: 401 });
  }

  return redirect("/", {
    headers: {
      "Set-Cookie": await userCookie.serialize({
        userId,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      }),
    },
  });
}

export default function LoginPage() {
  let inputRef = useRef<HTMLInputElement>(null);
  let data = useActionData<typeof action>();
  let navigation = useNavigation();
  let isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "employee-login";

  useEffect(() => {
    if (data?.error && navigation.state === "idle") {
      if (inputRef.current) {
        inputRef.current.value = "";
        inputRef.current.focus();
      }
    }
  }, [data, navigation]);

  return (
    <section className="flex w-full flex-col gap-16 sm:w-auto">
      <TypographyH1>Login to profile</TypographyH1>

      <Form method="POST" className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <Label htmlFor="user-id">User ID</Label>

          <Input
            ref={inputRef}
            id="user-id"
            name="user-id"
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
            disabled={isSubmitting}
          >
            {isSubmitting ? "Logging in..." : "Login"}
          </Button>

          <p className="pt-2 text-center">
            Don't have an account?{" "}
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
