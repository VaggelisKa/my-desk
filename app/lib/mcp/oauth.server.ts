import { and, eq, gt } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "~/lib/db/drizzle.server";
import { oauthClients, oauthCodes, oauthTokens } from "~/lib/db/schema";

// A small OAuth 2.1 authorization server for the MCP endpoint, the way Claude
// and ChatGPT connect to remote MCP servers: they register themselves
// (dynamic client registration), send the person to /oauth/authorize to sign
// in and allow access, then trade the code for tokens (PKCE, S256 only).
// Every token names one person; tools take the caller from it, never from
// their arguments. Only hashes of secrets, codes and tokens are stored.

/** The one thing a token allows: what a signed-in person can do with desks. */
export const SCOPE = "desks";

const CODE_TTL = 5 * 60 * 1000;
export const ACCESS_TTL = 60 * 60 * 1000;
const REFRESH_TTL = 30 * 24 * 60 * 60 * 1000;

/**
 * Where an assistant may send people back after they allowed it: Claude and
 * ChatGPT, plus localhost for Claude Code and the MCP Inspector. Keeps the
 * Allow page from handing a code to any other site. `MCP_REDIRECT_HOSTS`
 * (comma separated) adds more.
 */
const REDIRECT_HOSTS = ["claude.ai", "claude.com", "chatgpt.com"];
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

export class OAuthFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }

  toResponse() {
    return Response.json(
      { error: this.code, error_description: this.message },
      { status: this.status, headers: oauthHeaders },
    );
  }
}

/** Token and registration answers: never cached, callable from browsers. */
export const oauthHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function newSecret() {
  return randomBytes(32).toString("base64url");
}

/** The MCP endpoint's URL, which tokens are issued for (RFC 8707). */
export function resourceUrl(origin: string) {
  return `${origin}/mcp`;
}

export function authServerMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/oauth/token`,
    registration_endpoint: `${origin}/oauth/register`,
    revocation_endpoint: `${origin}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    revocation_endpoint_auth_methods_supported: [
      "none",
      "client_secret_post",
      "client_secret_basic",
    ],
    scopes_supported: [SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "MyDesk",
  };
}

export function isAllowedRedirect(value: unknown) {
  if (typeof value !== "string") return false;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.hash || url.username || url.password) return false;

  if (LOOPBACK_HOSTS.includes(url.hostname)) {
    return url.protocol === "http:" || url.protocol === "https:";
  }

  let extra = (process.env.MCP_REDIRECT_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  return (
    url.protocol === "https:" &&
    [...REDIRECT_HOSTS, ...extra].includes(url.hostname)
  );
}

type Registration = {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
};

/** Dynamic client registration (RFC 7591), for the redirect hosts above only. */
export async function registerClient(metadata: Registration) {
  let redirectUris = metadata.redirect_uris;

  if (
    !Array.isArray(redirectUris) ||
    redirectUris.length === 0 ||
    redirectUris.length > 10
  ) {
    throw new OAuthFailure(
      "invalid_redirect_uri",
      "Register between 1 and 10 redirect URIs.",
    );
  }
  if (!redirectUris.every(isAllowedRedirect)) {
    throw new OAuthFailure(
      "invalid_redirect_uri",
      "Only Claude, ChatGPT and localhost redirect URIs are allowed.",
    );
  }

  let method = metadata.token_endpoint_auth_method ?? "client_secret_basic";
  if (
    method !== "none" &&
    method !== "client_secret_post" &&
    method !== "client_secret_basic"
  ) {
    throw new OAuthFailure(
      "invalid_client_metadata",
      "Unsupported token_endpoint_auth_method.",
    );
  }

  let grantTypes = metadata.grant_types ?? ["authorization_code"];
  if (
    !Array.isArray(grantTypes) ||
    !grantTypes.every(
      (type) => type === "authorization_code" || type === "refresh_token",
    )
  ) {
    throw new OAuthFailure(
      "invalid_client_metadata",
      "Only authorization_code and refresh_token grants are supported.",
    );
  }

  let responseTypes = metadata.response_types ?? ["code"];
  if (
    !Array.isArray(responseTypes) ||
    !responseTypes.every((type) => type === "code")
  ) {
    throw new OAuthFailure(
      "invalid_client_metadata",
      "Only the code response type is supported.",
    );
  }

  let name =
    typeof metadata.client_name === "string" && metadata.client_name.trim()
      ? metadata.client_name.trim().slice(0, 80)
      : "An AI assistant";
  let id = randomBytes(16).toString("hex");
  let secret = method === "none" ? null : newSecret();
  let createdAt = Date.now();

  await db.insert(oauthClients).values({
    id,
    name,
    redirectUris: JSON.stringify(redirectUris),
    secretHash: secret && hash(secret),
    createdAt: new Date(createdAt),
  });

  return {
    client_id: id,
    client_id_issued_at: Math.floor(createdAt / 1000),
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    client_name: name,
    redirect_uris: redirectUris as string[],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: method,
  };
}

