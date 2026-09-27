import { redirect } from "react-router";
import { signedOutCookie, userCookie } from "~/cookies.server";

export async function action() {
  let headers = new Headers();
  headers.append("Set-Cookie", await userCookie.serialize("", { maxAge: 0 }));
  headers.append("Set-Cookie", await signedOutCookie.serialize(true));

  return redirect("/login", { headers });
}
