import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import {
  AuthCard,
  AuthField,
  AuthLink,
  AuthSubmit,
  CODE_LENGTH,
  CodeField,
} from "~/components/auth-card";
import { createUserCookie, getAuthenticatedUser } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/login_.guest";

export let meta: Route.MetaFunction = () => [
  {
    title: "Create an account",
  },
];

export async function loader({ request }: Route.LoaderArgs) {
  let user = await getAuthenticatedUser(request);

  if (user) {
    throw redirect("/");
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
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
  } else if (employeeNumber.length !== CODE_LENGTH) {
    // Sign-in only takes six characters, so a shorter one could never be
    // used to sign in again.
    errors.employeeNumber = `Employee number must be ${CODE_LENGTH} characters`;
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
      "Set-Cookie": await createUserCookie(newUser?.[0]?.id || employeeNumber),
    },
  });
}

export default function GuestLoginPage({ actionData }: Route.ComponentProps) {
  let errors = actionData?.errors;
  let [employeeNumber, setEmployeeNumber] = useState("");
  let navigation = useNavigation();
  let isSubmitting =
    navigation.state !== "idle" &&
    navigation.formData?.get("intent") === "register";

  return (
    <AuthCard
      title="Create an account"
      description="Guests sign up with their user ID and name."
    >
      <Form method="POST" noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-4">
          <CodeField
            id="employee-number"
            name="employee-number"
            label="User ID"
            error={errors?.employeeNumber}
            value={employeeNumber}
            onChange={setEmployeeNumber}
            autoFocus
            required
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
          />

          <AuthField
            id="name"
            name="name"
            label="First name"
            error={errors?.firstName}
            required
            placeholder="John"
            autoComplete="given-name"
            enterKeyHint="next"
          />

          <AuthField
            id="last-name"
            name="last-name"
            label="Last name"
            error={errors?.lastName}
            required
            placeholder="Doe"
            autoComplete="family-name"
            enterKeyHint="go"
          />
        </div>

        <div className="flex flex-col gap-3.5">
          <AuthSubmit name="intent" value="register" disabled={isSubmitting}>
            {isSubmitting ? "Creating account…" : "Create account"}
          </AuthSubmit>

          <p className="text-[13px] text-ink-muted">
            Already have an account? <AuthLink to="/login">Sign in</AuthLink>
          </p>
        </div>
      </Form>
    </AuthCard>
  );
}
