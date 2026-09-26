import { describe, expect, it } from "vitest";
import {
  defaultDay,
  formatDate,
  isOpenForBooking,
  normalizeDay,
  officeNow,
  workdaysOfWeek,
} from "./dates";

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

describe("officeNow", () => {
  it("reads the time in Copenhagen whatever the server's timezone", () => {
    // 23:30 UTC on 30 Sep is already 01:30 on 1 Oct in Copenhagen (CEST).
    let now = officeNow(new Date(Date.UTC(2026, 8, 30, 23, 30)));

    expect(formatDate(now)).toBe("01.10.2026");
    expect(now.getHours()).toBe(1);
    expect(now.getMinutes()).toBe(30);
  });
});

describe("isOpenForBooking", () => {
  // Wednesday 30 Sep 2026.
  let at = (hour: number) => new Date(2026, 8, 30, hour);
  let day = (d: number, m = 9) => new Date(2026, m, d);

  it("takes the rest of this week and all of next week", () => {
    expect(isOpenForBooking(day(1), at(9))).toBe(true); // Thu 1 Oct
    expect(isOpenForBooking(day(5), at(9))).toBe(true); // Mon 5 Oct
    expect(isOpenForBooking(day(9), at(9))).toBe(true); // Fri 9 Oct
  });

  it("refuses the past, weekends and anything beyond next week", () => {
    expect(isOpenForBooking(day(29, 8), at(9))).toBe(false); // yesterday
    expect(isOpenForBooking(day(3), at(9))).toBe(false); // Saturday
    expect(isOpenForBooking(day(12), at(9))).toBe(false); // Mon 12 Oct
    expect(isOpenForBooking(day(14), at(9))).toBe(false);
  });

  it("closes today at 11:00", () => {
    expect(isOpenForBooking(day(30, 8), at(10))).toBe(true);
    expect(isOpenForBooking(day(30, 8), at(11))).toBe(false);
  });

  it("starts from the coming week on a Saturday", () => {
    let saturday = new Date(2026, 9, 3, 9);

    expect(isOpenForBooking(day(5), saturday)).toBe(true);
    expect(isOpenForBooking(day(16), saturday)).toBe(true); // Fri 16 Oct
    expect(isOpenForBooking(day(19), saturday)).toBe(false);
  });

  it("counts across New Year by date", () => {
    // Mon 21 Dec 2026 to Fri 1 Jan 2027.
    expect(
      isOpenForBooking(new Date(2027, 0, 1), new Date(2026, 11, 21, 9)),
    ).toBe(true);
  });
});
