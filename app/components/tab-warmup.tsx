import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  useFetcher,
  useFetchers,
  useLocation,
  useNavigation,
  useRevalidator,
} from "react-router";
import type { ShellUser } from "~/components/app-shell";
import { activeTab } from "~/lib/app-shell";
import {
  cacheGeneration,
  clearTabCache,
  isMutation,
  markShellStale,
  onRefresh,
  subscribeToClears,
  WARM_PARAM,
} from "~/lib/tab-cache";

/** How long the app has to sit still before the other tabs load. */
const WARM_AFTER_MS = 800;

/** A break longer than this and the app forgets and reloads what it shows. */
const LONG_BREAK_MS = 60_000;

/**
 * Every loader a tab tap runs, as fetcher hrefs. A fetcher loads the parent
 * layout without `?index` and the index page with it. `?warm` keeps a failed
 * or redirected load out of sight (see `cached`). Admin and Recurring are
 * only loaded for people who can open them, to save the requests.
 */
function tabLoaders(user: ShellUser) {
  return [
    `/?index&${WARM_PARAM}`,
    `/bookings?${WARM_PARAM}`,
    `/bookings?index&${WARM_PARAM}`,
    ...(user.desk ? [`/bookings/recurring?${WARM_PARAM}`] : []),
    `/metrics?${WARM_PARAM}`,
    ...(user.role === "admin" ? [`/admin?${WARM_PARAM}`] : []),
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
  // Not while a page loads or a change is saved (fetcher submissions do not
  // show in the navigation), so the warm-up never slows what you wait for.
  let navigating = useNavigation().state !== "idle";
  let saving = useFetchers().some((fetcher) => isMutation(fetcher.formMethod));
  let idle = !navigating && !saving;
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
        if (finished.current.size >= hrefs.length) onDone();
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
 * revalidation finds the new entry in the tab cache, so the tab asks the
 * server for nothing. The shell loads again alongside it, since tab taps skip
 * it: that is how a new name, role or desk set by an admin shows up.
 */
export function useShowBackgroundRefresh() {
  let { revalidate } = useRevalidator();
  let { pathname } = useLocation();
  let showRefresh = useEffectEvent(() => {
    // Off the tabs (the profile page) there is nothing cached on screen.
    if (!activeTab(pathname)) return;
    markShellStale();
    void revalidate();
  });

  useEffect(() => onRefresh(() => showRefresh()), []);
}

/**
 * Empties the tab cache the moment a change starts saving. The root
 * `shouldRevalidate` empties it again before anything reloads; this covers
 * the actions that throw, which never get there.
 */
export function useClearOnSubmit() {
  let navigation = useNavigation();
  let fetchers = useFetchers();
  let saving =
    isMutation(navigation.formMethod) ||
    fetchers.some((fetcher) => isMutation(fetcher.formMethod));

  useEffect(() => {
    if (saving) clearTabCache();
  }, [saving]);
}

/**
 * After a long break (the phone in a pocket, another browser tab signing in
 * as someone else, the day turning over), forgets every tab and reloads the
 * page you come back to, shell included, so nothing from before shows as
 * current.
 */
export function useFreshAfterLongBreak() {
  let { revalidate } = useRevalidator();
  let reload = useEffectEvent(() => {
    clearTabCache();
    markShellStale();
    void revalidate();
  });

  useEffect(() => {
    let hiddenAt: number | undefined;
    let onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else if (
        hiddenAt !== undefined &&
        Date.now() - hiddenAt > LONG_BREAK_MS
      ) {
        hiddenAt = undefined;
        reload();
      }
    };

    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
}