export async function findClient(clientId: string) {
  let client = await db.query.oauthClients.findFirst({
    where: eq(oauthClients.id, clientId),
  });

  return client
    ? {
        id: client.id,
        name: client.name,
        redirectUris: JSON.parse(client.redirectUris) as string[],
        secretHash: client.secretHash,
      }
    : null;
}

/**
 * The client a token or revocation request comes from: `client_id` in the
 * form, or HTTP Basic. Clients registered with a secret must send it.
 */
export async function authenticateClient(request: Request, form: FormData) {
  let id = form.get("client_id");
  let secret = form.get("client_secret");
  let basic = request.headers.get("Authorization");

  if (basic?.startsWith("Basic ")) {
    let decoded = Buffer.from(basic.slice(6), "base64").toString("utf8");
    let colon = decoded.indexOf(":");
    if (colon !== -1) {
      id = decodeURIComponent(decoded.slice(0, colon));
      secret = decodeURIComponent(decoded.slice(colon + 1));
    }
  }

  let client = typeof id === "string" && id ? await findClient(id) : null;

  if (!client) {
    throw new OAuthFailure("invalid_client", "Unknown client.", 401);
  }

  if (client.secretHash) {
    let given = Buffer.from(
      hash(typeof secret === "string" ? secret : ""),
      "hex",
    );
    if (!timingSafeEqual(given, Buffer.from(client.secretHash, "hex"))) {
      throw new OAuthFailure("invalid_client", "Wrong client secret.", 401);
    }
  }

  return client;
}

/** A code for the person who just pressed Allow, for `clientId` only. */
export async function createCode(grant: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
}) {
  let code = newSecret();

  await db.insert(oauthCodes).values({
    codeHash: hash(code),
    ...grant,
    expiresAt: Date.now() + CODE_TTL,
  });

  return code;
}

function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function issueTokens(grant: {
  grantId: string;
  clientId: string;
  userId: string;
}) {
  let access = newSecret();
  let refresh = newSecret();
  let now = Date.now();

  await db.insert(oauthTokens).values([
    {
      tokenHash: hash(access),
      kind: "access",
      ...grant,
      expiresAt: now + ACCESS_TTL,
    },
    {
      tokenHash: hash(refresh),
      kind: "refresh",
      ...grant,
      expiresAt: now + REFRESH_TTL,
    },
  ]);

  return {
    access_token: access,
    token_type: "Bearer",
    expires_in: ACCESS_TTL / 1000,
    refresh_token: refresh,
    scope: SCOPE,
  };
}

/** Trades a code for tokens. Each code works once, deleted as it is read. */
export async function exchangeCode(
  clientId: string,
  form: { code: unknown; redirectUri: unknown; codeVerifier: unknown },
) {
  let { code, redirectUri, codeVerifier } = form;

  if (typeof code !== "string" || !code) {
    throw new OAuthFailure("invalid_request", "code is missing.");
  }
  if (
    typeof codeVerifier !== "string" ||
    !/^[A-Za-z0-9\-._~]{43,128}$/.test(codeVerifier)
  ) {
    throw new OAuthFailure("invalid_request", "code_verifier is invalid.");
  }

  let [grant] = await db
    .delete(oauthCodes)
    .where(eq(oauthCodes.codeHash, hash(code)))
    .returning();

  if (
    !grant ||
    grant.clientId !== clientId ||
    grant.expiresAt <= Date.now() ||
    // Required when the authorization request carried one, and it always does.
    grant.redirectUri !== redirectUri ||
    grant.codeChallenge !== pkceChallenge(codeVerifier)
  ) {
    throw new OAuthFailure("invalid_grant", "The code is invalid or expired.");
  }

  return issueTokens({
    grantId: randomBytes(16).toString("hex"),
    clientId,
    userId: grant.userId,
  });
}

