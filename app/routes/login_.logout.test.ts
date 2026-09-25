// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { action } from "./login_.logout";

vi.hoisted(() => {
  process.env.SESSION_SECRET = "test-only-session-secret-with-32-characters";
});
vi.mock("../lib/db/drizzle.server", () => ({ db: {} }));

describe("logout action", () => {
  it("clears the session and flags the login page to show the signed-out line", async () => {
    let response = (await action()) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.getSetCookie()).toEqual([
      expect.stringMatching(/^user=.*Max-Age=0/),
      expect.stringMatching(/^signed_out=.*Max-Age=60/),
    ]);
  });
});
