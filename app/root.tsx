import archivo400 from "@fontsource/archivo/400.css?url";
import archivo500 from "@fontsource/archivo/500.css?url";
import archivo600 from "@fontsource/archivo/600.css?url";
import archivo700 from "@fontsource/archivo/700.css?url";
import { Island, SheetStack } from "@silk-hq/components";
import silkStyles from "@silk-hq/components/unlayered-styles.css?url";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  data,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
  useNavigationType,
  useRouteError,
  useRouteLoaderData,
  type ShouldRevalidateFunctionArgs,
} from "react-router";
import { getToast } from "remix-toast";
import {
  AppMenu,
  Dock,
  Masthead,
  PAGE_COLUMN,
  PageHeading,
} from "~/components/app-shell";
import { ErrorCard } from "~/components/error-card";
import { NavigationProgress } from "~/components/navigation-progress";
import { Toaster } from "~/components/ui/toaster";
import { getAuthenticatedUser } from "~/cookies.server";
import stylesheet from "~/globals.css?url";
import { cn } from "~/lib/utils";
import type { Route } from "./+types/root";
import { useToast } from "./components/ui/use-toast";

let iconSizes = ["57", "72", "76", "114", "120", "144", "152", "180"] as const;

// On phones the page sinks back a little while a sheet is up, iOS style.
// Only sheets that open from the bottom join the stack, so this never runs
// behind the desktop side sheet (a no-op transform there still forced the
// whole page onto its own layer and made it flicker).
let depth = {
  transformOrigin: "50% 0",
  scale: ({ progress, tween }: DepthFrame) =>
    tween(1, 1 - 0.06 * Math.min(progress, 1)),
  translateY: ({ progress, tween }: DepthFrame) =>
    tween("0px", `${12 * Math.min(progress, 1)}px`),
  borderRadius: ({ progress, tween }: DepthFrame) =>
    tween("0px", `${14 * Math.min(progress, 1)}px`),
};

type DepthFrame = {
  progress: number;
  tween: (start: number | string, end: number | string) => string;
};

export let links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: archivo400 },
  { rel: "stylesheet", href: archivo500 },
  { rel: "stylesheet", href: archivo600 },
  { rel: "stylesheet", href: archivo700 },
  { rel: "stylesheet", href: silkStyles },
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
  let { toast, headers } = await getToast(request);
  let user = await getAuthenticatedUser(request);

  return data({ user, toast }, { headers });
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

// Where each history entry's outlet was scrolled to, by location key.
let outletScroll = new Map<string, number>();

/**
 * On phones the page scrolls inside the outlet (see `.app-outlet`), which the
 * window-based <ScrollRestoration> cannot see. So do its job there: a new page
 * starts at the top, and Back or Forward returns to where that page was left.
 * On desktop the outlet does not scroll and this is a no-op.
 */
function useOutletScrollRestoration(outlet: RefObject<HTMLDivElement | null>) {
  let location = useLocation();
  let navigationType = useNavigationType();
  let previous = useRef(location);
  let currentKey = useRef(location.key);

  // Recorded as you scroll: once the next page has rendered, the old one's
  // position is gone (or clamped to the new page's height).
  useEffect(() => {
    let element = outlet.current;
    if (!element) return;

    let onScroll = () =>
      outletScroll.set(currentKey.current, element.scrollTop);
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => element.removeEventListener("scroll", onScroll);
  }, [outlet]);

  // Before paint, so the page never shows at the old position first.
  useLayoutEffect(() => {
    let from = previous.current;
    previous.current = location;
    currentKey.current = location.key;

    let element = outlet.current;
    if (!element || from.key === location.key) return;

    let saved = outletScroll.get(location.key);

    if (navigationType === "POP" && saved !== undefined) {
      element.scrollTo(0, saved);
    } else if (from.pathname !== location.pathname) {
      // Only a new page starts at the top: filters and the day strip change
      // the search params and keep your place.
      element.scrollTo(0, 0);
    }
  }, [location, navigationType, outlet]);
}

export function Layout({ children }: { children: React.ReactNode }) {
  let data = useRouteLoaderData<typeof loader>("root");
  let error = useRouteError();
  let { toast } = useToast();
  let outlet = useRef<HTMLDivElement>(null);
  let user = data?.user?.id ? data.user : undefined;

  useOutletScrollRestoration(outlet);

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
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <Meta />
        <Links />
      </head>
      <body className="min-h-screen bg-ink">
        <NavigationProgress />
        <SheetStack.Root>
          <SheetStack.Outlet
            ref={outlet}
            className="app-outlet bg-background"
            stackingAnimation={depth}
          >
            {user && <Masthead user={user} />}

            <main
              className={cn(
                "flex w-full flex-col items-center px-4 py-8",
                // Room for the floating dock on phones.
                user && "pb-[calc(104px+env(safe-area-inset-bottom))] md:pb-8",
              )}
            >
              {error ? (
                // @ts-expect-error react-router forwards an error message but type is unknown
                <ErrorCard message={error?.message} />
              ) : user ? (
                <div className={cn(PAGE_COLUMN, "flex flex-col")}>
                  <PageHeading />
                  {children}
                </div>
              ) : (
                children
              )}
            </main>
            {/* An island stays interactive and announced while a Silk sheet
            makes the rest of the page inert, so toasts still get through. */}
            <Island.Root>
              <Island.Content>
                <Toaster />
              </Island.Content>
            </Island.Root>
          </SheetStack.Outlet>
        </SheetStack.Root>

        {user && (
          <>
            <Dock user={user} />
            <AppMenu user={user} />
          </>
        )}

        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
