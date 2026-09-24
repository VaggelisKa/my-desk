import { afterEach, describe, expect, it, vi } from "vitest";
import { calculatePercentDiff, cn, getDateByWeekAndDay } from "./utils";

describe("cn", () => {
  it("lets later tailwind classes override conflicting earlier ones", () => {
    expect(cn("p-4 text-sm", "p-2")).toBe("text-sm p-2");
  });

  it("drops falsy conditional classes", () => {
    expect(cn("base", false && "hidden", undefined, null, "end")).toBe(
      "base end",
    );
  });
});

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

describe("getDateByWeekAndDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // Anchors "now" so the year used by the function is deterministic.
  function setYear(year: number) {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(year, 5, 15));
  }

  it("resolves a day within the first week of the current year", () => {
    setYear(2025);
    // Week 1 of 2025 starts on Sunday, December 29th 2024.
    expect(getDateByWeekAndDay("sunday", 1)).toEqual(new Date(2024, 11, 29));
    expect(getDateByWeekAndDay("wednesday", 1)).toEqual(new Date(2025, 0, 1));
  });

  it("offsets by whole weeks for later week numbers", () => {
    setYear(2025);
    expect(getDateByWeekAndDay("monday", 10)).toEqual(new Date(2025, 2, 3));
  });

  it("is case insensitive about the day name", () => {
    setYear(2025);
    expect(getDateByWeekAndDay("FrIdAy", 2)).toEqual(new Date(2025, 0, 10));
  });

  it("throws for an unknown day name", () => {
    expect(() => getDateByWeekAndDay("funday", 1)).toThrow("Invalid day name");
  });
});
