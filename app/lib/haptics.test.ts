import { describe, expect, it, vi } from "vitest";
import { tapHaptic } from "./haptics";

describe("tapHaptic", () => {
  it("vibrates briefly where the Vibration API exists", () => {
    let vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });

    tapHaptic();

    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it("does nothing where it doesn't", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });

    expect(() => tapHaptic()).not.toThrow();
  });

  it("never throws", () => {
    vi.stubGlobal("navigator", {
      vibrate: () => {
        throw new Error("blocked");
      },
    });

    expect(() => tapHaptic()).not.toThrow();
  });
});
