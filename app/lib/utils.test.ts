import { describe, expect, it } from "vitest";
import { calculatePercentDiff } from "./utils";

describe("calculatePercentDiff", () => {
  it("returns null when there is no baseline to compare against", () => {
    expect(calculatePercentDiff(10, 0)).toBeNull();
  });

  it("returns a positive percentage for an increase", () => {
    expect(calculatePercentDiff(15, 10)).toBe(50);
  });

  it("returns a negative percentage for a decrease", () => {
    expect(calculatePercentDiff(5, 20)).toBe(-75);
  });

  it("returns 0 when the value is unchanged", () => {
    expect(calculatePercentDiff(7, 7)).toBe(0);
  });
});
