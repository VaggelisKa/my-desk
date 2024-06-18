import {
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  json,
  useRouteError,
  useRouteLoaderData,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@vercel/remix";
import { eq } from "drizzle-orm";
import { useEffect } from "react";
import { getToast } from "remix-toast";
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
import { useToast } from "./components/ui/use-toast";

export let links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.png" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let userData = await userCookie.parse(cookieHeader);

  let { toast, headers } = await getToast(request);
  let user = await db.query.users.findFirst({
    where: eq(users.id, userData?.userId || ""),
    with: {
      desk: true,
    },
  });

  return json(
    {
      user,
      toast,
    },
    { headers },
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  let data = useRouteLoaderData<typeof loader>("root");
  let error = useRouteError();
  let { toast } = useToast();

  useEffect(() => {
    if (!data?.toast) {
      return;
    }

    if (data.toast.type === "success") {
      toast({
        title: data.toast?.message,
        description: data.toast?.description,
        duration: 3000,
      });
    }

    if (data.toast.type === "error") {
      toast({
        title: data.toast.message,
        description: data.toast?.description,
        variant: "destructive",
      });
    }
  }, [data?.toast, toast]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link
          rel="apple-touch-icon"
          sizes="57x57"
          href="/apple-touch-icon-57x57.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="72x72"
          href="/apple-touch-icon-72x72.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="76x76"
          href="/apple-touch-icon-76x76.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="114x114"
          href="/apple-touch-icon-114x114.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="120x120"
          href="/apple-touch-icon-120x120.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="144x144"
          href="/apple-touch-icon-144x144.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/apple-touch-icon-152x152.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon-180x180.png"
        />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen">
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
                    <Link
                      className="w-full"
                      to="/reservations"
                      prefetch="render"
                    >
                      Reservations
                    </Link>
                  </DropdownMenuItem>

                  {data.user?.desk?.id && (
                    <DropdownMenuItem>
                      <Link
                        to="/reserve"
                        className="flex w-full"
                        prefetch="intent"
                      >
                        Add reservation
                      </Link>
                    </DropdownMenuItem>
                  )}

                  <DropdownMenuItem>
                    <Link
                      to={`/users/edit/${data.user.id}`}
                      className="flex w-full"
                      prefetch="intent"
                    >
                      Edit profile
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem>
                    <form
                      method="POST"
                      action="/login/logout"
                      className="w-full"
                    >
                      <input
                        className="flex w-full cursor-pointer appearance-none"
                        type="submit"
                        value="Logout"
                      />
                    </form>
                  </DropdownMenuItem>

                  <DropdownMenuLabel>External links</DropdownMenuLabel>
                  <DropdownMenuSeparator />

                  <DropdownMenuGroup>
                    <DropdownMenuItem>
                      <a
                        href="https://github.com/VaggelisKa/my-desk"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="w-full"
                      >
                        View source code
                      </a>
                    </DropdownMenuItem>

                    <DropdownMenuItem>
                      <a
                        href="https://github.com/VaggelisKa/my-desk/issues/new"
                        target="_blank"
                        rel="noreferrer noopener"
                        className="w-full"
                      >
                        Report a bug
                      </a>
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
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
