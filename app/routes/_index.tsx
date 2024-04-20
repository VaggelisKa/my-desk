import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";
import { Button } from "~/components/ui/button";
import { userCookie } from "~/cookies.server";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let parsedUserCookie = await userCookie.parse(cookieHeader);

  console.log(parsedUserCookie);

  return null;
}

export default function Index() {
  return (
    <div>
      <h1>Welcome to Remix</h1>
      <Button>test 1</Button>
      <a href="/login"> to login</a>
    </div>
  );
}
