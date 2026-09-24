// @vitest-environment node
import { describe, expect, it } from "vitest";
import { requireAuthCookie, userCookie } from "./cookies.server";

async function requestWithUser(user: unknown) {
  let cookie = await userCookie.serialize(user);
  return new Request("http://localhost/", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

async function catchThrown(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected promise to throw");
}

describe("requireAuthCookie", () => {
  it("returns the user stored in the cookie", async () => {
    let user = { userId: "user-1", firstName: "Jane", role: "admin" };

    await expect(
      requireAuthCookie(await requestWithUser(user)),
    ).resolves.toEqual(user);
  });

  it("redirects to /login and clears the cookie when there is no cookie", async () => {
    let thrown = await catchThrown(
      requireAuthCookie(new Request("http://localhost/")),
    );

    expect(thrown).toBeInstanceOf(Response);
    let response = thrown as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie")).toMatch(/^user=.*Max-Age=0/);
  });

  it("redirects when the cookie has no user id", async () => {
    let thrown = await catchThrown(
      requireAuthCookie(await requestWithUser({ firstName: "Jane" })),
    );

    expect((thrown as Response).headers.get("Location")).toBe("/login");
  });
});
