import {
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@vercel/remix";
import { eq } from "drizzle-orm";
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
import stylesheet from "~/globals.css?url";
import { userCookie } from "./cookies.server";
import { db } from "./lib/db/drizzle.server";
import { users } from "./lib/db/schema.server";

export let links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let userData = await userCookie.parse(cookieHeader);

  let registeredUser = await db
    .select()
    .from(users)
    .where(eq(users.id, userData?.userId || ""));

  let user = registeredUser?.[0]
    ? registeredUser[0]
    : {
        id: userData?.userId,
        firstName: userData?.firstName,
        lastName: userData?.lastName,
      };

  return { user };
}

export function Layout({ children }: { children: React.ReactNode }) {
  let { user } = useLoaderData<typeof loader>();

  console.log(user);

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
          <NavLink to="/" aria-label="To homepage">
            <span className="text-lg font-bold">Share-a-desk</span>
            <p className="text-xs text-gray-300">A workspace management app</p>
          </NavLink>

          {user?.id && (
            <DropdownMenu>
              <DropdownMenuTrigger>
                <UserAvatar
                  className="transition-all hover:scale-105 hover:bg-gray-500"
                  firstName={user.firstName}
                  lastName={user.lastName}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="mr-4" side="bottom">
                <DropdownMenuLabel>User actions</DropdownMenuLabel>
                <DropdownMenuSeparator />

                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Link to="/reservations" prefetch="intent">
                      Reservations
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem>
                    <Link to="/reserve" prefetch="intent">
                      Add reservation
                    </Link>
                  </DropdownMenuItem>

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
