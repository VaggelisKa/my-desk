import { eq } from "drizzle-orm";
import { useState } from "react";
import { data, Form, redirect } from "react-router";
import {
  AuthCard,
  AuthSubmit,
  CODE_LENGTH,
  CodeField,
} from "~/components/auth-card";
import { Button } from "~/components/ui/button";
import { createUserCookie, getUser } from "~/cookies.server";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import {
  ADMIN_SCOPE,
  createCode,
  readAuthorizeRequest,
  SCOPE,
  withParams,
} from "~/lib/mcp/oauth.server";
import { capitalize } from "~/lib/utils";
import type { Route } from "./+types/oauth.authorize";

// Where Claude or ChatGPT sends someone to connect MyDesk: sign in as on the
// web (skipped when already signed in), then Allow or Cancel. An Admin can
// also allow the Admin tab's actions, off unless they tick it. The forms post
// natively (reloadDocument), so Allow ends in a plain redirect back to the
// assistant.

export let meta: Route.MetaFunction = () => [{ title: "Connect MyDesk" }];

// Never inside another site's frame: the Allow button must not be clickable
// through someone else's page.
export function headers() {
  return {
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "frame-ancestors 'none'",
  };
}

export async function loader(args: Route.LoaderArgs) {
  let auth = await readAuthorizeRequest(args.url);

  if (auth.kind === "fatal") {
    return {
      error: auth.message,
      client: null,
      returnsTo: null,
      user: null,
    };
  }
  if (auth.kind === "refuse") {
    throw redirect(auth.to);
  }

  let user = await getUser(args);

  return {
    error: null,
    client: auth.client.name,
    returnsTo: auth.returnsTo,
    user: user && {
      name: `${capitalize(user.firstName)} ${capitalize(user.lastName)}`,
      isAdmin: user.role === "admin",
    },
  };
}

/**
 * Whether a form post came from another site. Browsers send at least one of
 * these headers on a form post; the cookie's SameSite=Lax already keeps a
 * signed-in Allow from working cross-site, this stops the sign-in too.
 */
function isCrossSite(request: Request, url: URL) {
  let site = request.headers.get("Sec-Fetch-Site");
  if (site) return site !== "same-origin" && site !== "none";
  let origin = request.headers.get("Origin");
  return origin !== null && origin !== url.origin;
}

export async function action(args: Route.ActionArgs) {
  let url = new URL(args.request.url);

  if (isCrossSite(args.request, url)) {
    return data(
      { signInError: "Open this page from your assistant." },
      { status: 403 },
    );
  }

  let auth = await readAuthorizeRequest(url);

  if (auth.kind === "fatal") {
    return data({ signInError: auth.message }, { status: 400 });
  }
  if (auth.kind === "refuse") {
    throw redirect(auth.to);
  }

  let form = await args.request.formData();
  let intent = form.get("intent");

  if (intent === "sign-in") {
    let userId = String(form.get("user-id") ?? "").toLowerCase();
    let user =
      userId.length === CODE_LENGTH
        ? await db.query.users.findFirst({ where: eq(users.id, userId) })
        : undefined;

    if (!user) {
      return data({ signInError: "No user found" }, { status: 401 });
    }

    // Back to this page, now signed in, to Allow or Cancel.
    throw redirect(url.pathname + url.search, {
      headers: { "Set-Cookie": await createUserCookie(user.id) },
    });
  }

  if (intent === "deny") {
    throw redirect(
      withParams(auth.redirectUri, {
        error: "access_denied",
        error_description: "The person cancelled.",
        state: auth.state,
        iss: url.origin,
      }),
    );
  }

  let user = await getUser(args);
  if (intent !== "allow" || !user) {
    throw redirect(url.pathname + url.search);
  }

  // Admin tools only for someone who is an Admin now and ticked the box.
  let admin = form.get("admin") === "on" && user.role === "admin";
  let code = await createCode({
    clientId: auth.client.id,
    userId: user.id,
    redirectUri: auth.redirectUri,
    codeChallenge: auth.codeChallenge,
    scope: admin ? `${SCOPE} ${ADMIN_SCOPE}` : SCOPE,
  });

  throw redirect(
    withParams(auth.redirectUri, { code, state: auth.state, iss: url.origin }),
  );
}

export default function Authorize({
  loaderData,
  actionData,
}: Route.ComponentProps) {
  let { error, client, returnsTo, user } = loaderData;
  let [userId, setUserId] = useState("");

  if (error || !client) {
    return (
      <AuthCard
        title="Can't connect"
        description={`${error ?? "Something went wrong."} Start again from your assistant's connector settings.`}
      >
        {null}
      </AuthCard>
    );
  }

  if (!user) {
    return (
      <AuthCard
        title="Sign in to connect"
        description={`${client} wants to use MyDesk as you. Your user ID, for example G12345.`}
      >
        <Form
          method="POST"
          reloadDocument
          noValidate
          className="flex flex-col gap-5"
        >
          <CodeField
            id="user-id"
            name="user-id"
            label="User ID"
            error={actionData?.signInError}
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
          <AuthSubmit name="intent" value="sign-in">
            Sign in
          </AuthSubmit>
        </Form>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={`Allow ${client}?`}
      description={`It will see the desks and bookings, and book or cancel desks as ${user.name}, following the same rules as the app.`}
    >
      <Form method="POST" reloadDocument className="flex flex-col gap-3">
        {user.isAdmin ? (
          <label className="flex items-start gap-3 rounded-xl border border-line p-3 text-[15px]">
            <input
              type="checkbox"
              name="admin"
              className="mt-1 size-4 accent-current"
            />
            <span>
              Also allow Admin actions
              <span className="block text-[13px] text-ink-muted">
                Add people, move desks and cancel anyone's bookings.
              </span>
            </span>
          </label>
        ) : null}
        <p className="text-[13px] text-ink-muted">
          You'll go back to <span className="font-semibold">{returnsTo}</span>.
        </p>
        <AuthSubmit name="intent" value="allow">
          Allow
        </AuthSubmit>
        <Button
          type="submit"
          name="intent"
          value="deny"
          variant="quiet"
          size="tall"
          className="w-full"
        >
          Cancel
        </Button>
      </Form>
    </AuthCard>
  );
}
