import archivo400 from "@fontsource/archivo/400.css?url";
import archivo500 from "@fontsource/archivo/500.css?url";
import archivo600 from "@fontsource/archivo/600.css?url";
import archivo700 from "@fontsource/archivo/700.css?url";
import { Island, SheetStack } from "@silk-hq/components";
import silkStyles from "@silk-hq/components/unlayered-styles.css?url";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  data,
  isRouteErrorResponse,
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
import { AppMenu, Dock, Masthead } from "~/components/app-shell";
import { ErrorCard } from "~/components/error-card";
import { NavigationProgress } from "~/components/navigation-progress";
import { TabPending, usePendingTab } from "~/components/tab-pending";
import {
  useClearOnSubmit,
  useFreshAfterLongBreak,
  useShowBackgroundRefresh,
  WarmTabs,
} from "~/components/tab-warmup";
import { Toaster } from "~/components/ui/toaster";
import { getAuthenticatedUser } from "~/cookies.server";
import stylesheet from "~/globals.css?url";
import { activeTab, PAGE_COLUMN } from "~/lib/app-shell";
import {
  clearTabCache,
  isMutation,
  isShellStale,
  markShellFresh,
  shellMarks,
} from "~/lib/tab-cache";
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
  // Crisp at any size; the PNG is for browsers without SVG favicons.
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
  { rel: "icon", type: "image/png", sizes: "96x96", href: "/favicon.png" },
  { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
  ...iconSizes.map((size) => ({
    rel: "apple-touch-icon",
    sizes: `${size}x${size}`,
    href: `/apple-touch-icon-${size}x${size}.png`,
  })),
];

// Pages set their own title; this covers the rest (the error page, a missing
// page), so the tab and screen readers never get a blank one.
export let meta: Route.MetaFunction = () => [{ title: "My desk" }];

export async function loader({ request }: Route.LoaderArgs) {
  let [{ toast, headers }, user] = await Promise.all([
    getToast(request),
    getAuthenticatedUser(request),
  ]);

  // Only what the app chrome shows goes to the browser.
  let shellUser = user && {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    desk: user.desk && {
      id: user.desk.id,
      block: user.desk.block,
      row: user.desk.row,
      column: user.desk.column,
    },
  };

  return data({ user: shellUser, toast }, { headers });
}

// Marks the shell fresh once it really reloads (see `isShellStale`). Only runs
// on revalidation, never on the first load (no `hydrate`).
export async function clientLoader({ serverLoader }: Route.ClientLoaderArgs) {
  let marks = shellMarks();
  let data = await serverLoader();
  markShellFresh(marks);
  return data;
}

