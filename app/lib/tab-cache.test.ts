import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cached,
  cacheGeneration,
  cacheKey,
  clearTabCache,
  FRESH_FOR,
  onRefresh,
  takeShellStale,
} from "./tab-cache";

let signal = new AbortController().signal;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  let promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
  clearTabCache();
  takeShellStale();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cacheKey", () => {
  it("ignores the ?index a fetcher adds and the order of the params", () => {
    expect(
      cacheKey("routes/_index", new Request("http://x/?index&b=2&a=1")),
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

describe("cached", () => {
  it("waits for the server the first time, then answers from memory", async () => {
    let load = vi.fn(async () => "first");

    await expect(cached("k", signal, load)).resolves.toBe("first");
    await expect(cached("k", signal, load)).resolves.toBe("first");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("shows the old data and refreshes it once it is no longer fresh", async () => {
    let refreshed = vi.fn();
    let stop = onRefresh(refreshed);
    await cached("k", signal, async () => "old");
    vi.advanceTimersByTime(FRESH_FOR + 1);

    await expect(cached("k", signal, async () => "new")).resolves.toBe("old");
    await vi.waitFor(() => expect(refreshed).toHaveBeenCalledTimes(1));
    await expect(cached("k", signal, async () => "unused")).resolves.toBe(
      "new",
    );
    stop();
  });

  it("forgets everything when a submission clears it", async () => {
    await cached("k", signal, async () => "before");
    let generation = cacheGeneration();

    clearTabCache();

    expect(cacheGeneration()).toBe(generation + 1);
    await expect(cached("k", signal, async () => "after")).resolves.toBe(
      "after",
    );
  });

  it("drops an answer that was loading while the cache was cleared", async () => {
    let slow = deferred<string>();
    let loading = cached("k", signal, () => slow.promise);

    clearTabCache();
    slow.resolve("before the change");
    await loading;

    await expect(cached("k", signal, async () => "after")).resolves.toBe(
      "after",
    );
  });

  it("asks the shell to reload after a loader redirects or fails", async () => {
    await expect(
      cached("k", signal, async () => {
        throw new Response(null, { status: 302 });
      }),
    ).rejects.toBeInstanceOf(Response);

    expect(takeShellStale()).toBe(true);
    expect(takeShellStale()).toBe(false);
  });

  it("does not treat a cancelled load as a failure", async () => {
    let controller = new AbortController();
    let load = cached("k", controller.signal, async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    });

    await expect(load).rejects.toThrow("aborted");
    expect(takeShellStale()).toBe(false);
  });
});
