import type { APIRequestContext, Page } from "@playwright/test";
import { format } from "date-fns";
import { createHash, randomBytes } from "node:crypto";
import { expect, test } from "./fixtures";
import { gotoHydrated } from "./pages/hydration";
import { bookingDay, desks, users, type Weekday } from "./support/db";

// The MCP server Claude and ChatGPT connect to, spoken to the way they do:
// OAuth sign-in, then JSON-RPC tool calls over HTTP.

function iso(day: Weekday, weekOffset: 0 | 1 = 0) {
  return format(bookingDay(day, weekOffset).dateTimestamp, "yyyy-MM-dd");
}

let id = 0;

async function rpc(
  request: APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  let response = await request.post("/mcp", {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: ++id, method, params },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).result;
}

async function callTool(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown> = {},
) {
  return rpc(request, token, "tools/call", { name, arguments: args });
}

/**
 * Presses Allow or Cancel and returns where the authorize page sends the
 * browser back to. The answer is read from the form post's redirect, and the
 * browser is never sent on to the assistant's callback (a localhost port
 * nothing listens on), so the test doesn't depend on how a browser treats
 * that hop.
 */
async function answer(page: Page, button: "Allow" | "Cancel") {
  let location = new Promise<URL>((resolve, reject) => {
    void page.route("**/oauth/authorize?**", async (route) => {
      if (route.request().method() !== "POST") {
        return route.fallback();
      }
      try {
        let response = await route.fetch({ maxRedirects: 0 });
        resolve(new URL(response.headers().location));
        await route.fulfill({ body: "ok" });
      } catch (error) {
        reject(error);
        await route.abort();
      }
    });
  });

  let [back] = await Promise.all([
    location,
    page.getByRole("button", { name: button }).click(),
  ]);
  return back;
}

test.describe("connecting", () => {
  test("without a token, /mcp points the assistant at sign-in", async ({
    request,
  }) => {
    let response = await request.post("/mcp", {
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });

    expect(response.status()).toBe(401);
    expect(response.headers()["www-authenticate"]).toContain(
      "/.well-known/oauth-protected-resource/mcp",
    );

    let resource = await (
      await request.get("/.well-known/oauth-protected-resource/mcp")
    ).json();
    expect(resource.resource).toMatch(/\/mcp$/);

    let server = await (
      await request.get("/.well-known/oauth-authorization-server")
    ).json();
    expect(server.authorization_endpoint).toMatch(/\/oauth\/authorize$/);
    expect(server.code_challenge_methods_supported).toEqual(["S256"]);
  });

  test("registering refuses redirects outside Claude, ChatGPT and localhost", async ({
    request,
  }) => {
    let response = await request.post("/oauth/register", {
      data: { redirect_uris: ["https://evil.example/callback"] },
    });

    expect(response.status()).toBe(400);
    expect((await response.json()).error).toBe("invalid_redirect_uri");
  });

  test("registering refuses overlong redirect URIs", async ({ request }) => {
    let response = await request.post("/oauth/register", {
      data: {
        redirect_uris: [`https://claude.ai/callback?x=${"a".repeat(3000)}`],
      },
    });

    expect(response.status()).toBe(400);
  });

  test("the sign-in form refuses posts from other sites", async ({
    request,
  }) => {
    let response = await request.post(
      "/oauth/authorize?client_id=x&redirect_uri=y",
      {
        form: { intent: "sign-in", "user-id": users.alice.id },
        headers: { "Sec-Fetch-Site": "cross-site" },
        maxRedirects: 0,
      },
    );

    expect(response.status()).toBe(403);
    expect(response.headers()["set-cookie"] ?? "").not.toContain("user=");
  });

  test("sign in, Allow, and the token books as that person", async ({
    page,
    request,
    db,
  }) => {
    let callback = "http://localhost:9999/callback";
    let client = await (
      await request.post("/oauth/register", {
        data: {
          client_name: "Claude",
          redirect_uris: [callback],
          token_endpoint_auth_method: "none",
        },
      })
    ).json();
    let verifier = randomBytes(32).toString("base64url");
    let challenge = createHash("sha256").update(verifier).digest("base64url");

    let authorize = new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback,
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: "xyz",
      scope: "desks",
    });

    await gotoHydrated(page, `/oauth/authorize?${authorize}`);
    await expect(
      page.getByRole("heading", { name: "Sign in to connect" }),
    ).toBeVisible();
    await page.getByLabel("User ID").fill(users.alice.id);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(
      page.getByRole("heading", { name: "Allow Claude?" }),
    ).toBeVisible();
    let back = await answer(page, "Allow");
    expect(back.searchParams.get("state")).toBe("xyz");
    let code = back.searchParams.get("code")!;

    // A wrong verifier gets nothing, and uses up the code.
    let token = async (codeVerifier: string) =>
      request.post("/oauth/token", {
        form: {
          grant_type: "authorization_code",
          code,
          redirect_uri: callback,
          client_id: client.client_id,
          code_verifier: codeVerifier,
        },
      });
    let tokens = await (await token(verifier)).json();
    expect(tokens.token_type).toBe("Bearer");
    expect((await token(verifier)).status()).toBe(400);

    let booked = await callTool(request, tokens.access_token, "book_desk", {
      dates: [iso("tuesday")],
    });
    expect(booked.isError).toBeFalsy();
    expect(await db.reservation(desks.alice.id, "tuesday")).toMatchObject({
      userId: users.alice.id,
    });

    // Refreshing rotates: the old refresh token works once.
    let refresh = () =>
      request.post("/oauth/token", {
        form: {
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          client_id: client.client_id,
        },
      });
    let rotated = await (await refresh()).json();
    expect(rotated.refresh_token).toBeTruthy();

    // A replay right after its use is the assistant retrying: refused, but
    // the connection stays.
    expect((await refresh()).status()).toBe(400);
    let tools = () =>
      request.post("/mcp", {
        headers: {
          Authorization: `Bearer ${rotated.access_token}`,
          Accept: "application/json, text/event-stream",
          "Content-Type": "application/json",
        },
        data: { jsonrpc: "2.0", id: ++id, method: "tools/list", params: {} },
      });
    expect((await tools()).status()).toBe(200);

    // Later, a replay means someone else has it: the connection ends.
    await db.backdateRefreshUse(60 * 1000);
    expect((await refresh()).status()).toBe(400);
    expect((await tools()).status()).toBe(401);
  });

  test("Cancel sends the assistant away without a code", async ({
    page,
    request,
  }) => {
    let callback = "http://localhost:9999/callback";
    let client = await (
      await request.post("/oauth/register", {
        data: { redirect_uris: [callback], token_endpoint_auth_method: "none" },
      })
    ).json();

    await gotoHydrated(
      page,
      `/oauth/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: callback,
        code_challenge: "a".repeat(43),
        code_challenge_method: "S256",
      })}`,
    );
    await page.getByLabel("User ID").fill(users.bob.id);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: /^Allow .+\?$/ }),
    ).toBeVisible();
    // Only Admins are offered the Admin actions.
    await expect(page.getByLabel("Also allow Admin actions")).toHaveCount(0);
    let back = await answer(page, "Cancel");
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.has("code")).toBe(false);
  });
});

