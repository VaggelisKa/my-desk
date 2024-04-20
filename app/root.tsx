import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";

import type { LinksFunction, LoaderFunctionArgs } from "@vercel/remix";
import stylesheet from "~/globals.css?url";
import { ExitIcon } from "@radix-ui/react-icons";
import { Button } from "./components/ui/button";
import { userCookie } from "./cookies.server";

export let links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let employeeNumber = await userCookie.parse(cookieHeader);

  return { employeeNumber };
}

export function Layout({ children }: { children: React.ReactNode }) {
  let loaderData = useLoaderData<typeof loader>();

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen">
        <header className="flex items-center justify-between bg-gray-800 p-2 text-white">
          <div>
            <span className="text-lg font-bold">Share-a-desk</span>
            <p className="text-xs text-gray-300">A workspace management app</p>
          </div>

          {loaderData.employeeNumber && (
            <form method="POST" action="/login/logout">
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                className="hover:bg-gray-300 focus-visible:ring-white"
              >
                <ExitIcon className="h-6 w-6" />
              </Button>
            </form>
          )}
        </header>

        <main className="container flex w-full justify-center py-24">
          {children}
        </main>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
