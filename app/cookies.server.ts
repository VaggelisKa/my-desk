import { createCookie, redirect } from "react-router";

export let userCookie = createCookie("user", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 14, // 2 weeks
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

export async function requireAuthCookie(request: Request) {
  let cookieHeader = request.headers.get("Cookie");
  let user = await userCookie.parse(cookieHeader);

  if (!user?.userId) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": await userCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  return user as {
    userId: string;
    firstName?: string;
    lastName?: string;
    external?: boolean;
    role?: "admin" | "user" | null;
  };
}
