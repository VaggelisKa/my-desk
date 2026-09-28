import { describe, expect, it, vi } from "vitest";

vi.mock("~/lib/db/drizzle.server", () => ({ db: {} }));

const { checkNewPerson } = await import("~/lib/people.server");

describe("checkNewPerson", () => {
  it("trims what was typed and stores the ID lowercase", () => {
    expect(
      checkNewPerson({ id: " G12345 ", firstName: " Jane ", lastName: "Doe " }),
    ).toEqual({
      person: { id: "g12345", firstName: "Jane", lastName: "Doe" },
      errors: null,
    });
  });

  it("keeps an ID that holds @", () => {
    expect(
      checkNewPerson({ id: "a@bcde", firstName: "A", lastName: "B" }).errors,
    ).toBeNull();
  });

  it("names every field that is missing", () => {
    expect(
      checkNewPerson({ id: "", firstName: " ", lastName: "" }).errors,
    ).toEqual({
      id: "User ID is required",
      firstName: "First name is required",
      lastName: "Last name is required",
    });
  });

  it("refuses an ID sign-in could never take", () => {
    for (let id of ["abc", "g1234567"]) {
      expect(
        checkNewPerson({ id, firstName: "Jane", lastName: "Doe" }).errors,
      ).toEqual({ id: "User ID must be 6 characters" });
    }
  });
});