/** A new token pair for a refresh token, which is used up (rotation). */
export async function refreshTokens(clientId: string, refreshToken: unknown) {
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new OAuthFailure("invalid_request", "refresh_token is missing.");
  }

  let [old] = await db
    .delete(oauthTokens)
    .where(
      and(
        eq(oauthTokens.tokenHash, hash(refreshToken)),
        eq(oauthTokens.kind, "refresh"),
      ),
    )
    .returning();

  if (!old || old.clientId !== clientId || old.expiresAt <= Date.now()) {
    throw new OAuthFailure(
      "invalid_grant",
      "The refresh token is invalid or expired.",
    );
  }

  return issueTokens({
    grantId: old.grantId,
    clientId,
    userId: old.userId,
  });
}

/** Who an access token belongs to, or null when it is unknown or expired. */
export async function verifyAccessToken(token: string) {
  let row = await db.query.oauthTokens.findFirst({
    where: and(
      eq(oauthTokens.tokenHash, hash(token)),
      eq(oauthTokens.kind, "access"),
      gt(oauthTokens.expiresAt, Date.now()),
    ),
  });

  return row
    ? { userId: row.userId, clientId: row.clientId, expiresAt: row.expiresAt }
    : null;
}

/**
 * Revokes the connection a token belongs to (RFC 7009): its access and
 * refresh tokens both. Unknown tokens are fine, as the RFC asks.
 */
export async function revokeToken(clientId: string, token: unknown) {
  if (typeof token !== "string" || !token) return;

  let row = await db.query.oauthTokens.findFirst({
    where: eq(oauthTokens.tokenHash, hash(token)),
    columns: { grantId: true, clientId: true },
  });

  if (row && row.clientId === clientId) {
    await db.delete(oauthTokens).where(eq(oauthTokens.grantId, row.grantId));
  }
}

/**
 * Reads an authorization request (`/oauth/authorize?...`). A request with an
 * unknown client or redirect URI is never sent anywhere (`fatal`); other
 * mistakes go back to the client as an OAuth error (`refuse`).
 */
export async function readAuthorizeRequest(url: URL) {
  let param = (name: string) => url.searchParams.get(name) ?? "";
  let clientId = param("client_id");
  let redirectUri = param("redirect_uri");
  let state = url.searchParams.get("state");
  let client = clientId ? await findClient(clientId) : null;

  if (!client) {
    return {
      kind: "fatal",
      message: "This assistant is not registered.",
    } as const;
  }
  if (!client.redirectUris.includes(redirectUri)) {
    return {
      kind: "fatal",
      message: "This assistant asked to return somewhere it did not register.",
    } as const;
  }

  let refuse = (error: string, description: string) =>
    ({
      kind: "refuse",
      to: withParams(redirectUri, {
        error,
        error_description: description,
        state,
        iss: url.origin,
      }),
    }) as const;

  if (param("response_type") !== "code") {
    return refuse("unsupported_response_type", "Only code is supported.");
  }
  let codeChallenge = param("code_challenge");
  if (
    param("code_challenge_method") !== "S256" ||
    !/^[A-Za-z0-9\-_]{43}$/.test(codeChallenge)
  ) {
    return refuse("invalid_request", "PKCE with S256 is required.");
  }
  let resource = url.searchParams.get("resource");
  if (
    resource !== null &&
    resource.replace(/\/$/, "") !== resourceUrl(url.origin)
  ) {
    return refuse("invalid_target", "Tokens are only issued for /mcp.");
  }

  return {
    kind: "ok",
    client: { id: client.id, name: client.name },
    redirectUri,
    codeChallenge,
    state,
  } as const;
}

/** `base` with the given query parameters added, skipping null ones. */
export function withParams(
  base: string,
  params: Record<string, string | null>,
) {
  let url = new URL(base);
  for (let [key, value] of Object.entries(params)) {
    if (value !== null) url.searchParams.set(key, value);
  }
  return url.toString();
}
