// @vitest-environment node
import { createCookie, RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUser } = vi.hoisted(() => ({ findUser: vi.fn() }));
vi.mock("./lib/db/drizzle.server", () => ({
  db: { query: { users: { findFirst: findUser } } },
}));

const testSecret = "test-only-session-secret-with-32-characters";
const databaseUser = {
  id: "u00001",
  firstName: "Current",
  lastName: "Name",
  role: "user",
  autoReservationsCronId: null,
  desk: null,
};

function requestWithCookie(cookie = "") {
  return new Request("https://desk.test/desks/1/edit", {
    headers: { Cookie: cookie.split(";")[0] },
  });
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", testSecret);
  findUser.mockReset().mockResolvedValue({ ...databaseUser });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("authentication cookie integrity", () => {
  it("rejects an unsigned legacy cookie claiming an admin role", async () => {
    const { requireAuthCookie } = await import("./cookies.server");
    const cookie = await createCookie("user").serialize({
      userId: "u00001",
      role: "admin",
    });
    await expect(
      requireAuthCookie(requestWithCookie(cookie)),
    ).rejects.toMatchObject({
      status: 302,
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each(["userId", "role"])(
    "rejects tampering with %s in a signed cookie",
    async (field) => {
      const { createUserCookie, getAuthenticatedUser } = await import(
        "./cookies.server"
      );
      const cookie = await createUserCookie("u00001");
      const encoded = decodeURIComponent(
        cookie.split(";")[0].slice("user=".length),
      );
      const separator = encoded.lastIndexOf(".");
      const payload = JSON.parse(
        Buffer.from(encoded.slice(0, separator), "base64").toString(),
      );
      payload[field] = field === "role" ? "admin" : "u00002";
      const modified =
        Buffer.from(JSON.stringify(payload)).toString("base64") +
        encoded.slice(separator);

      expect(
        await getAuthenticatedUser(
          requestWithCookie(`user=${encodeURIComponent(modified)}`),
        ),
      ).toBeNull();
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it("rejects a cookie signed with a different key", async () => {
    const { getAuthenticatedUser } = await import("./cookies.server");
    const cookie = await createCookie("user", {
      secrets: ["another-test-only-key-with-32-characters"],
    }).serialize({
      userId: "u00001",
      expiresAt: Date.now() + 60_000,
    });
    expect(await getAuthenticatedUser(requestWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each(["", "user=%ZZ", "user=not-base64", "user="])(
    "treats missing/malformed cookie %j as anonymous",
    async (cookie) => {
      const { getAuthenticatedUser } = await import("./cookies.server");
      expect(await getAuthenticatedUser(requestWithCookie(cookie))).toBeNull();
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    "",
    {},
    { userId: 123, expiresAt: 9999999999999 },
    { userId: "u00001" },
  ])("rejects a signed invalid payload %j", async (payload) => {
    const { userCookie, getAuthenticatedUser } = await import(
      "./cookies.server"
    );
    const cookie = await userCookie.serialize(payload);
    expect(await getAuthenticatedUser(requestWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });
});

describe("authenticated principal", () => {
  it("signs only identity and expiry and loads the current profile and role", async () => {
    const { createUserCookie, userCookie, requireAuthCookie } = await import(
      "./cookies.server"
    );
    const cookie = await createUserCookie("u00001");
    expect(await userCookie.parse(cookie)).toEqual({
      userId: "u00001",
      expiresAt: expect.any(Number),
    });
    expect(await requireAuthCookie(requestWithCookie(cookie))).toEqual({
      userId: "u00001",
      firstName: "Current",
      lastName: "Name",
      role: "user",
    });
    expect(findUser).toHaveBeenCalledOnce();
  });

  it("ignores stale cookie roles and reflects an admin demotion immediately", async () => {
    const { userCookie, requireAuthCookie } = await import(
      "./cookies.server"
    );
    const cookie = await userCookie.serialize({
      userId: "u00001",
      role: "admin",
      expiresAt: Date.now() + 60_000,
    });
    findUser.mockResolvedValueOnce({ ...databaseUser, role: "admin" });
    expect((await requireAuthCookie(requestWithCookie(cookie))).role).toBe(
      "admin",
    );
    expect((await requireAuthCookie(requestWithCookie(cookie))).role).toBe(
      "user",
    );
  });

  it("rejects a deleted user and clears the cookie on the login redirect", async () => {
    const { createUserCookie, requireAuthCookie } = await import(
      "./cookies.server"
    );
    findUser.mockResolvedValue(undefined);
    const cookie = await createUserCookie("u00001");
    const response = await requireAuthCookie(requestWithCookie(cookie)).catch(
      (error: unknown) => error,
    );
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected redirect response");
    expect(response.headers.get("Location")).toBe("/login");
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("enforces expiry server-side even when the client replays the cookie", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T10:00:00Z"));
    const { createUserCookie, getAuthenticatedUser } = await import(
      "./cookies.server"
    );
    const cookie = await createUserCookie("u00001");
    vi.setSystemTime(Date.now() + 14 * 24 * 60 * 60 * 1000 - 1);
    expect(await getAuthenticatedUser(requestWithCookie(cookie))).toEqual(
      databaseUser,
    );
    findUser.mockClear();
    vi.setSystemTime(Date.now() + 1);
    expect(await getAuthenticatedUser(requestWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it("does not mask database failures as an authentication failure", async () => {
    const { createUserCookie, getAuthenticatedUser } = await import(
      "./cookies.server"
    );
    findUser.mockRejectedValue(new Error("Test database unavailable"));
    const cookie = await createUserCookie("u00001");
    await expect(
      getAuthenticatedUser(requestWithCookie(cookie)),
    ).rejects.toThrow("Test database unavailable");
  });
});

describe("configuration and logout", () => {
  it.each([undefined, "", "too-short", " ".repeat(40)])(
    "fails closed for an invalid SESSION_SECRET",
    async (secret) => {
      vi.stubEnv("SESSION_SECRET", secret);
      await expect(import("./cookies.server")).rejects.toThrow(
        "SESSION_SECRET must contain at least 32 characters",
      );
    },
  );

  it("retains the production cookie security attributes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { createUserCookie } = await import("./cookies.server");
    const cookie = await createUserCookie("u00001");
    for (const attribute of [
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Path=/",
      "Max-Age=1209600",
    ]) {
      expect(cookie).toContain(attribute);
    }
  });

  it("clears the cookie on logout and rejects that cleared value", async () => {
    const { action } = await import("./routes/login_.logout");
    const { getAuthenticatedUser } = await import("./cookies.server");
    const response = await action();
    expect(response.headers.get("Location")).toBe("/login");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("Max-Age=0");
    expect(await getAuthenticatedUser(requestWithCookie(cookie))).toBeNull();
  });
});

describe("route integration", () => {
  it.each(["employee", "guest"])(
    "does not redirect a forged cookie away from the %s login form",
    async (kind) => {
      const { loader } =
        kind === "employee"
          ? await import("./routes/login")
          : await import("./routes/login_.guest");
      const cookie = await createCookie("user").serialize({
        userId: "u00001",
        role: "admin",
      });
      expect(
        await loader({
          request: requestWithCookie(cookie),
          params: {},
          context: new RouterContextProvider(),
          url: new URL("https://desk.test/desks/1/edit"),
          pattern: "/desks/:id/edit",
        }),
      ).toBeNull();
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it("employee login issues a signed expiring cookie usable by the guard", async () => {
    const { action } = await import("./routes/login");
    const { userCookie, requireAuthCookie } = await import(
      "./cookies.server"
    );
    const response = await action({
      request: new Request("https://desk.test/login", {
        method: "POST",
        body: new URLSearchParams({ "user-id": "u00001" }),
      }),
      params: {},
      context: new RouterContextProvider(),
      url: new URL("https://desk.test/desks/1/edit"),
      pattern: "/desks/:id/edit",
    });
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected login redirect");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(await userCookie.parse(cookie)).toEqual({
      userId: "u00001",
      expiresAt: expect.any(Number),
    });
    expect((await requireAuthCookie(requestWithCookie(cookie))).role).toBe(
      "user",
    );
  });
});

it("the root loader exposes no user data for an unsigned cookie", async () => {
  const { loader } = await import("./root");
  const cookie = await createCookie("user").serialize({ userId: "u00001" });
  const result = await loader({
    request: requestWithCookie(cookie),
    params: {},
    context: new RouterContextProvider(),
    url: new URL("https://desk.test/desks/1/edit"),
    pattern: "/desks/:id/edit",
  });
  expect(result.data.user).toBeNull();
  expect(findUser).not.toHaveBeenCalled();
});

it("the admin desk action rejects a cookie role that disagrees with the database", async () => {
  const { action } = await import("./routes/desks.$id.edit");
  const { userCookie } = await import("./cookies.server");
  const cookie = await userCookie.serialize({
    userId: "u00001",
    role: "admin",
    expiresAt: Date.now() + 60_000,
  });
  const response = await action({
    request: requestWithCookie(cookie),
    params: { id: "1" },
    context: new RouterContextProvider(),
    url: new URL("https://desk.test/desks/1/edit"),
    pattern: "/desks/:id/edit",
  });
  expect(response).toBeInstanceOf(Response);
  if (!(response instanceof Response))
    throw new Error("Expected unauthorized redirect");
  expect(response.headers.get("Location")).toBe("/");
  expect(findUser).toHaveBeenCalledOnce();
});
