import { eq } from "drizzle-orm";
import { useEffect } from "react";
import {
  data,
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
import { Toaster } from "~/components/ui/toaster";
import { userCookie } from "~/cookies.server";
import stylesheet from "~/globals.css?url";
import { db } from "~/lib/db/drizzle.server";
import { users } from "~/lib/db/schema";
import type { Route } from "./+types/root";
import { AppBreadcrumbs } from "./components/app-breadcrumbs";
import { AppSidebar } from "./components/app-sidebar";
import { Separator } from "./components/ui/separator";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "./components/ui/sidebar";
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
        <SidebarProvider>
          {data?.user?.id && (
            <AppSidebar>
              <SidebarGroup>
                <SidebarGroupLabel>Reservations</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <NavLink
                        to="/reservations"
                        prefetch="render"
                        tabIndex={-1}
                      >
                        {({ isActive }) => (
                          <SidebarMenuButton isActive={isActive}>
                            My reservations
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                    </SidebarMenuItem>

                    {data.user?.desk?.id && (
                      <>
                        <SidebarMenuItem>
                          <NavLink to="/reserve" prefetch="intent">
                            {({ isActive }) => (
                              <SidebarMenuButton isActive={isActive}>
                                Add reservation
                              </SidebarMenuButton>
                            )}
                          </NavLink>
                        </SidebarMenuItem>

                        <SidebarMenuItem>
                          <NavLink
                            to="/automatic-reservations"
                            prefetch="intent"
                            tabIndex={-1}
                          >
                            {({ isActive }) => (
                              <SidebarMenuButton isActive={isActive}>
                                Automatic reservations
                              </SidebarMenuButton>
                            )}
                          </NavLink>
                        </SidebarMenuItem>
                      </>
                    )}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>Profile</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <NavLink
                        to={`/users/edit/${data.user?.id}`}
                        className="flex w-full"
                        prefetch="intent"
                        tabIndex={-1}
                      >
                        {({ isActive }) => (
                          <SidebarMenuButton isActive={isActive}>
                            Edit profile
                          </SidebarMenuButton>
                        )}
                      </NavLink>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>

              <SidebarGroup>
                <SidebarGroupLabel>External links</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={false}>
                        <a
                          href="https://github.com/VaggelisKa/my-desk"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="w-full"
                        >
                          View source code
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    <SidebarMenuItem>
                      <SidebarMenuButton asChild isActive={false}>
                        <a
                          href="https://github.com/VaggelisKa/my-desk/issues/new"
                          target="_blank"
                          rel="noreferrer noopener"
                          className="w-full"
                        >
                          Report a bug
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </AppSidebar>
          )}

          <SidebarInset>
            {data?.user?.id && (
              <header className="flex h-16 w-full items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <AppBreadcrumbs />
              </header>
            )}

            <main className="flex w-full justify-center p-12">
              {/* @ts-expect-error react-router forwards an error message but type is unknown*/}
              {error ? <ErrorCard message={error?.message} /> : children}
            </main>
          </SidebarInset>

          <Toaster />
          <ScrollRestoration />
          <Scripts />
        </SidebarProvider>
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
