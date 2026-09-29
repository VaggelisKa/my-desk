import { useState } from "react";
import { Form, data, redirect, useNavigation } from "react-router";
import {
  AuthCard,
  AuthField,
  AuthLink,
  AuthSubmit,
  CodeField,
} from "~/components/auth-card";
import { createUserCookie, getUser } from "~/cookies.server";
import {
  addPerson,
  checkNewPerson,
  type NewPersonErrors,
} from "~/lib/people.server";
import type { Route } from "./+types/login_.guest";

export let meta: Route.MetaFunction = () => [
  {
    title: "Create an account",
  },
];

export async function loader(args: Route.LoaderArgs) {
  let user = await getUser(args);

  if (user) {
    throw redirect("/");
  }

  return null;
}

export async function action({ request }: Route.ActionArgs) {
  let formData = await request.formData();
  let { person, errors } = checkNewPerson({
    id: String(formData.get("employee-number") ?? ""),
    firstName: String(formData.get("name") ?? ""),
    lastName: String(formData.get("last-name") ?? ""),
  });

  if (errors) {
    return data({ ok: false, errors }, { status: 400 });
  }

  // The ID belongs to someone already: registering must never sign in as
  // them.
  if (!(await addPerson(person))) {
    let taken: NewPersonErrors = {
      id: "This user ID is already registered. Sign in instead.",
    };
    return data({ ok: false, errors: taken }, { status: 409 });
  }

  return redirect("/", {
    headers: { "Set-Cookie": await createUserCookie(person.id) },
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
            error={errors?.id}
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
