import { createCookie, redirect } from "@remix-run/node";

export let userCookie = createCookie("user", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
});

export async function requireAuthCookie(request: Request) {
  let cookieHeader = request.headers.get("Cookie");
  let employeeNumber = await userCookie.parse(cookieHeader);

  if (!employeeNumber) {
    throw redirect("/login", {
      headers: {
        "Set-Cookie": await userCookie.serialize("", { maxAge: 0 }),
      },
    });
  }

  return employeeNumber as string;
}
