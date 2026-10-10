import {
  authenticateClient,
  OAuthFailure,
  oauthHeaders,
  revokeToken,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/oauth.revoke";

// React Router sends OPTIONS (CORS preflight) and GET to the loader.
export function loader({ request }: Route.LoaderArgs) {
  return new Response(null, {
    status: request.method === "OPTIONS" ? 204 : 405,
    headers: { ...oauthHeaders, Allow: "POST, OPTIONS" },
  });
}

// Token revocation (RFC 7009): an assistant disconnecting ends its access.
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: oauthHeaders });
  }

  try {
    let form = await request.formData().catch(() => {
      throw new OAuthFailure("invalid_request", "Send a form-encoded body.");
    });
    let client = await authenticateClient(request, form);
    await revokeToken(client.id, form.get("token"));

    return new Response(null, { status: 200, headers: oauthHeaders });
  } catch (error) {
    if (error instanceof OAuthFailure) return error.toResponse();
    throw error;
  }
}
