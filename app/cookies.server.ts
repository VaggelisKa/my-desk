import { eq } from "drizzle-orm";
import {
  createContext,
  createCookie,
  redirect,
  type RouterContextProvider,
} from "react-router";
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

/** The user ID the signed session cookie names, or null. Not checked against the DB. */
async function sessionUserId(request: Request) {
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

  return session.data.userId;
}

async function findUser(userId: string) {
  // Identity is signed; authorization and profile data always come from the DB.
  return (
    (await db.query.users.findFirst({
      where: eq(users.id, userId),
      with: { desk: true },
    })) ?? null
  );
}

/**
 * Lets a query start before the auth check. When the check throws first, the
 * query's promise is dropped, so its failure must not become an unhandled
 * rejection; whoever does await it still gets the error.
 */
export function early<T>(query: Promise<T>) {
  query.catch(() => {});
  return query;
}

type RequestAuth = {
  request: Request;
  userId: Promise<string | null>;
  user: Promise<Awaited<ReturnType<typeof findUser>>>;
};

let requestAuth = createContext<RequestAuth | null>(null);

/** What a loader or action gets: the request and its per-request context. */
export type AuthArgs = {
  request: Request;
  context: Readonly<RouterContextProvider>;
};

/**
 * The session for this request, read once. The root loader and the page's
 * loaders run in the same request and share one context, so the user row is
 * read from the DB once however many of them ask for it.
 *
 * Not across a form post: without JavaScript the action and the loaders run
 * in one request, and the loaders must see what the action changed (a new
 * name, a desk).
 */
function authFor({ request, context }: AuthArgs) {
  let reading = request.method === "GET" || request.method === "HEAD";
  let auth = reading ? context.get(requestAuth) : null;

  if (auth?.request !== request) {
    let userId = sessionUserId(request);
    auth = {
      request,
      userId,
      user: early(userId.then((id) => (id ? findUser(id) : null))),
    };
    if (reading) context.set(requestAuth, auth);
  }

  return auth;
}

/** The signed-in user, or null. Read from the DB at most once per request. */
export function getUser(args: AuthArgs) {
  return authFor(args).user;
}

/**
 * The user ID the signed cookie names, known before the DB has confirmed the
 * user still exists. Only for starting a query early: return nothing from it
 * until `requireUser` has passed.
 */
export function claimedUserId(args: AuthArgs) {
  return authFor(args).userId;
}

export async function requireUser(args: AuthArgs) {
  let user = await getUser(args);

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
    /** Their own desk, loaded with them, so pages need not query it again. */
    desk: user.desk && {
      id: user.desk.id,
      block: user.desk.block,
      row: user.desk.row,
      column: user.desk.column,
    },
  };
}
