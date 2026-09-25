import { eq } from "drizzle-orm";
import { useEffect, useRef, useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import {
  AuthCard,
  AuthLink,
  AuthSubmit,
  CodeField,
} from "~/components/auth-card";
import {
  createUserCookie,
  getAuthenticatedUser,
  signedOutCookie,
} from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/login";

export let meta: Route.MetaFunction = () => [
  {
    title: "Sign in",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  let user = await getAuthenticatedUser(request);

  if (user) {
    throw redirect("/");
  }

  let signedOut = Boolean(
    await signedOutCookie.parse(request.headers.get("Cookie")),
  );

  return data(
    { signedOut },
    signedOut
      ? {
          headers: {
            "Set-Cookie": await signedOutCookie.serialize("", { maxAge: 0 }),
          },
        }
      : undefined,
  );
}

export async function action({ request }: Route.ActionArgs) {
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
      "Set-Cookie": await createUserCookie(user.id),
    },
  });
}

export default function LoginPage({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  let inputRef = useRef<HTMLInputElement>(null);
  let [userId, setUserId] = useState("");
  let navigation = useNavigation();
  let isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "employee-login";

  useEffect(() => {
    if (actionData?.error && navigation.state === "idle") {
      setUserId("");
      inputRef.current?.focus();
    }
  }, [actionData, navigation]);

  return (
    <AuthCard
      title="Sign in"
      description="Enter your six-character user ID, for example emp001."
      notice={
        loaderData.signedOut && !actionData?.error
          ? "You're signed out. Sign in again when you're back."
          : undefined
      }
    >
      <Form method="POST" noValidate className="flex flex-col gap-5">
        <CodeField
          ref={inputRef}
          id="user-id"
          name="user-id"
          label="User ID"
          error={actionData?.error}
          value={userId}
          onChange={setUserId}
          autoFocus
          required
          autoComplete="username"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
        />

        <div className="flex flex-col gap-3.5">
          <AuthSubmit
            name="intent"
            value="employee-login"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </AuthSubmit>

          <p className="text-[13px] text-ink-muted">
            First time here?{" "}
            <AuthLink to="/login/guest">Create an account</AuthLink> with your
            ID and name.
          </p>
        </div>
      </Form>
    </AuthCard>
  );
}
