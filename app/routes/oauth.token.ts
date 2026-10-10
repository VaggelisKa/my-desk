import {
  authenticateClient,
  exchangeCode,
  OAuthFailure,
  oauthHeaders,
  refreshTokens,
} from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/oauth.token";

// Trades the code from the Allow page, or a refresh token, for tokens.
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
    let grantType = form.get("grant_type");

    let tokens =
      grantType === "authorization_code"
        ? await exchangeCode(client.id, {
            code: form.get("code"),
            redirectUri: form.get("redirect_uri"),
            codeVerifier: form.get("code_verifier"),
          })
        : grantType === "refresh_token"
          ? await refreshTokens(client.id, form.get("refresh_token"))
          : null;

    if (!tokens) {
      throw new OAuthFailure(
        "unsupported_grant_type",
        "Use authorization_code or refresh_token.",
      );
    }

    return Response.json(tokens, { headers: oauthHeaders });
  } catch (error) {
    if (error instanceof OAuthFailure) return error.toResponse();
    throw error;
  }
}
