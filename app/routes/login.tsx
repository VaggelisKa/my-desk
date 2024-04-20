import { Form, redirect, useActionData, useNavigation } from "@remix-run/react";
import {
  type ActionFunctionArgs,
  type MetaFunction,
  json,
} from "@vercel/remix";
import { TypographyH1 } from "~/components/ui/typography";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Button } from "~/components/ui/button";
import { useEffect, useRef } from "react";

let validEmployeeNumbers = ["g04255", "g04256"];

export let meta: MetaFunction = () => [
  {
    title: "Employee login",
  },
];

export async function action({ request }: ActionFunctionArgs) {
  let formData = await request.formData();
  let employeeNumber = String(formData.get("employee-number"));
  let hasError = !validEmployeeNumbers.includes(employeeNumber);

  if (hasError) {
    return json(
      { ok: false, error: "Invalid employee number" },
      { status: 401 },
    );
  }

  return redirect("/");
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
          <Label htmlFor="employee-number">Employee number</Label>

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

        <Button name="intent" value="employee-login" type="submit">
          Login
        </Button>
      </Form>
    </section>
  );
}
