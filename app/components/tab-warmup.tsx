import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useFetcher,
  useLocation,
  useNavigation,
  useRevalidator,
} from "react-router";
import type { ShellUser } from "~/components/app-shell";
import { activeTab } from "~/lib/app-shell";
import { cacheGeneration, onRefresh, subscribeToClears } from "~/lib/tab-cache";

/** How long the app has to sit still before the other tabs load. */
const WARM_AFTER_MS = 800;

/**
 * Every loader a tab tap runs, as fetcher hrefs. A fetcher loads the parent
 * layout without `?index` and the index page with it. Only what this person
 * can open: loaders that would redirect (Admin for non-admins, Recurring
 * without a desk) are left out, since a fetcher follows the redirect.
 */
function tabLoaders(user: ShellUser) {
  return [
    "/?index",
    "/bookings",
    "/bookings?index",
    ...(user.desk ? ["/bookings/recurring"] : []),
    "/metrics",
    ...(user.role === "admin" ? ["/admin"] : []),
  ];
}

/**
 * Loads every tab into the tab cache once the app has settled, and again
 * after each change empties it, so even the first tap on a tab shows it at
 * once. The fetchers unmount when done, so later submissions do not
 * revalidate them.
 */
export function WarmTabs({ user }: { user: ShellUser }) {
  let generation = useSyncExternalStore(
    subscribeToClears,
    cacheGeneration,
    () => 0,
  );
  let [warmed, setWarmed] = useState<number>();

  if (warmed === generation) return null;

  return (
    <WarmBatch
      key={generation}
      hrefs={tabLoaders(user)}
      onDone={() => setWarmed(generation)}
    />
  );
}

function WarmBatch({ hrefs, onDone }: { hrefs: string[]; onDone: () => void }) {
  let idle = useNavigation().state === "idle";
  let [started, setStarted] = useState(false);
  let finished = useRef(new Set<string>());

  // Waits for the page's own data first; a navigation restarts the wait.
  useEffect(() => {
    if (started || !idle) return;
    let timer = setTimeout(() => setStarted(true), WARM_AFTER_MS);
    return () => clearTimeout(timer);
  }, [idle, started]);

  if (!started) return null;

  return hrefs.map((href) => (
    <WarmLoader
      key={href}
      href={href}
      onDone={() => {
        finished.current.add(href);
        if (finished.current.size === hrefs.length) onDone();
      }}
    />
  ));
}

function WarmLoader({ href, onDone }: { href: string; onDone: () => void }) {
  let { load } = useFetcher();
  let finish = useEffectEvent(onDone);

  useEffect(() => {
    void load(href).finally(() => finish());
  }, [load, href]);

  return null;
}

/**
 * Shows a tab's refreshed data once its background refresh lands. The
 * revalidation finds the new entry in the tab cache, so it asks the server
 * for nothing.
 */
export function useShowBackgroundRefresh() {
  let { revalidate } = useRevalidator();
  let { pathname } = useLocation();
  let showRefresh = useEffectEvent(() => {
    // Off the tabs (the profile page) there is nothing cached on screen.
    if (activeTab(pathname)) void revalidate();
  });

  useEffect(() => onRefresh(() => showRefresh()), []);
}
