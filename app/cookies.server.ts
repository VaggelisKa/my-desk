import { eq } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";

const fallbackCookieSecret = "my-desk-local-development-cookie-secret";
const cookieSecret =
  process.env.COOKIE_SECRET ??
  process.env.SESSION_SECRET ??
  fallbackCookieSecret;

export let userCookie = createCookie("user", {
  secrets: [cookieSecret],
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 14, // 2 weeks
});

function assertProductionCookieSecret() {
  if (
    process.env.NODE_ENV === "production" &&
    cookieSecret === fallbackCookieSecret
  ) {
    throw new Error("COOKIE_SECRET or SESSION_SECRET must be configured");
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
  assertProductionCookieSecret();

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
  assertProductionCookieSecret();

  return userCookie.serialize({ userId: userId.toLowerCase() });
}

export async function clearAuthCookie() {
  return userCookie.serialize("", { maxAge: 0 });
}
