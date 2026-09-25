import { describe, expect, it } from "vitest";
import { normalizeDay, workdaysOfWeek } from "./dates";

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
