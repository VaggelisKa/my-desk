import { eq } from "drizzle-orm";
import { useEffect } from "react";
import {
  data,
  Link,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
} from "react-router";
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
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/root";
import { useToast } from "./components/ui/use-toast";

let iconSizes = ["57", "72", "76", "114", "120", "144", "152", "180"] as const;

export let links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ...iconSizes.map((size) => ({
    rel: "apple-touch-icon",
    sizes: `${size}x${size}`,
    href: `/apple-touch-icon-${size}x${size}.png`,
  })),
];

export async function loader({ request }: Route.LoaderArgs) {
  let cookieHeader = request.headers.get("Cookie");
  let userData = await userCookie.parse(cookieHeader);

  let { toast, headers } = await getToast(request);
  let user = await db.query.users.findFirst({
    where: eq(users.id, userData?.userId || ""),
    with: {
      desk: true,
    },
  });

  return data(
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
  }, [data, toast]);

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
                      Your reservations
                    </Link>
                  </DropdownMenuItem>

                  {data.user?.desk?.id && (
                    <>
                      <DropdownMenuItem>
                        <Link
                          to="/reserve"
                          className="flex w-full"
                          prefetch="intent"
                        >
                          Add reservation
                        </Link>
                      </DropdownMenuItem>

                      <DropdownMenuItem>
                        <Link
                          to="/automatic-reservations"
                          className="flex w-full"
                          prefetch="intent"
                        >
                          Automatic reservations
                        </Link>
                      </DropdownMenuItem>
                    </>
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
                        className="flex w-full cursor-pointer appearance-none text-left"
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
