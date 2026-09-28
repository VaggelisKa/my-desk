/**
 * What each tab last loaded, kept in memory so going back to a tab shows it
 * at once while a fresh copy loads in the background. It only lives as long
 * as the page: a reload or a new visit starts empty. Any change (a booking,
 * an admin change, signing out) empties it, so a change never hides behind
 * data from before it.
 */

type Entry = { data: unknown; at: number };

/** Data younger than this is shown without asking the server again. */
export const FRESH_FOR = 5_000;

/**
 * Data older than this is not shown at all: after a long break (the phone
 * in a pocket, the app left open overnight) the tab waits for the server
 * rather than show yesterday's desks, even for a moment.
 */
export const MAX_AGE = 5 * 60_000;

/** Enough for every tab plus a handful of days and filters on Desks. */
const MAX_ENTRIES = 30;

/**
 * Marks a load as the background warm-up rather than a tap. Its failures and
 * redirects stay out of sight (see `cached`), and the cache key ignores it.
 */
export const WARM_PARAM = "warm";

let entries = new Map<string, Entry>();
let refreshing = new Set<string>();
let generation = 0;
let listeners = new Set<() => void>();
let refreshListeners = new Set<() => void>();
let shellStale = false;

/**
 * The cache key for a route's data at `request`'s URL. React Router adds
 * `?index` when a fetcher loads an index route and the warm-up adds `?warm`;
 * a tap on the tab has neither, so both are left out to land on one entry.
 */
export function cacheKey(routeId: string, request: Request) {
  let url = new URL(request.url);
  url.searchParams.delete("index");
  url.searchParams.delete(WARM_PARAM);
  url.searchParams.sort();
  return `${routeId} ${url.pathname}?${url.searchParams}`;
}

/** Whether a form submission changes data (a GET form only filters). */
export function isMutation(formMethod: string | undefined) {
  return !!formMethod && formMethod.toUpperCase() !== "GET";
}

/**
 * Returns what `key` last loaded straight away and refreshes it in the
 * background when it is older than `FRESH_FOR`. The first time, after the
 * cache was cleared, or after `MAX_AGE`, it waits for `load` like a normal
 * loader.
 *
 * Every call loads for itself, never sharing another call's request: that
 * one may be cancelled (a fetcher unmounting, a navigation replaced), and
 * its cancellation must not fail this one.
 */
export function cached<T>(
  key: string,
  request: Request,
  load: () => Promise<T>,
): Promise<T> {
  let { signal } = request;
  let hit = entries.get(key);
  let age = hit ? Date.now() - hit.at : Infinity;

  if (new URL(request.url).searchParams.has(WARM_PARAM)) {
    return hit && age <= FRESH_FOR
      ? Promise.resolve(hit.data as T)
      : warm(key, signal, load);
  }

  if (!hit || age > MAX_AGE) {
    return fetchInto(key, signal, load);
  }

  if (age > FRESH_FOR && !refreshing.has(key)) {
    refresh(key, signal, load);
  }

  return Promise.resolve(hit.data as T);
}

/**
 * Refreshes a shown entry behind the scenes, then tells the page. When the
 * refresh fails or redirects (a signed-out session, a lost admin role), the
 * entry goes and the page revalidates too: that reload misses the cache, so
 * the real error or redirect reaches the screen instead of old data staying
 * up.
 */
function refresh<T>(key: string, signal: AbortSignal, load: () => Promise<T>) {
  let startedIn = generation;
  refreshing.add(key);

  fetchInto(key, signal, load)
    .then(
      () => startedIn === generation,
      () => {
        // Cancelled (the tap was replaced by another): keep what we have.
        if (signal.aborted || startedIn !== generation) return false;
        entries.delete(key);
        return true;
      },
    )
    .then((changed) => {
      if (changed) refreshListeners.forEach((listener) => listener());
    })
    .finally(() => {
      if (startedIn === generation) refreshing.delete(key);
    });
}

/**
 * The warm-up's load. It never fails and never redirects: a fetcher that
 * did would put the error page over the screen you are on, or move you to
 * another page 800ms after opening the app. A failure just leaves the entry
 * empty (the tap then waits for the server, which shows the real error or
 * redirect) and has the shell reload on the next move.
 */
async function warm<T>(
  key: string,
  signal: AbortSignal,
  load: () => Promise<T>,
): Promise<T> {
  try {
    return await fetchInto(key, signal, load);
  } catch {
    // Nobody reads a warm-up fetcher's data.
    return null as T;
  }
}

async function fetchInto<T>(
  key: string,
  signal: AbortSignal,
  load: () => Promise<T>,
) {
  let startedIn = generation;

  try {
    let data = await load();
    // A change while this was loading may have changed the answer.
    if (startedIn === generation) store(key, data);
    return data;
  } catch (error) {
    // Redirects and errors (a signed-out session, a lost admin role) come
    // with a toast or a new user, which the shell has to pick up.
    if (!signal.aborted && startedIn === generation) shellStale = true;
    throw error;
  }
}

function store(key: string, data: unknown) {
  // Re-inserted so the Map's order is least recently stored first.
  entries.delete(key);
  entries.set(key, { data, at: Date.now() });

  while (entries.size > MAX_ENTRIES) {
    let oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

/** Forgets everything. Runs whenever data may have changed. */
export function clearTabCache() {
  entries.clear();
  refreshing.clear();
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

/** Called when a background refresh changed what a tab should show. */
export function onRefresh(listener: () => void) {
  refreshListeners.add(listener);
  return () => {
    refreshListeners.delete(listener);
  };
}

/** Has the root loader run again on the next move (see `takeShellStale`). */
export function markShellStale() {
  shellStale = true;
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
