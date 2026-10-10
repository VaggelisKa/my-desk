import {
  authenticateClient,
  OAuthFailure,
  oauthHeaders,
  revokeToken,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/oauth.revoke";

// Token revocation (RFC 7009): an assistant disconnecting ends its access.
export async function action({ request }: Route.ActionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: oauthHeaders });
  }
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
