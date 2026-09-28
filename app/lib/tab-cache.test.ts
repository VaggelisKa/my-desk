import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cached,
  cacheGeneration,
  cacheKey,
  clearTabCache,
  FRESH_FOR,
  isMutation,
  MAX_AGE,
  onRefresh,
  takeShellStale,
} from "./tab-cache";

let tap = () => new Request("http://x/bookings");
let warmup = () => new Request("http://x/bookings?warm");

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  let promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let redirect = () => new Response(null, { status: 302 });

beforeEach(() => {
  vi.useFakeTimers();
  clearTabCache();
  takeShellStale();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheKey", () => {
  it("ignores the ?index and ?warm fetchers add, and the order of the params", () => {
    expect(
      cacheKey("routes/_index", new Request("http://x/?index&warm&b=2&a=1")),
    ).toBe(cacheKey("routes/_index", new Request("http://x/?a=1&b=2")));
  });

  it("tells days apart", () => {
    expect(
      cacheKey(
        "routes/_index",
        new Request("http://x/?selected-day=01.10.2026"),
      ),
    ).not.toBe(
      cacheKey(
        "routes/_index",
        new Request("http://x/?selected-day=02.10.2026"),
      ),
    );
  });
});

describe("isMutation", () => {
  it("counts every method but GET, which only filters", () => {
    expect(isMutation("POST")).toBe(true);
    expect(isMutation("delete")).toBe(true);
    expect(isMutation("GET")).toBe(false);
    expect(isMutation("get")).toBe(false);
    expect(isMutation(undefined)).toBe(false);
  });
});

describe("cached", () => {
  it("waits for the server the first time, then answers from memory", async () => {
    let load = vi.fn(async () => "first");

    await expect(cached("k", tap(), load)).resolves.toBe("first");
    await expect(cached("k", tap(), load)).resolves.toBe("first");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shows the old data and refreshes it once it is no longer fresh", async () => {
    let refreshed = vi.fn();
    let stop = onRefresh(refreshed);
    await cached("k", tap(), async () => "old");
    vi.advanceTimersByTime(FRESH_FOR + 1);

    await expect(cached("k", tap(), async () => "new")).resolves.toBe("old");
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    await expect(cached("k", tap(), async () => "unused")).resolves.toBe("new");
    stop();
  });

  it("waits for the server after a long break instead of showing old data", async () => {
    await cached("k", tap(), async () => "yesterday");
    vi.advanceTimersByTime(MAX_AGE + 1);

    await expect(cached("k", tap(), async () => "today")).resolves.toBe(
      "today",
    );
  });

  it("drops the entry and reloads the page when a refresh redirects", async () => {
    let refreshed = vi.fn();
    let stop = onRefresh(refreshed);
    await cached("k", tap(), async () => "signed in");
    vi.advanceTimersByTime(FRESH_FOR + 1);

    await expect(
      cached("k", tap(), async () => {
        throw redirect();
      }),
    ).resolves.toBe("signed in");
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));

    // The reload that follows misses, so the redirect reaches the router.
    await expect(
      cached("k", tap(), async () => {
        throw redirect();
      }),
    ).rejects.toBeInstanceOf(Response);
    expect(takeShellStale()).toBe(true);
    stop();
  });

  it("forgets everything when a change clears it", async () => {
    await cached("k", tap(), async () => "before");
    let generation = cacheGeneration();

    clearTabCache();

    expect(cacheGeneration()).toBe(generation + 1);
    await expect(cached("k", tap(), async () => "after")).resolves.toBe(
      "after",
    );
  });

  it("drops an answer that was loading while the cache was cleared", async () => {
    let slow = deferred<string>();
    let loading = cached("k", tap(), () => slow.promise);

    clearTabCache();
    slow.resolve("before the change");
    await loading;

    await expect(cached("k", tap(), async () => "after")).resolves.toBe(
      "after",
    );
  });

  it("does not reload the page for a refresh that started before a clear", async () => {
    let refreshed = vi.fn();
    let stop = onRefresh(refreshed);
    await cached("k", tap(), async () => "old");
    vi.advanceTimersByTime(FRESH_FOR + 1);
    let slow = deferred<string>();
    await cached("k", tap(), () => slow.promise);

    clearTabCache();
    slow.resolve("from before the change");
    await vi.advanceTimersByTimeAsync(0);

    expect(refreshed).not.toHaveBeenCalled();
    stop();
  });

  it("asks the shell to reload after a loader redirects or fails", async () => {
    await expect(
      cached("k", tap(), async () => {
        throw redirect();
      }),
    ).rejects.toBeInstanceOf(Response);

    expect(takeShellStale()).toBe(true);
    expect(takeShellStale()).toBe(false);
  });

  it("never lets the warm-up fail or redirect", async () => {
    await expect(
      cached("k", warmup(), async () => {
        throw redirect();
      }),
    ).resolves.toBeNull();

    // Nothing stored: the tap goes to the server and meets the redirect.
    await expect(
      cached("k", tap(), async () => {
        throw redirect();
      }),
    ).rejects.toBeInstanceOf(Response);
  });

  it("does not treat a cancelled load as a failure", async () => {
    let controller = new AbortController();
    let request = new Request("http://x/bookings", {
      signal: controller.signal,
    });
    let load = cached("k", request, async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(load).rejects.toThrow("aborted");
    expect(takeShellStale()).toBe(false);
  });

  it("keeps a bounded number of entries", async () => {
    for (let i = 0; i < 40; i++) {
      await cached(`k${i}`, tap(), async () => i);
    }
    let load = vi.fn(async () => -1);

    await expect(cached("k0", tap(), load)).resolves.toBe(-1);
    await expect(cached("k39", tap(), load)).resolves.toBe(39);
  });
});
