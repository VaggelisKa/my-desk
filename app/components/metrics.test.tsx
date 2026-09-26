import { describe, expect, it } from "vitest";
import { bookingsBy, busiestDays, summarise } from "~/lib/metrics";

function row(date: Date, bookings: number, guestBookings = 0) {
  return {
    date,
    bookings,
    guestBookings,
    officeParticipationPct: Math.round((bookings / 33) * 100),
  };
}

// Friday 25 September 2026
let now = new Date(2026, 8, 25, 12);

describe("summarise", () => {
  it("compares this month so far with last month by the same date", () => {
    let s = summarise(
      [
        row(new Date(2026, 7, 3), 10),
        row(new Date(2026, 7, 28), 50), // after the 25th, left out
        row(new Date(2026, 8, 1), 6),
        row(new Date(2026, 8, 2), 6),
      ],
      now,
    );

    expect(s.total).toBe(12);
    expect(s.totalChange).toBe(20);
    expect(s.perDay).toBe(6);
    expect(s.monthName).toBe("September");
    expect(s.lastMonthName).toBe("August");
  });

  it("has nothing to compare with when last month is empty", () => {
    expect(summarise([row(new Date(2026, 8, 1), 6)], now).totalChange).toBe(
      null,
    );
  });
});

describe("busiestDays", () => {
  it("averages each weekday over the last eight weeks", () => {
    let days = summarise(
      [
        row(new Date(2026, 8, 21), 10), // Monday
        row(new Date(2026, 8, 14), 20), // Monday
        row(new Date(2026, 8, 23), 25), // Wednesday
        row(new Date(2026, 5, 1), 99), // Monday, too long ago
      ],
      now,
    ).days;

    let weekdays = busiestDays(days, now);

    expect(weekdays.map((w) => w.name)).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
    ]);
    expect(weekdays[0].bookings).toBe(15);
    expect(weekdays[1].bookings).toBe(0);
    expect(weekdays[2].bookings).toBe(25);
  });
});

describe("bookingsBy", () => {
  let days = summarise(
    [
      row(new Date(2026, 7, 31), 10, 2), // Monday
      row(new Date(2026, 8, 4), 8, 1), // Friday, same week
      row(new Date(2026, 8, 7), 5, 0), // next Monday
    ],
    now,
  ).days;

  it("groups weeks from Monday and splits out guests", () => {
    expect(bookingsBy("weeks", days)).toEqual([
      { start: new Date(2026, 7, 31).getTime(), own: 15, guests: 3, total: 18 },
      { start: new Date(2026, 8, 7).getTime(), own: 5, guests: 0, total: 5 },
    ]);
  });

  it("groups by calendar month", () => {
    expect(bookingsBy("months", days).map((m) => m.total)).toEqual([10, 13]);
  });
});
