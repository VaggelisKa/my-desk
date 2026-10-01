// @vitest-environment node
import { createCookie, RouterContextProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** A query result that also takes drizzle's `.where()` and `.orderBy()`. */
function query(result: Promise<unknown>) {
  const chain = Object.assign(result, {
    where: () => chain,
    orderBy: () => chain,
  });
  return chain;
}
const emptyQuery = () => query(Promise.resolve([]));
const failingQuery = () =>
  query(Promise.reject(new Error("Test query failed")));

// Every query a page loader makes, apart from the user and the profile's desk.
const { findUser, findDesk, pageQuery } = vi.hoisted(() => ({
  findUser: vi.fn(),
  findDesk: vi.fn(),
  pageQuery: vi.fn(),
}));
vi.mock("./lib/db/drizzle.server", () => ({
  db: {
    select: () => ({ from: pageQuery }),
    $count: pageQuery,
    query: {
      users: { findFirst: findUser, findMany: pageQuery },
      desks: { findFirst: findDesk, findMany: pageQuery },
      reservations: { findMany: pageQuery },
    },
  },
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
  pageQuery.mockReset().mockImplementation(emptyQuery);
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

  it("names a signed cookie's user without the DB, and sends anyone else to sign in", async () => {
    const { createUserCookie, requireSessionCookie } = await import(
      "./cookies.server"
    );
    expect(
      await requireSessionCookie(
        argsWithCookie(await createUserCookie("u00001")),
      ),
    ).toBe("u00001");
    const forged = await createCookie("user").serialize({
      userId: "u00001",
      expiresAt: Date.now() + 60_000,
    });
    const thrown = await requireSessionCookie(argsWithCookie(forged)).catch(
      (error: unknown) => error,
    );
    expect(thrown).toBeInstanceOf(Response);
    if (!(thrown instanceof Response))
      throw new Error("Expected login redirect");
    expect(thrown.headers.get("Location")).toBe("/login");
    expect(thrown.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(findUser).not.toHaveBeenCalled();
  });

  it("early() logs a dropped query's failure and keeps it for whoever awaits it", async () => {
    const { early } = await import("./cookies.server");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = early(Promise.reject(new Error("Test query failed")));
    await new Promise((resolve) => setTimeout(resolve));
    expect(log).toHaveBeenCalledWith(
      expect.stringContaining("sign-in check"),
      expect.objectContaining({ message: "Test query failed" }),
    );
    await expect(failing).rejects.toThrow("Test query failed");
  });
});

/** Runs a page loader and hands back what it threw, which must be a Response. */
async function thrownBy(loader: () => Promise<unknown>) {
  const thrown = await loader().then(
    (result) => ({ returned: result }),
    (error: unknown) => error,
  );
  expect(thrown).toBeInstanceOf(Response);
  if (!(thrown instanceof Response)) throw new Error("Expected a Response");
  return thrown;
}

const pages = {
  "/": () => import("./routes/_index"),
  "/metrics": () => import("./routes/metrics"),
  "/admin": () => import("./routes/admin"),
  "/bookings": () => import("./routes/bookings._index"),
  "/users/edit/u00002": () => import("./routes/users.edit.$id"),
};

describe("page loaders start their query alongside the guard", () => {
  it.each(
    Object.keys(pages).flatMap((path) => [
      [path, "no cookie"],
      [path, "a garbage cookie"],
      [path, "a forged cookie"],
    ]),
  )("%s with %s redirects to sign in without any query", async (path, kind) => {
    const cookie =
      kind === "no cookie"
        ? ""
        : kind === "a garbage cookie"
          ? "user=not-base64"
          : await createCookie("user").serialize({
              userId: "u00001",
              expiresAt: Date.now() + 60_000,
            });
    const { loader } = await pages[path as keyof typeof pages]();
    const args = { ...argsWithCookie(cookie, path), params: { id: "u00002" } };
    const response = await thrownBy(() => loader(args));

    expect(response.headers.get("Location")).toBe("/login");
    expect(pageQuery).not.toHaveBeenCalled();
    expect(findDesk).not.toHaveBeenCalled();
    expect(findUser).not.toHaveBeenCalled();
  });

  it.each(["/", "/metrics", "/bookings"] as const)(
    "%s with a signed cookie for a deleted user redirects and returns nothing",
    async (path) => {
      const { createUserCookie } = await import("./cookies.server");
      const { loader } = await pages[path]();
      findUser.mockResolvedValue(undefined);
      const args = argsWithCookie(await createUserCookie("u00001"), path);
      const response = await thrownBy(() => loader(args));

      expect(response.headers.get("Location")).toBe("/login");
      // It did start, alongside the check.
      expect(pageQuery).toHaveBeenCalled();
    },
  );

  it("a failing early query while the guard redirects is logged, not unhandled", async () => {
    const { createUserCookie } = await import("./cookies.server");
    const { loader } = await import("./routes/metrics");
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    findUser.mockResolvedValue(undefined);
    pageQuery.mockImplementation(failingQuery);
    const args = argsWithCookie(await createUserCookie("u00001"), "/metrics");

    try {
      const response = await thrownBy(() => loader(args));
      expect(response.headers.get("Location")).toBe("/login");
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(unhandled).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining("sign-in check"),
        expect.objectContaining({ message: "Test query failed" }),
      );
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("the admin loader still sends a non-admin away with its toast", async () => {
    const { loader } = await import("./routes/admin");
    const { createUserCookie } = await import("./cookies.server");
    const args = argsWithCookie(await createUserCookie("u00001"), "/admin");
    const response = await thrownBy(() => loader(args));

    expect(response.headers.get("Location")).toBe("/");
    expect(response.headers.get("Set-Cookie")).toContain("toast-session");
    expect(findUser).toHaveBeenCalledOnce();
  });

  it.each([
    ["someone else's profile to a non-admin", "user", 403],
    ["a missing person to an admin", "admin", 404],
  ])("the profile loader refuses %s", async (_label, role, status) => {
    const { loader } = await import("./routes/users.edit.$id");
    const { createUserCookie } = await import("./cookies.server");
    findUser.mockImplementation(async ({ with: withDesk }) =>
      withDesk ? { ...databaseUser, role } : undefined,
    );
    const args = {
      ...argsWithCookie(await createUserCookie("u00001"), "/users/edit/u00002"),
      params: { id: "u00002" },
    };
    const thrown = await loader(args).catch((error: unknown) => error);
    expect(thrown).toMatchObject({ init: { status } });
    // Someone else's profile is only read once the role allows it.
    expect(findDesk).toHaveBeenCalledTimes(role === "admin" ? 1 : 0);
  });

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
