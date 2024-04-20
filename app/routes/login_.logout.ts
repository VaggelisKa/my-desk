import { redirect } from "@vercel/remix";
import { userCookie } from "~/cookies.server";

export async function action() {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await userCookie.serialize("", { maxAge: 0 }),
    },
  });
}
