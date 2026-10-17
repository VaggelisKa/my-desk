import { and, count, eq, gt } from "drizzle-orm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "~/lib/db/drizzle.server";
import { oauthClients, oauthCodes, oauthTokens } from "~/lib/db/schema";

// A small OAuth 2.1 authorization server for the MCP endpoint, the way Claude
// and ChatGPT connect to remote MCP servers: they register themselves
// (dynamic client registration), send the person to /oauth/authorize to sign
// in and allow access, then trade the code for tokens (PKCE, S256 only).
// Every token names one person; tools take the caller from it, never from
// their arguments. Only hashes of secrets, codes and tokens are stored.

/** What every token allows: what a signed-in person can do with desks. */
export const SCOPE = "desks";

/**
 * What an Admin can add on the Allow page: the Admin tab's actions. It is
 * only ever granted to someone who is an Admin, and the tools check the role
 * again on each call.
 */
export const ADMIN_SCOPE = "admin";

const CODE_TTL = 5 * 60 * 1000;
export const ACCESS_TTL = 60 * 60 * 1000;
/** How long a connection lasts without use: each refresh starts it again. */
const REFRESH_TTL = 90 * 24 * 60 * 60 * 1000;
/** How soon after its use a refresh token may come back without ending the connection. */
const REUSE_GRACE = 30 * 1000;

/**
 * Where an assistant may send people back after they allowed it. Any app can
 * connect (Claude, ChatGPT, Grok, Cursor...): each registers its own redirect
 * URIs and gets codes only at those, exact match, and the Allow page names
 * where the code goes. So any https address works, plain http only on this
 * machine (Claude Code, the MCP Inspector), and for desktop apps their own
 * scheme: a reverse domain name (com.example.app:/callback, RFC 8252) or one
 * of the coding apps below. Other schemes can open installers, Office files
 * or settings on the person's computer, so they are refused.
 */
const LOOPBACK_HOSTS = ["localhost", "127.0.0.1", "[::1]"];
const APP_SCHEMES = ["cursor:", "vscode:", "vscode-insiders:", "windsurf:"];
const REVERSE_DOMAIN = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+:$/;
/** Reverse domain names that are the system's own, not an app's. */
const SYSTEM_SCHEMES = /^(x-apple|com\.apple|ms-|microsoft)/;
const MAX_REDIRECT_LENGTH = 2048;

/**
 * New assistants that may register in an hour, all together. Registering
 * needs no account, so this keeps a script from filling the database;
 * Claude and ChatGPT register once per person connecting.
 */
const REGISTRATIONS_PER_HOUR = 100;

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
    scopes_supported: [SCOPE, ADMIN_SCOPE],
  };
}

export function protectedResourceMetadata(origin: string) {
  return {
    resource: resourceUrl(origin),
    authorization_servers: [origin],
    scopes_supported: [SCOPE, ADMIN_SCOPE],
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
  if (value.length > MAX_REDIRECT_LENGTH) return false;
  if (url.hash || url.username || url.password) return false;

  if (url.protocol === "https:" || url.protocol === "http:") {
    return isWebRedirect(url);
  }
  return (
    APP_SCHEMES.includes(url.protocol) ||
    (REVERSE_DOMAIN.test(url.protocol) && !SYSTEM_SCHEMES.test(url.protocol))
  );
}

/** An https page, or http on this machine. */
function isWebRedirect(url: URL) {
  return (
    url.protocol === "https:" ||
    (url.protocol === "http:" && LOOPBACK_HOSTS.includes(url.hostname))
  );
}

type Registration = {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
};

/** Dynamic client registration (RFC 7591), for the redirect URIs above. */
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
      "Redirect URIs must be https, http on localhost, or an app's own reverse-domain scheme.",
    );
  }

  let [{ recent }] = await db
    .select({ recent: count() })
    .from(oauthClients)
    .where(gt(oauthClients.createdAt, new Date(Date.now() - 60 * 60 * 1000)));
  if (recent >= REGISTRATIONS_PER_HOUR) {
    throw new OAuthFailure(
      "temporarily_unavailable",
      "Too many registrations. Try again later.",
      429,
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
      try {
        id = decodeURIComponent(decoded.slice(0, colon));
        secret = decodeURIComponent(decoded.slice(colon + 1));
      } catch {
        throw new OAuthFailure("invalid_client", "Malformed credentials.", 401);
      }
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
  scope: string;
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
  scope: string;
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
    scope: grant.scope,
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

  // Only the client it was issued to can use (and so use up) a code.
  let [grant] = await db
    .delete(oauthCodes)
    .where(
      and(
        eq(oauthCodes.codeHash, hash(code)),
        eq(oauthCodes.clientId, clientId),
      ),
    )
    .returning();

  if (
    !grant ||
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
    scope: grant.scope,
  });
}

