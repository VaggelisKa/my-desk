import { redirect } from "react-router";
import { clearAuthCookie } from "~/cookies.server";

export async function action() {
  return redirect("/login", {
    headers: {
      "Set-Cookie": await clearAuthCookie(),
    },
  });
}
