import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useIsMobile } from "./use-mobile";

function mockMediaQueryListeners() {
  let listeners = new Set<() => void>();

  vi.spyOn(window, "matchMedia").mockImplementation(
    (query) =>
      ({
        media: query,
        addEventListener: (_: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) =>
          listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );

  return {
    resizeTo(width: number) {
      vi.stubGlobal("innerWidth", width);
      listeners.forEach((listener) => listener());
    },
  };
}

describe("useIsMobile", () => {
  it.each([
    [500, true],
    [767, true],
    [768, false],
    [1280, false],
  ])("at %ipx wide returns %s", (width, expected) => {
    vi.stubGlobal("innerWidth", width);

    let { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(expected);
  });

  it("updates when the viewport crosses the breakpoint", () => {
    let media = mockMediaQueryListeners();
    vi.stubGlobal("innerWidth", 1024);

    let { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => media.resizeTo(600));
    expect(result.current).toBe(true);

    act(() => media.resizeTo(900));
    expect(result.current).toBe(false);
  });
});
