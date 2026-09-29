// @vitest-environment node
import { createCookie, RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { findUser, findDesk } = vi.hoisted(() => ({
  findUser: vi.fn(),
  findDesk: vi.fn(),
}));
vi.mock("./lib/db/drizzle.server", () => {
  const failing = () => Promise.reject(new Error("Test query failed"));
  return {
    db: {
      select: () => ({ from: failing }),
      $count: failing,
      query: {
        users: { findFirst: findUser },
        desks: { findFirst: findDesk },
      },
    },
  };
});

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

/** A loader's arguments for one request: its own context, like the server gives. */
function argsWithCookie(cookie = "", path = "/desks/1/edit") {
  return {
    request: requestWithCookie(cookie),
    params: {},
    context: new RouterContextProvider(),
    url: new URL(`https://desk.test${path}`),
    pattern: path,
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("SESSION_SECRET", testSecret);
  findUser.mockReset().mockResolvedValue({ ...databaseUser });
  findDesk.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("authentication cookie integrity", () => {
  it("rejects an unsigned legacy cookie claiming an admin role", async () => {
    const { requireUser } = await import("./cookies.server");
    const cookie = await createCookie("user").serialize({
      userId: "u00001",
      role: "admin",
    });
    await expect(requireUser(argsWithCookie(cookie))).rejects.toMatchObject({
      status: 302,
    });
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each(["userId", "role"])(
    "rejects tampering with %s in a signed cookie",
    async (field) => {
      const { createUserCookie, getUser } = await import("./cookies.server");
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
        await getUser(argsWithCookie(`user=${encodeURIComponent(modified)}`)),
      ).toBeNull();
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it("rejects a cookie signed with a different key", async () => {
    const { getUser } = await import("./cookies.server");
    const cookie = await createCookie("user", {
      secrets: ["another-test-only-key-with-32-characters"],
    }).serialize({
      userId: "u00001",
      expiresAt: Date.now() + 60_000,
    });
    expect(await getUser(argsWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each(["", "user=%ZZ", "user=not-base64", "user="])(
    "treats missing/malformed cookie %j as anonymous",
    async (cookie) => {
      const { getUser } = await import("./cookies.server");
      expect(await getUser(argsWithCookie(cookie))).toBeNull();
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
    const { userCookie, getUser } = await import("./cookies.server");
    const cookie = await userCookie.serialize(payload);
    expect(await getUser(argsWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });
});

describe("authenticated principal", () => {
  it("signs only identity and expiry and loads the current profile and role", async () => {
    const { createUserCookie, userCookie, requireUser } = await import(
      "./cookies.server"
    );
    const cookie = await createUserCookie("u00001");
    expect(await userCookie.parse(cookie)).toEqual({
      userId: "u00001",
      expiresAt: expect.any(Number),
    });
    expect(await requireUser(argsWithCookie(cookie))).toEqual({
      userId: "u00001",
      firstName: "Current",
      lastName: "Name",
      role: "user",
      desk: null,
    });
    expect(findUser).toHaveBeenCalledOnce();
  });

  it("ignores stale cookie roles and reflects an admin demotion immediately", async () => {
    const { userCookie, requireUser } = await import("./cookies.server");
    const cookie = await userCookie.serialize({
      userId: "u00001",
      role: "admin",
      expiresAt: Date.now() + 60_000,
    });
    findUser.mockResolvedValueOnce({ ...databaseUser, role: "admin" });
    expect((await requireUser(argsWithCookie(cookie))).role).toBe("admin");
    expect((await requireUser(argsWithCookie(cookie))).role).toBe("user");
  });

  it("rejects a deleted user and clears the cookie on the login redirect", async () => {
    const { createUserCookie, requireUser } = await import("./cookies.server");
    findUser.mockResolvedValue(undefined);
    const cookie = await createUserCookie("u00001");
    const response = await requireUser(argsWithCookie(cookie)).catch(
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
    const { createUserCookie, getUser } = await import("./cookies.server");
    const cookie = await createUserCookie("u00001");
    vi.setSystemTime(Date.now() + 14 * 24 * 60 * 60 * 1000 - 1);
    expect(await getUser(argsWithCookie(cookie))).toEqual(databaseUser);
    findUser.mockClear();
    vi.setSystemTime(Date.now() + 1);
    expect(await getUser(argsWithCookie(cookie))).toBeNull();
    expect(findUser).not.toHaveBeenCalled();
  });

  it("does not mask database failures as an authentication failure", async () => {
    const { createUserCookie, getUser } = await import("./cookies.server");
    findUser.mockRejectedValue(new Error("Test database unavailable"));
    const cookie = await createUserCookie("u00001");
    await expect(getUser(argsWithCookie(cookie))).rejects.toThrow(
      "Test database unavailable",
    );
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
    const { getUser } = await import("./cookies.server");
    const response = await action();
    expect(response.headers.get("Location")).toBe("/login");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("Max-Age=0");
    expect(await getUser(argsWithCookie(cookie))).toBeNull();
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
      await expect(
        loader({
          request: requestWithCookie(cookie),
          params: {},
          context: new RouterContextProvider(),
          url: new URL("https://desk.test/desks/1/edit"),
          pattern: "/desks/:id/edit",
        }),
      ).resolves.not.toBeInstanceOf(Response);
      expect(findUser).not.toHaveBeenCalled();
    },
  );

  it("employee login issues a signed expiring cookie usable by the guard", async () => {
    const { action } = await import("./routes/login");
    const { userCookie, requireUser } = await import("./cookies.server");
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
    expect((await requireUser(argsWithCookie(cookie))).role).toBe("user");
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

it("the admin action rejects a cookie role that disagrees with the database", async () => {
  const { action } = await import("./routes/admin");
  const { userCookie } = await import("./cookies.server");
  const cookie = await userCookie.serialize({
    userId: "u00001",
    role: "admin",
    expiresAt: Date.now() + 60_000,
  });
  const response = await action({
    request: requestWithCookie(cookie),
    params: {},
    context: new RouterContextProvider(),
    url: new URL("https://desk.test/admin"),
    pattern: "/admin",
  }).catch((thrown: unknown) => thrown);
  expect(response).toBeInstanceOf(Response);
  if (!(response instanceof Response))
    throw new Error("Expected unauthorized redirect");
  expect(response.headers.get("Location")).toBe("/");
  expect(findUser).toHaveBeenCalledOnce();
});

describe("one user read per request", () => {
  it("reads the user once for the root loader and the page's guards", async () => {
    const { createUserCookie, getUser, requireUser } = await import(
      "./cookies.server"
    );
    const { requireAdmin } = await import("./lib/admin.server");
    const { loader } = await import("./root");
    findUser.mockResolvedValue({ ...databaseUser, role: "admin" });
    const args = argsWithCookie(await createUserCookie("u00001"));

    await Promise.all([
      loader(args),
      requireUser(args),
      requireAdmin(args),
      getUser(args),
    ]);

    expect(findUser).toHaveBeenCalledOnce();
  });

  it("reads again for the next request, so a demotion shows at once", async () => {
    const { createUserCookie, requireUser } = await import("./cookies.server");
    const cookie = await createUserCookie("u00001");
    const first = argsWithCookie(cookie);
    findUser.mockResolvedValueOnce({ ...databaseUser, role: "admin" });
    expect((await requireUser(first)).role).toBe("admin");

    // Even should a context be handed a different request.
    const next = { ...argsWithCookie(cookie), context: first.context };
    expect((await requireUser(next)).role).toBe("user");
    expect(findUser).toHaveBeenCalledTimes(2);
  });

  it("reads fresh on a form post, which may change the user", async () => {
    const { createUserCookie, getUser } = await import("./cookies.server");
    const args = argsWithCookie(await createUserCookie("u00001"));
    const post = {
      ...args,
      request: new Request(args.request, { method: "POST" }),
    };
    await getUser(post);
    await getUser(post);
    expect(findUser).toHaveBeenCalledTimes(2);
  });

  it("names the cookie's user before the DB answers, and only a signed one", async () => {
    const { createUserCookie, claimedUserId } = await import(
      "./cookies.server"
    );
    expect(
      await claimedUserId(argsWithCookie(await createUserCookie("u00001"))),
    ).toBe("u00001");
    const forged = await createCookie("user").serialize({
      userId: "u00001",
      expiresAt: Date.now() + 60_000,
    });
    expect(await claimedUserId(argsWithCookie(forged))).toBeNull();
  });

  it("early() keeps a dropped query's failure for whoever awaits it", async () => {
    const { early } = await import("./cookies.server");
    const failing = early(Promise.reject(new Error("Test query failed")));
    await new Promise((resolve) => setTimeout(resolve));
    await expect(failing).rejects.toThrow("Test query failed");
  });
});

describe("page loaders start their query alongside the guard", () => {
  it("the admin loader still sends a non-admin away with its toast", async () => {
    const { loader } = await import("./routes/admin");
    const { createUserCookie } = await import("./cookies.server");
    const args = argsWithCookie(await createUserCookie("u00001"), "/admin");
    // The admin lists' query fails here (the mock has no findMany): the
    // redirect still wins, and the dropped failure is not unhandled.
    const response = await loader(args).catch((thrown: unknown) => thrown);
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected unauthorized redirect");
    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.get("Set-Cookie")).toContain("toast-session");
    expect(findUser).toHaveBeenCalledOnce();
  });

  it("the metrics loader sends a signed-out visitor to sign in", async () => {
    // Its query fails here too; the redirect still wins.
    const { loader } = await import("./routes/metrics");
    const response = await loader(argsWithCookie("", "/metrics")).catch(
      (thrown: unknown) => thrown,
    );
    expect(response).toBeInstanceOf(Response);
    if (!(response instanceof Response))
      throw new Error("Expected login redirect");
    expect(response.headers.get("Location")).toBe("/login");
  });

  it.each([
    ["someone else's profile to a non-admin", "user", "u00002", 403],
    ["a missing person to an admin", "admin", "u00002", 404],
  ])(
    "the profile loader refuses %s",
    async (_label, role, profileId, status) => {
      const { loader } = await import("./routes/users.edit.$id");
      const { createUserCookie } = await import("./cookies.server");
      findUser.mockImplementation(async ({ with: withDesk }) =>
        withDesk ? { ...databaseUser, role } : undefined,
      );
      const args = {
        ...argsWithCookie(
          await createUserCookie("u00001"),
          `/users/edit/${profileId}`,
        ),
        params: { id: profileId },
      };
      const thrown = await loader(args).catch((error: unknown) => error);
      expect(thrown).toMatchObject({ init: { status } });
    },
  );

  it("the profile loader shows your own profile", async () => {
    const { loader } = await import("./routes/users.edit.$id");
    const { createUserCookie } = await import("./cookies.server");
    const args = {
      ...argsWithCookie(await createUserCookie("u00001"), "/users/edit/u00001"),
      params: { id: "U00001" },
    };
    await expect(loader(args)).resolves.toMatchObject({
      user: { id: "u00001", firstName: "Current" },
      desk: null,
      isSelf: true,
    });
  });
});
