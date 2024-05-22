import {
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@vercel/remix";
import { eq } from "drizzle-orm";
import { ErrorCard } from "~/components/error-card";
import { UserAvatar } from "~/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Toaster } from "~/components/ui/toaster";
import { userCookie } from "~/cookies.server";
import stylesheet from "~/globals.css?url";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema.server";

export let links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let userData = await userCookie.parse(cookieHeader);

  let user = await db.query.users.findFirst({
    where: eq(users.id, userData?.userId || ""),
    with: {
      desk: true,
    },
  });

  return {
    user,
  };
}

export function Layout({ children }: { children: React.ReactNode }) {
  let data = useRouteLoaderData<typeof loader>("root");
  let error = useRouteError();

  return (
    <html lang="en" className="overflow-x-hidden">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen overflow-x-hidden">
        <header className="flex items-center justify-between bg-gray-800 p-2 text-white">
          <NavLink to="/" aria-label="To homepage">
            <span className="text-lg font-bold">Share-a-desk</span>
            <p className="text-xs text-gray-300">A workspace management app</p>
          </NavLink>

          {data?.user?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <UserAvatar
                  className="transition-all hover:scale-105 hover:bg-gray-500"
                  firstName={data.user.firstName}
                  lastName={data.user.lastName}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mr-4" side="bottom">
                <DropdownMenuLabel>User actions</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Link to="/reservations" prefetch="render">
                      Reservations
                    </Link>
                  </DropdownMenuItem>

                  {data.user?.desk?.id && (
                    <DropdownMenuItem>
                      <Link to="/reserve" prefetch="intent">
                        Add reservation
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem>
                    <form method="POST" action="/login/logout">
                      <input
                        className="appearance-none"
                        type="submit"
                        value="Logout"
                      />
                    </form>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <main className="container flex w-full justify-center py-24">
          {/* @ts-expect-error Remix forwards an error message but type is unknown*/}
          {error ? <ErrorCard message={error?.message} /> : children}
        </main>
        <Toaster />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