test("an Admin who ticks Admin actions gets the admin tools", async ({
  page,
  request,
}) => {
  let callback = "http://localhost:9999/callback";
  let client = await (
    await request.post("/oauth/register", {
      data: {
        client_name: "Claude",
        redirect_uris: [callback],
        token_endpoint_auth_method: "none",
      },
    })
  ).json();
  let verifier = randomBytes(32).toString("base64url");

  await gotoHydrated(
    page,
    `/oauth/authorize?${new URLSearchParams({
      response_type: "code",
      client_id: client.client_id,
      redirect_uri: callback,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      scope: "desks admin",
    })}`,
  );
  await page.getByLabel("User ID").fill(users.admin.id);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Off until the Admin ticks it, whatever the assistant asked for.
  let admin = page.getByLabel("Also allow Admin actions");
  await expect(admin).not.toBeChecked();
  await admin.check();
  let back = await answer(page, "Allow");

  let tokens = await (
    await request.post("/oauth/token", {
      form: {
        grant_type: "authorization_code",
        code: back.searchParams.get("code")!,
        redirect_uri: callback,
        client_id: client.client_id,
        code_verifier: verifier,
      },
    })
  ).json();
  expect(tokens.scope).toBe("desks admin");

  let { tools } = await rpc(request, tokens.access_token, "tools/list");
  expect(tools.map((tool: { name: string }) => tool.name)).toContain(
    "admin_assign_desk",
  );

  // A refreshed token keeps the scope.
  let refreshed = await (
    await request.post("/oauth/token", {
      form: {
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
        client_id: client.client_id,
      },
    })
  ).json();
  expect(refreshed.scope).toBe("desks admin");
});