// Toasts are flashed through this loader. React Router skips revalidation after
// an action responds with a 4xx/5xx, which would swallow every error toast.
//
// This runs after every change (a booking, an admin change, signing out) and
// before anything reloads, so it also empties the tab cache there: no tab
// shows data from before the change. A GET form (the Desks filters) changes
// nothing, so it keeps the cache.
//
// Moving between tabs changes nothing the shell shows, so it skips this loader
// and the tab's cached data lands on tap. The shell loads again when a tab's
// loader redirected or failed (a signed-out session, a lost admin role with
// its toast), and in the background along with each tab refresh, so a name,
// role or desk changed by an admin shows up.
export function shouldRevalidate({
  actionStatus,
  nextUrl,
  formMethod,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs) {
  if (isMutation(formMethod)) {
    clearTabCache();

    return actionStatus !== undefined && actionStatus >= 400
      ? true
      : defaultShouldRevalidate;
  }

  if (isShellStale()) {
    return true;
  }

  if (activeTab(nextUrl.pathname)) {
    return false;
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
function useOutletScrollRestoration(
  outlet: RefObject<HTMLDivElement | null>,
  switchingTab: boolean,
) {
  let location = useLocation();
  let navigationType = useNavigationType();
  let previous = useRef(location);
  let currentKey = useRef(location.key);
  let paused = useRef(switchingTab);
  useLayoutEffect(() => {
    paused.current = switchingTab;
  }, [switchingTab]);

  // Recorded as you scroll: once the next page has rendered, the old one's
  // position is gone (or clamped to the new page's height).
  useEffect(() => {
    let element = outlet.current;
    if (!element) return;

    // Not while another tab's skeleton stands in: its scroll position is
    // not the page's.
    let onScroll = () => {
      if (!paused.current) {
        outletScroll.set(currentKey.current, element.scrollTop);
      }
    };
    element.addEventListener("scroll", onScroll, { passive: true });

    return () => element.removeEventListener("scroll", onScroll);
  }, [outlet]);

  // The skeleton of the tab you tapped starts at the top, like its page will.
  // React Router has already saved the window's position by now.
  useLayoutEffect(() => {
    if (!switchingTab) return;

    outlet.current?.scrollTo(0, 0);
    window.scrollTo(0, 0);
  }, [switchingTab, outlet]);

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

/**
 * What to say on the error page: the message a route threw with its status,
 * a missing page, or the error's message.
 */
function errorMessage(error: unknown) {
  if (isRouteErrorResponse(error)) {
    if (typeof error.data === "string" && error.data) return error.data;
    return error.status === 404
      ? "There is no page at this address."
      : error.statusText || undefined;
  }
  return error instanceof Error ? error.message : undefined;
}

/**
 * Reads out the new page's title after moving to another page in the app.
 * A full page load does that on its own; client-side navigation is silent
 * to screen readers otherwise. Changes within a page (filters, the day
 * strip) keep the path and stay quiet.
 */
function RouteAnnouncer() {
  let { pathname } = useLocation();
  let region = useRef<HTMLDivElement>(null);
  let previous = useRef(pathname);

  useEffect(() => {
    if (previous.current === pathname) return;
    previous.current = pathname;

    // After React Router has put the new page's <title> in.
    let frame = requestAnimationFrame(() => {
      if (region.current) region.current.textContent = document.title;
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return (
    <div
      ref={region}
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
    />
  );
}

/**
 * Marks the page as driven by touch (see `html[data-touch]` in globals.css)
 * from a finger tap until the next key press, so focus a sheet or menu moves
 * by script shows no ring on phones while keyboards still get one.
 */
function useTouchFocusRings() {
  useEffect(() => {
    let root = document.documentElement;
    let onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") root.dataset.touch = "";
      else delete root.dataset.touch;
    };
    let onKeyDown = () => delete root.dataset.touch;

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
}

export function Layout({ children }: { children: React.ReactNode }) {
  let data = useRouteLoaderData<typeof loader>("root");
  let error = useRouteError();
  let { toast } = useToast();
  let outlet = useRef<HTMLDivElement>(null);
  let user = data?.user?.id ? data.user : undefined;
  let pendingTab = usePendingTab();

  useOutletScrollRestoration(outlet, pendingTab !== undefined);
  useTouchFocusRings();
  useShowBackgroundRefresh();
  useClearOnSubmit();
  useFreshAfterLongBreak();

  useEffect(() => {
    if (!data?.toast) {
      return;
    }

    if (data.toast.type === "success") {
      toast({
        title: data.toast?.message,
        description: data.toast?.description,
        variant: "success",
        duration: 3000,
      });
    }

    if (data.toast.type === "error") {
      toast({
        title: data.toast.message,
        description: data.toast?.description,
        variant: "error",
        duration: 6000,
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
      {/* dvh, not vh: on iOS Safari 100vh is the height with the toolbars
          hidden, which left the phone page (scrolled inside .app-outlet)
          with a window that could still scroll that far, showing this dark
          body under the page. */}
      <body className="min-h-dvh bg-ink">
        <NavigationProgress />
        <SheetStack.Root>
          <SheetStack.Outlet
            ref={outlet}
            className="app-outlet bg-paper"
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
                <div className={cn(PAGE_COLUMN, "flex flex-col")}>
                  <ErrorCard
                    page
                    title={
                      isRouteErrorResponse(error) && error.status === 404
                        ? "Page not found"
                        : undefined
                    }
                    message={errorMessage(error)}
                  />
                </div>
              ) : user ? (
                <div className={cn(PAGE_COLUMN, "flex flex-col")}>
                  {pendingTab ? (
                    <TabPending tab={pendingTab} hasDesk={!!user.desk} />
                  ) : (
                    children
                  )}
                </div>
              ) : (
                children
              )}
            </main>
            {/* An island stays interactive and announced while a Silk sheet
            makes the rest of the page inert, so toasts still get through. */}
            {/* Silk makes the island a scroll box, which Chrome would stop
            on while tabbing even with no toast in it. */}
            <Island.Root tabIndex={-1}>
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
            {!error && <WarmTabs user={user} />}
          </>
        )}

        <RouteAnnouncer />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return <Outlet />;
}
