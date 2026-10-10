import {
  createMcpHandler,
  isLegacyRequest,
  WebStandardStreamableHTTPServerTransport,
  type AuthInfo,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { oauthHeaders, SCOPE, verifyAccessToken } from "~/lib/mcp/oauth.server";
import { createDeskServer } from "~/lib/mcp/tools.server";
import type { Route } from "./+types/mcp";

// The MCP endpoint Claude and ChatGPT connect to: streamable HTTP, stateless
// (each request stands alone, as Vercel functions do), answering in plain
// JSON. Serves today's 2025 protocol and the 2026-07-28 revision alike.

function serverFor({ authInfo }: Pick<McpRequestContext, "authInfo">) {
  return createDeskServer({
    userId: String(authInfo?.extra?.userId),
    clientId: authInfo?.clientId ?? "",
  });
}

let modern = createMcpHandler(serverFor, {
  legacy: "reject",
  responseMode: "json",
  onerror: console.error,
});

/**
 * 2025-era requests (what Claude and ChatGPT send today), one fresh server
 * each, answered as JSON rather than an event stream. GET would open a stream
 * that never ends and DELETE ends a session there is none of: stateless
 * servers answer both with 405, as the SDK's own fallback does.
 */
async function legacy(request: Request, authInfo: AuthInfo) {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "POST" },
    });
  }

  let server = serverFor({ authInfo });
  let transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);

  try {
    return await transport.handleRequest(request, { authInfo });
  } finally {
    await server.close();
  }
}

/**
 * Without a valid token: 401, pointing at the document that says where to
 * sign in (RFC 9728), which is how clients start the OAuth flow.
 */
function unauthorized(origin: string) {
  return Response.json(
    { error: "invalid_token", error_description: "Sign in to MyDesk first." },
    {
      status: 401,
      headers: {
        ...oauthHeaders,
        "Access-Control-Expose-Headers": "WWW-Authenticate",
        "WWW-Authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp", scope="${SCOPE}"`,
      },
    },
  );
}

async function serve(request: Request) {
  let origin = new URL(request.url).origin;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...oauthHeaders,
        "Access-Control-Allow-Headers":
          "Authorization, Content-Type, Mcp-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      },
    });
  }

  let header = request.headers.get("Authorization");
  let token = header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
  let grant = token ? await verifyAccessToken(token) : null;

  if (!token || !grant) {
    return unauthorized(origin);
  }

  let authInfo: AuthInfo = {
    token,
    clientId: grant.clientId,
    scopes: [SCOPE],
    expiresAt: Math.floor(grant.expiresAt / 1000),
    resource: new URL(`${origin}/mcp`),
    extra: { userId: grant.userId },
  };
  let response = (await isLegacyRequest(request))
    ? await legacy(request, authInfo)
    : await modern.fetch(request, { authInfo });

  let headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function loader({ request }: Route.LoaderArgs) {
  return serve(request);
}

export function action({ request }: Route.ActionArgs) {
  return serve(request);
}
