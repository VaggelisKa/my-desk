import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/db/drizzle.server", () => ({ db: {} }));

const { fullDays, pickedBookings } = await import("~/lib/bookings.server");

function form(...bookings: string[]) {
  let data = new FormData();
  for (let booking of bookings) data.append("booking", booking);
  return data;
}

describe("pickedBookings", () => {
  it("reads desk, day and person from each key, without repeats", () => {
    expect(
      pickedBookings(form("1@28.09.2026@G12345", "1@28.09.2026@G12345")),
    ).toEqual([{ deskId: 1, date: "28.09.2026", userId: "G12345" }]);
  });

  it("keeps a user ID that holds @ whole", () => {
    expect(pickedBookings(form("1@28.09.2026@a@bcde"))).toEqual([
      { deskId: 1, date: "28.09.2026", userId: "a@bcde" },
    ]);
  });

  it("takes as many as Admin can select", () => {
    let keys = Array.from({ length: 300 }, (_, i) => `${i + 1}@28.09.2026@u`);
    expect(pickedBookings(form(...keys))).toHaveLength(300);
  });

  it("is null when nothing usable is named", () => {
    expect(pickedBookings(form())).toBeNull();
    expect(
      pickedBookings(form("x@28.09.2026@u", "1@@u", "1@28.09.2026@")),
    ).toBeNull();
  });
});

describe("fullDays", () => {
  it("is full once someone holds two desks that day", () => {
    let booked = ["28.09.2026", "28.09.2026", "29.09.2026"];
    expect(fullDays(booked, ["28.09.2026", "29.09.2026"])).toEqual([
      "28.09.2026",
    ]);
  });

  it("has room on days with fewer bookings", () => {
    expect(fullDays([], ["28.09.2026"])).toEqual([]);
    expect(fullDays(["28.09.2026"], ["28.09.2026"])).toEqual([]);
  });
});
