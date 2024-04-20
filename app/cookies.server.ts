import { createCookie } from "@remix-run/node";

export let userCookie = createCookie("user", {
  httpOnly: true,
  path: "/",
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: 60 * 60 * 24 * 30, // 30 days
});
