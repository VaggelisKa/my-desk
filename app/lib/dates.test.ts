import { describe, expect, it } from "vitest";
import { defaultDay, formatDate, normalizeDay, workdaysOfWeek } from "./dates";

describe("normalizeDay", () => {
  it("keeps a well-formed day", () => {
    expect(normalizeDay("12.03.2025")).toBe("12.03.2025");
  });

  it("pads a loosely typed day so it matches stored dates", () => {
    expect(normalizeDay("1.2.2026")).toBe("01.02.2026");
  });

  it("rejects nonsense and impossible dates", () => {
    expect(normalizeDay("foo")).toBeNull();
    expect(normalizeDay("31.02.2026")).toBeNull();
    expect(normalizeDay("")).toBeNull();
    expect(normalizeDay(null)).toBeNull();
  });
});

describe("workdaysOfWeek", () => {
  it("returns Monday to Friday of the week containing the date", () => {
    let days = workdaysOfWeek(new Date(2025, 2, 12));

    expect(days.map(({ date }) => date.getDate())).toEqual([
      10, 11, 12, 13, 14,
    ]);
    expect(days[0].day).toBe("monday");
  });

  it("can step one week ahead", () => {
    let days = workdaysOfWeek(new Date(2025, 2, 12), 1);

    expect(days.map(({ date }) => date.getDate())).toEqual([
      17, 18, 19, 20, 21,
    ]);
  });
});

describe("defaultDay", () => {
  it("is today on a weekday", () => {
    expect(formatDate(defaultDay(new Date(2025, 2, 14, 10)))).toBe(
      "14.03.2025",
    );
  });

  it("is the coming Monday on a weekend", () => {
    expect(formatDate(defaultDay(new Date(2025, 2, 15, 10)))).toBe(
      "17.03.2025",
    );
    expect(formatDate(defaultDay(new Date(2025, 2, 16, 10)))).toBe(
      "17.03.2025",
    );
  });
});
