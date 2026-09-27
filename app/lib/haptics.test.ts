import { describe, expect, it, vi } from "vitest";
import { tapHaptic } from "./haptics";

describe("tapHaptic", () => {
  it("vibrates briefly where the Vibration API exists", () => {
    let vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { ...navigator, vibrate });
    let click = vi.spyOn(HTMLLabelElement.prototype, "click");

    tapHaptic();

    expect(vibrate).toHaveBeenCalledWith(10);
    expect(click).not.toHaveBeenCalled();
  });

  it("toggles a hidden switch elsewhere and leaves nothing behind", () => {
    vi.stubGlobal("navigator", { ...navigator, vibrate: undefined });
    let toggled: boolean[] = [];
    document.addEventListener("change", (event) => {
      let input = event.target as HTMLInputElement;
      toggled.push(input.hasAttribute("switch") && input.checked);
    });

    tapHaptic();

    expect(toggled).toEqual([true]);
    expect(document.querySelector("input[switch]")).toBeNull();
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
