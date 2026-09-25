import { eq } from "drizzle-orm";
import { createCookie, redirect } from "react-router";
import { z } from "zod";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";

const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret || sessionSecret.trim().length < 32) {
  throw new Error("SESSION_SECRET must contain at least 32 characters");
}

const sessionMaxAge = 60 * 60 * 24 * 14;
const sessionSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.number().int().positive(),
});

export const userCookie = createCookie("user", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: sessionMaxAge,
  secrets: [sessionSecret],
});

/**
 * Short-lived flag set by the logout action so the login page can show a
 * "you're signed out" line once, instead of a silent redirect.
 */
export let signedOutCookie = createCookie("signed_out", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60,
});

export function createUserCookie(userId: string) {
  return userCookie.serialize({
    userId,
    expiresAt: Date.now() + sessionMaxAge * 1000,
  });
}

export async function getAuthenticatedUser(request: Request) {
  let parsedCookie: unknown;
  try {
    parsedCookie = await userCookie.parse(request.headers.get("Cookie"));
  } catch {
    // Malformed or tampered cookies are unauthenticated, not server errors.
    return null;
  }

  let session = sessionSchema.safeParse(parsedCookie);
  if (!session.success || session.data.expiresAt <= Date.now()) {
    return null;
  }

  // Identity is signed; authorization and profile data always come from the DB.
  return (
    (await db.query.users.findFirst({
      where: eq(users.id, session.data.userId),
      with: { desk: true },
    })) ?? null
  );
}

export async function requireAuthCookie(request: Request) {
  let user = await getAuthenticatedUser(request);

  if (!user) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": await userCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  return {
    userId: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
  };
}
