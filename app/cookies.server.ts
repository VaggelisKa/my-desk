import { eq } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";

const fallbackCookieSecret = "my-desk-local-development-cookie-secret";
const minimumCookieSecretLength = 32;

// The fallback secret is committed to the repo, so cookies signed with it are
// forgeable. Only development and test runs may fall back to it; any other
// environment (production, previews, unset NODE_ENV) must configure a secret.
const isLocalEnvironment =
  process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test";

function getConfiguredCookieSecret() {
  return (
    process.env.COOKIE_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    null
  );
}

const configuredCookieSecret = getConfiguredCookieSecret();
const cookieSecret = configuredCookieSecret ?? fallbackCookieSecret;

// Surface a misconfiguration in the deploy logs at boot; the per-request
// assertion below still fails closed, but without this the first symptom
// would be users hitting opaque 500s.
if (
  !isLocalEnvironment &&
  (!configuredCookieSecret ||
    configuredCookieSecret.length < minimumCookieSecretLength)
) {
  console.error(
    `COOKIE_SECRET or SESSION_SECRET is missing or shorter than ${minimumCookieSecretLength} characters; every authenticated request will fail until it is configured.`,
  );
}

export let userCookie = createCookie("user", {
  secrets: [cookieSecret],
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: !isLocalEnvironment,
  maxAge: 60 * 60 * 24 * 14, // 2 weeks
});

function assertCookieSecretConfigured() {
  if (isLocalEnvironment) {
    return;
  }

  if (!configuredCookieSecret) {
    throw new Error(
      "COOKIE_SECRET or SESSION_SECRET must be configured to a non-empty value",
    );
  }

  if (configuredCookieSecret.length < minimumCookieSecretLength) {
    throw new Error(
      `COOKIE_SECRET or SESSION_SECRET must be at least ${minimumCookieSecretLength} characters`,
    );
  }
}

async function readUserFromDb(userId: string) {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
    with: {
      desk: true,
    },
  });
}

export type AuthUser = NonNullable<
  Awaited<ReturnType<typeof readUserFromDb>>
> & {
  userId: string;
};

async function parseAuthCookie(request: Request) {
  assertCookieSecretConfigured();

  let cookieHeader = request.headers.get("Cookie");

  try {
    let user = await userCookie.parse(cookieHeader);
    let userId = typeof user?.userId === "string" ? user.userId : "";

    return userId ? { userId: userId.toLowerCase() } : null;
  } catch {
    return null;
  }
}

export async function getAuthUser(request: Request) {
  let cookieUser = await parseAuthCookie(request);

  if (!cookieUser?.userId) {
    return null;
  }

  let user = await readUserFromDb(cookieUser.userId);

  return user ? ({ ...user, userId: user.id } satisfies AuthUser) : null;
}

export async function requireAuthCookie(request: Request) {
  let user = await getAuthUser(request);

  if (!user) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": await clearAuthCookie(),
      },
    });
  }

  return user;
}

export async function serializeAuthCookie(userId: string) {
  assertCookieSecretConfigured();

  return userCookie.serialize({ userId: userId.toLowerCase() });
}

// Deliberately does not assert the secret: clearing a cookie must keep
// working even when the secret is misconfigured, and the serialized value is
// empty with maxAge 0, so signing it with the fallback secret is harmless.
export async function clearAuthCookie() {
  return userCookie.serialize("", { maxAge: 0 });
}
