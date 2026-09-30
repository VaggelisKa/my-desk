import { describe, expect, it } from "vitest";
import { barAt, barIndexAt, valueTicks, visibleLabels } from "./bar-chart";

describe("valueTicks", () => {
  it("matches the steps the old chart library picked", () => {
    expect(valueTicks(270)).toEqual([0, 70, 140, 210, 280]);
    expect(valueTicks(1135)).toEqual([0, 300, 600, 900, 1200]);
    expect(valueTicks(18)).toEqual([0, 5, 10, 15, 20]);
    expect(valueTicks(3)).toEqual([0, 1, 2, 3, 4]);
  });

  it("steps up right at the boundaries", () => {
    expect(valueTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(valueTicks(5)).toEqual([0, 2, 4, 6, 8]);
    expect(valueTicks(40)).toEqual([0, 10, 20, 30, 40]);
    expect(valueTicks(41)).toEqual([0, 15, 30, 45, 60]);
    expect(valueTicks(100)).toEqual([0, 25, 50, 75, 100]);
    expect(valueTicks(101)).toEqual([0, 30, 60, 90, 120]);
  });

  it("falls back to 0 to 4 when there is nothing to scale", () => {
    for (let max of [0, -3, NaN, Infinity]) {
      expect(valueTicks(max)).toEqual([0, 1, 2, 3, 4]);
    }
  });

  it("always covers the tallest bar with five equal whole steps", () => {
    for (let max = 1; max <= 5000; max++) {
      let ticks = valueTicks(max);
      let step = ticks[1];
      expect(ticks[4]).toBeGreaterThanOrEqual(max);
      expect(Number.isInteger(step)).toBe(true);
      expect(ticks).toEqual([0, step, step * 2, step * 3, step * 4]);
    }
  });
});

let plot = { left: 48, top: 22, width: 300, height: 200 };

describe("barAt", () => {
  it("centres a whole-pixel bar in its slot", () => {
    // Slots of 33.33px: bars of 26px with 3.67px either side.
    let bar = barAt(plot, 9, 2);
    expect(bar.width).toBe(26);
    expect(bar.x - (48 + bar.slot * 2)).toBeCloseTo((bar.slot - 26) / 2);
    expect(bar.x + bar.width / 2).toBeCloseTo(48 + bar.slot * 2.5);
  });
});

describe("barIndexAt", () => {
  it("finds the slot under the pointer", () => {
    expect(barIndexAt(plot, 6, 48, 100)).toBe(0);
    expect(barIndexAt(plot, 6, 48 + 49.9, 100)).toBe(0);
    expect(barIndexAt(plot, 6, 48 + 50, 100)).toBe(1);
    expect(barIndexAt(plot, 6, 348, 100)).toBe(5);
  });

  it("is null outside the bars or with none", () => {
    expect(barIndexAt(plot, 6, 47, 100)).toBeNull();
    expect(barIndexAt(plot, 6, 349, 100)).toBeNull();
    expect(barIndexAt(plot, 6, 100, 21)).toBeNull();
    expect(barIndexAt(plot, 6, 100, 223)).toBeNull();
    expect(barIndexAt(plot, 0, 100, 100)).toBeNull();
  });
});

describe("visibleLabels", () => {
  it("shows every label when they fit", () => {
    expect(visibleLabels([60, 100, 140], [20, 20, 20], 50, 150, 8)).toEqual([
      60, 100, 140,
    ]);
  });

  it("skips middle labels that would overlap, keeping first and last", () => {
    expect(
      visibleLabels([70, 90, 110, 130, 150], [30, 30, 30, 30, 30], 50, 170, 8),
    ).toEqual([70, null, 110, null, 150]);
  });

  it("pulls the first and last inside the edges instead of dropping them", () => {
    expect(visibleLabels([55, 100, 145], [40, 10, 40], 50, 150, 8)).toEqual([
      70,
      null,
      130,
    ]);
  });

  it("keeps only the last when two labels can't both fit", () => {
    expect(visibleLabels([60, 80], [40, 40], 50, 90, 8)).toEqual([null, 70]);
  });

  it("handles one label and none", () => {
    expect(visibleLabels([100], [30], 50, 150, 8)).toEqual([100]);
    expect(visibleLabels([], [], 50, 150, 8)).toEqual([]);
  });
});
