import {
  OAuthFailure,
  oauthHeaders,
  registerClient,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/oauth.register";

// Dynamic client registration (RFC 7591): Claude and ChatGPT register
// themselves here the first time someone adds MyDesk as a connector.
export async function action({ request }: Route.ActionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: oauthHeaders });
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: oauthHeaders });
  }

  try {
    let metadata = await request.json().catch(() => {
      throw new OAuthFailure(
        "invalid_client_metadata",
        "The body must be JSON.",
      );
    });
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
