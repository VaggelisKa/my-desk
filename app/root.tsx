import archivo400 from "@fontsource/archivo/400.css?url";
import archivo500 from "@fontsource/archivo/500.css?url";
import archivo600 from "@fontsource/archivo/600.css?url";
import archivo700 from "@fontsource/archivo/700.css?url";
import { useEffect } from "react";
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { getToast } from "remix-toast";
import { ErrorCard } from "~/components/error-card";
import { NavigationProgress } from "~/components/navigation-progress";
import { Toaster } from "~/components/ui/toaster";
import { getAuthenticatedUser } from "~/cookies.server";
import stylesheet from "~/globals.css?url";
import type { Route } from "./+types/root";
import { AppBreadcrumbs } from "./components/app-breadcrumbs";
import { AppSidebar } from "./components/app-sidebar";
import { Separator } from "./components/ui/separator";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "./components/ui/sidebar";
import { useToast } from "./components/ui/use-toast";

let iconSizes = ["57", "72", "76", "114", "120", "144", "152", "180"] as const;

export let links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: archivo400 },
  { rel: "stylesheet", href: archivo500 },
  { rel: "stylesheet", href: archivo600 },
  { rel: "stylesheet", href: archivo700 },
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

  let { toast, headers } = await getToast(request);
  let user = await getAuthenticatedUser(request);

  let sidebarState = cookieHeader
    ?.split("; ")
    .find((row) => row.startsWith("sidebar_state="))
    ?.split("=")[1];

  return data(
    {
      user,
      toast,
      sidebarState:
        sidebarState === undefined
          ? true
          : sidebarState === "true"
            ? true
            : false,
    },
    { headers },
  );
}

// Toasts are flashed through this loader. React Router skips revalidation after
// an action responds with a 4xx/5xx, which would swallow every error toast.
export function shouldRevalidate({
  actionStatus,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (actionStatus !== undefined && actionStatus >= 400) {
    return true;
  }

  return defaultShouldRevalidate;
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
        <NavigationProgress />
        <SidebarProvider defaultOpen={data?.sidebarState ?? true}>
          {data?.user?.id && (
            <AppSidebar deskId={data.user?.desk?.id} userId={data.user?.id} />
          )}

          <SidebarInset>
            {data?.user?.id && (
              <header className="flex h-16 w-full items-center gap-2 border-b px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <AppBreadcrumbs />
              </header>
            )}

            <main className="flex w-full justify-center px-4 py-8">
              {/* @ts-expect-error react-router forwards an error message but type is unknown*/}
              {error ? <ErrorCard message={error?.message} /> : children}
            </main>
            <Toaster />
          </SidebarInset>

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
