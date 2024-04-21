import { useLoaderData } from "@remix-run/react";
import type { LoaderFunctionArgs, MetaFunction } from "@vercel/remix";
import { Button } from "~/components/ui/button";
import { requireAuthCookie } from "~/cookies.server";

export const meta: MetaFunction = () => {
  return [
    { title: "New Remix App" },
    { name: "description", content: "Welcome to Remix!" },
  ];
};

export async function loader({ request }: LoaderFunctionArgs) {
  let employeeNumber = await requireAuthCookie(request);

  return { employeeNumber };
}

export default function Index() {
  let loaderData = useLoaderData<typeof loader>();

  return (
    <div>
      <h1>Welcome to Remix, {loaderData?.employeeNumber ?? ""}</h1>
      <Button>test 1</Button>
      <a href="/login"> to login</a>
    </div>
  );
}