test.describe("tools", () => {
  test("initialize names the server and how to use it", async ({
    request,
    db,
  }) => {
    let token = await db.addMcpToken("alice");
    let result = await rpc(request, token, "initialize", {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });

    expect(result.serverInfo.name).toBe("mydesk");
    expect(result.capabilities.tools).toBeTruthy();
    expect(result.instructions).toContain("YYYY-MM-DD");
  });

  test("lists five tools, reads marked read-only and cancel destructive", async ({
    request,
    db,
  }) => {
    let token = await db.addMcpToken("alice");
    let { tools } = await rpc(request, token, "tools/list");
    let byName = Object.fromEntries(
      tools.map((tool: { name: string }) => [tool.name, tool]),
    );

    expect(Object.keys(byName).sort()).toEqual([
      "book_desk",
      "cancel_bookings",
      "get_me",
      "list_desks",
      "list_my_bookings",
    ]);
    for (let name of ["get_me", "list_desks", "list_my_bookings"]) {
      expect(byName[name].annotations.readOnlyHint).toBe(true);
    }
    expect(byName.cancel_bookings.annotations.destructiveHint).toBe(true);
    expect(byName.book_desk.annotations.readOnlyHint).toBe(false);
  });

  test("get_me knows who is calling and the office's today", async ({
    request,
    db,
  }) => {
    let token = await db.addMcpToken("alice");
    let me = (await callTool(request, token, "get_me")).structuredContent;

    expect(me).toMatchObject({
      user_id: users.alice.id,
      name: "Alice Andersen",
      desk: { desk_id: desks.alice.id, label: "1.1.1" },
      today: { date: iso("monday"), weekday: "Monday" },
    });
    // The server clock starts at 08:00 and runs on during the suite.
    expect(me.today.time).toMatch(/^08:\d\d$/);
  });

  test("list_desks shows who is in and what the caller can book", async ({
    request,
    db,
  }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "monday",
    });
    let token = await db.addMcpToken("alice");
    let { structuredContent: today } = await callTool(
      request,
      token,
      "list_desks",
    );

    let desk = (deskId: number) =>
      today.desks.find((d: { desk_id: number }) => d.desk_id === deskId);
    expect(today.date).toBe(iso("monday"));
    expect(desk(desks.bob.id)).toMatchObject({
      owner: "Bob Berg",
      booked_by: [{ name: "Bob Berg", is_you: false }],
      you_can_book: false,
    });
    expect(desk(desks.unclaimed.id).you_can_book).toBe(true);
    expect(desk(desks.alice.id)).toMatchObject({
      is_yours: true,
      you_can_book: true,
    });

    // Someone else's desk only for today.
    let { structuredContent: tuesday } = await callTool(
      request,
      token,
      "list_desks",
      { date: iso("tuesday"), only_free: true },
    );
    let free = tuesday.desks.map((d: { desk_id: number }) => d.desk_id);
    expect(free).toContain(desks.bob.id);
    expect(
      tuesday.desks.find((d: { desk_id: number }) => d.desk_id === desks.bob.id)
        .you_can_book,
    ).toBe(false);
  });

  test("book_desk follows the app's rules", async ({ request, db }) => {
    let token = await db.addMcpToken("alice");

    let ahead = await callTool(request, token, "book_desk", {
      desk_id: desks.bob.id,
      dates: [iso("tuesday")],
    });
    expect(ahead.isError).toBe(true);
    expect(ahead.content[0].text).toContain("Only the person assigned");

    let own = await callTool(request, token, "book_desk", {
      dates: [iso("wednesday"), iso("friday", 1)],
    });
    expect(own.structuredContent.booked).toEqual([
      expect.objectContaining({ date: iso("wednesday"), label: "1.1.1" }),
      expect.objectContaining({ date: iso("friday", 1), weekday: "Friday" }),
    ]);
    expect(await db.reservation(desks.alice.id, "friday", 1)).toBeTruthy();

    let log = await db.mcpAuditLog("alice");
    expect(log.map((entry) => [entry.tool, entry.ok])).toEqual([
      ["book_desk", false],
      ["book_desk", true],
    ]);
  });

  test("cancel_bookings only removes the caller's own", async ({
    request,
    db,
  }) => {
    await db.addReservation({
      user: "alice",
      deskId: desks.alice.id,
      day: "tuesday",
    });
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "tuesday",
    });
    let token = await db.addMcpToken("alice");

    let { structuredContent } = await callTool(
      request,
      token,
      "cancel_bookings",
      {
        bookings: [
          { desk_id: desks.alice.id, date: iso("tuesday") },
          { desk_id: desks.bob.id, date: iso("tuesday") },
        ],
      },
    );

    expect(structuredContent.removed).toEqual([
      { desk_id: desks.alice.id, date: iso("tuesday"), weekday: "Tuesday" },
    ]);
    expect(structuredContent.not_found).toEqual([
      { desk_id: desks.bob.id, date: iso("tuesday") },
    ]);
    expect(await db.reservation(desks.alice.id, "tuesday")).toBeUndefined();
    expect(await db.reservation(desks.bob.id, "tuesday")).toBeTruthy();
  });

  test("refused changes count toward the hourly limit", async ({
    request,
    db,
  }) => {
    let token = await db.addMcpToken("alice");
    await db.addMcpChanges("alice", 29);

    // Bob's desk on a day he booked: refused, but counted.
    let refused = await callTool(request, token, "cancel_bookings", {
      bookings: [{ desk_id: desks.bob.id, date: iso("tuesday") }],
    });
    expect(refused.structuredContent.not_found).toHaveLength(1);

    let result = await callTool(request, token, "book_desk", {
      dates: [iso("tuesday")],
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Too many changes");
    // Over the limit leaves no entry, so the log can't be flooded.
    expect(await db.mcpAuditLog("alice")).toHaveLength(30);
  });

  test("changes stop at the hourly limit", async ({ request, db }) => {
    let token = await db.addMcpToken("alice");
    await db.addMcpChanges("alice", 30);

    let result = await callTool(request, token, "book_desk", {
      dates: [iso("tuesday")],
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Too many changes");
    expect(await db.reservation(desks.alice.id, "tuesday")).toBeUndefined();
  });
});

test.describe("admin tools", () => {
  test("are not listed without the admin scope, even for an Admin", async ({
    request,
    db,
  }) => {
    let token = await db.addMcpToken("admin");
    let { tools } = await rpc(request, token, "tools/list");

    expect(
      tools.filter((tool: { name: string }) => tool.name.startsWith("admin_")),
    ).toEqual([]);
  });

  test("refuse someone who is no longer an Admin", async ({ request, db }) => {
    let token = await db.addMcpToken("admin", "desks admin");
    await db.setRole("admin", "user");

    let people = await callTool(request, token, "admin_list_people");
    expect(people.isError).toBe(true);
    expect(people.content[0].text).toContain("not an Admin");

    let moved = await callTool(request, token, "admin_unassign_desk", {
      desk_id: desks.bob.id,
    });
    expect(moved.isError).toBe(true);
    expect((await db.desk(desks.bob.id))?.userId).toBe(users.bob.id);
  });

  test("move desks and cancel someone's booking, as the Admin tab does", async ({
    request,
    db,
  }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "monday",
    });
    let token = await db.addMcpToken("admin", "desks admin");

    let { tools } = await rpc(request, token, "tools/list");
    let byName = Object.fromEntries(
      tools.map((tool: { name: string }) => [tool.name, tool]),
    );
    expect(byName.admin_list_people.annotations.readOnlyHint).toBe(true);
    expect(byName.admin_cancel_booking.annotations.destructiveHint).toBe(true);

    let { structuredContent: people } = await callTool(
      request,
      token,
      "admin_list_people",
    );
    expect(people.people).toContainEqual(
      expect.objectContaining({
        user_id: users.bob.id,
        name: "Bob Berg",
        desk: { desk_id: desks.bob.id, label: expect.any(String) },
      }),
    );

    // An Admin with the scope sees who booked, by user ID.
    let { structuredContent: today } = await callTool(
      request,
      token,
      "list_desks",
    );
    let bobs = today.desks.find(
      (d: { desk_id: number }) => d.desk_id === desks.bob.id,
    );
    expect(bobs.booked_by).toEqual([
      { name: "Bob Berg", is_you: false, user_id: users.bob.id },
    ]);

    let cancelled = await callTool(request, token, "admin_cancel_booking", {
      desk_id: desks.bob.id,
      date: iso("monday"),
      // As typed: IDs are stored lowercase.
      user_id: users.bob.id.toUpperCase(),
    });
    expect(cancelled.structuredContent.message).toBe("Booking cancelled");
    expect(await db.reservation(desks.bob.id, "monday")).toBeUndefined();

    let assigned = await callTool(request, token, "admin_assign_desk", {
      desk_id: desks.unclaimed.id,
      user_id: users.bob.id,
    });
    expect(assigned.isError).toBeFalsy();
    expect((await db.desk(desks.unclaimed.id))?.userId).toBe(users.bob.id);
    expect((await db.desk(desks.bob.id))?.userId).toBeNull();

    let log = await db.mcpAuditLog("admin");
    expect(log.map((entry) => [entry.tool, entry.ok])).toEqual([
      ["admin_cancel_booking", true],
      ["admin_assign_desk", true],
    ]);
  });

  test("user IDs stay hidden from everyone else", async ({ request, db }) => {
    await db.addReservation({
      user: "bob",
      deskId: desks.bob.id,
      day: "monday",
    });
    let token = await db.addMcpToken("admin");

    let { structuredContent: today } = await callTool(
      request,
      token,
      "list_desks",
    );
    let bobs = today.desks.find(
      (d: { desk_id: number }) => d.desk_id === desks.bob.id,
    );
    expect(bobs.owner_id).toBeUndefined();
    expect(bobs.booked_by[0].user_id).toBeUndefined();
  });
});
