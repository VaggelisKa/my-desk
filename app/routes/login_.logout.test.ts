// @vitest-environment node
import { describe, expect, it } from "vitest";
import { action } from "./login_.logout";

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
