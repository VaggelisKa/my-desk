/**
 * What each tab last loaded, kept in memory so going back to a tab shows it
 * at once while a fresh copy loads in the background. It only lives as long
 * as the page: a reload or a new visit starts empty. Any form submission (a
 * booking, an admin change, signing out) empties it, so a change never hides
 * behind data from before it.
 */

type Entry = { data: unknown; at: number };

/** Data younger than this is shown without asking the server again. */
export const FRESH_FOR = 5_000;

let entries = new Map<string, Entry>();
let refreshing = new Set<string>();
let generation = 0;
let listeners = new Set<() => void>();
let refreshListeners = new Set<() => void>();
let shellStale = false;

/**
 * The cache key for a route's data at `request`'s URL. React Router adds
 * `?index` when a fetcher loads an index route; a tap on the tab does not, so
 * it is left out to make both land on the same entry.
 */
export function cacheKey(routeId: string, request: Request) {
  let url = new URL(request.url);
  url.searchParams.delete("index");
  url.searchParams.sort();
  return `${routeId} ${url.pathname}?${url.searchParams}`;
}

/**
 * Returns what `key` last loaded straight away and refreshes it in the
 * background when it is older than `FRESH_FOR`. The first time, or after
 * the cache was cleared, it waits for `load` like a normal loader.
 *
 * Every call loads for itself, never sharing another call's request: that
 * one may be cancelled (a fetcher unmounting, a navigation replaced), and
 * its cancellation must not fail this one.
 */
export function cached<T>(
  key: string,
  signal: AbortSignal,
  load: () => Promise<T>,
): Promise<T> {
  let hit = entries.get(key);

  if (!hit) {
    return fetchInto(key, signal, load);
  }

  if (Date.now() - hit.at > FRESH_FOR && !refreshing.has(key)) {
    refreshing.add(key);
    fetchInto(key, signal, load)
      .then(
        () => refreshListeners.forEach((listener) => listener()),
        () => {
          // Cancelled: keep what we have. Failed: the next visit waits for
          // the server instead.
          if (!signal.aborted) entries.delete(key);
        },
      )
      .finally(() => refreshing.delete(key));
  }

  return Promise.resolve(hit.data as T);
}

async function fetchInto<T>(
  key: string,
  signal: AbortSignal,
  load: () => Promise<T>,
) {
  let startedIn = generation;

  try {
    let data = await load();
    // A submission while this was loading may have changed the answer.
    if (startedIn === generation) {
      entries.set(key, { data, at: Date.now() });
    }
    return data;
  } catch (error) {
    // Redirects and errors (a signed-out session, a lost admin role) come
    // with a toast or a new user, which the shell has to pick up.
    if (!signal.aborted) shellStale = true;
    throw error;
  }
}

/** Forgets everything. Runs after every submission, before anything reloads. */
export function clearTabCache() {
  entries.clear();
  generation++;
  listeners.forEach((listener) => listener());
}

/** Counts up each time the cache is cleared, for `useSyncExternalStore`. */
export function cacheGeneration() {
  return generation;
}

export function subscribeToClears(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Called when a background refresh has stored newer data. */
export function onRefresh(listener: () => void) {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/**
 * Whether a tab's loader failed or redirected since the last check, so the
 * root loader has to run again. Reading it resets it.
 */
export function takeShellStale() {
  let stale = shellStale;
  shellStale = false;
  return stale;
}