/**
 * A new token pair for a refresh token, which is used up (rotation). A used
 * one coming back means two parties hold it, one of them likely a thief, so
 * the whole connection ends (OAuth 2.1, section 4.3.1). Not within
 * `REUSE_GRACE` of its use, though: that is the assistant retrying, or two
 * of its requests crossing, and ending the connection would only lock out
 * the person.
 */
export async function refreshTokens(clientId: string, refreshToken: unknown) {
  if (typeof refreshToken !== "string" || !refreshToken) {
    throw new OAuthFailure("invalid_request", "refresh_token is missing.");
  }

  let tokenHash = hash(refreshToken);
  let now = Date.now();
  let invalid = new OAuthFailure(
    "invalid_grant",
    "The refresh token is invalid or expired.",
  );

  // Marked used in one statement, so of two refreshes at once only one wins.
  // A used token keeps a full lifetime from its use, which is how long a
  // replay is still spotted, and from which its time of use is read back.
  let [old] = await db
    .update(oauthTokens)
    .set({ kind: "used", expiresAt: now + REFRESH_TTL })
    .where(
      and(
        eq(oauthTokens.tokenHash, tokenHash),
        eq(oauthTokens.kind, "refresh"),
        eq(oauthTokens.clientId, clientId),
        gt(oauthTokens.expiresAt, now),
      ),
    )
    .returning();

  if (!old) {
    let used = await db.query.oauthTokens.findFirst({
      where: and(
        eq(oauthTokens.tokenHash, tokenHash),
        eq(oauthTokens.kind, "used"),
        eq(oauthTokens.clientId, clientId),
      ),
      columns: { grantId: true, expiresAt: true },
    });
    let usedAt = used ? used.expiresAt - REFRESH_TTL : now;
    if (used && now - usedAt > REUSE_GRACE) {
      await db.delete(oauthTokens).where(eq(oauthTokens.grantId, used.grantId));
    }
    throw invalid;
  }

  // The connection's earlier access token goes with its refresh token.
  await db
    .delete(oauthTokens)
    .where(
      and(eq(oauthTokens.grantId, old.grantId), eq(oauthTokens.kind, "access")),
    );

  return issueTokens({
    grantId: old.grantId,
    clientId,
    userId: old.userId,
    scope: old.scope,
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
    ? {
        userId: row.userId,
        clientId: row.clientId,
        expiresAt: row.expiresAt,
        scopes: row.scope.split(" ").filter(Boolean),
      }
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

  // Mistakes go back before anyone pressed anything, so only to a web page:
  // an app's own scheme would launch that app straight from a link.
  let refuse = (error: string, description: string) =>
    isWebRedirect(new URL(redirectUri))
      ? ({
          kind: "refuse",
          to: withParams(redirectUri, {
            error,
            error_description: description,
            state,
            iss: url.origin,
          }),
        } as const)
      : ({ kind: "fatal", message: description } as const);

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
    /** Where the code goes, shown on the Allow page. */
    returnsTo: returnsTo(redirectUri),
    redirectUri,
    codeChallenge,
    state,
  } as const;
}

/** Where a redirect URI goes, for the Allow page: the site, or all of an app's URI. */
function returnsTo(redirectUri: string) {
  let url = new URL(redirectUri);
  return isWebRedirect(url) ? url.host : redirectUri;
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
