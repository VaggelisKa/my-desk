import {
  OAuthFailure,
  oauthHeaders,
  registerClient,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/oauth.register";

/** Ten redirect URIs at their longest, with room for the other fields. */
const MAX_BODY = 32 * 1024;

/** The body as text, refused past `MAX_BODY` bytes without reading on. */
async function readCapped(request: Request) {
  let reader = request.body?.getReader();
  let chunks: Uint8Array[] = [];
  let size = 0;
  while (reader) {
    let { done, value } = await reader.read();
    if (done || !value) break;
    size += value.byteLength;
    if (size > MAX_BODY) {
      await reader.cancel();
      throw new OAuthFailure(
        "invalid_client_metadata",
        "The body is too long.",
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

// React Router sends OPTIONS (CORS preflight) and GET to the loader.
export function loader({ request }: Route.LoaderArgs) {
  return new Response(null, {
    status: request.method === "OPTIONS" ? 204 : 405,
    headers: { ...oauthHeaders, Allow: "POST, OPTIONS" },
  });
}

// Dynamic client registration (RFC 7591): Claude and ChatGPT register
// themselves here the first time someone adds MyDesk as a connector.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: oauthHeaders });
  }

  try {
    let body = await readCapped(request);
    let metadata = (() => {
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new OAuthFailure(
          "invalid_client_metadata",
          "The body must be JSON.",
        );
      }
    })();
    if (typeof metadata !== "object" || metadata === null) {
      throw new OAuthFailure(
        "invalid_client_metadata",
        "The body must be a JSON object.",
      );
    }

    return Response.json(await registerClient(metadata), {
      status: 201,
      headers: oauthHeaders,
    });
  } catch (error) {
    if (error instanceof OAuthFailure) return error.toResponse();
    throw error;
  }
}
