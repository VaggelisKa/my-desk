import { authServerMetadata, oauthHeaders } from "~/lib/mcp/oauth.server";
import type { Route } from "./+types/[.well-known].oauth-authorization-server";

// OAuth discovery (RFC 8414): how assistants find the sign-in endpoints.
export function loader({ url }: Route.LoaderArgs) {
  return Response.json(authServerMetadata(url.origin), {
    headers: oauthHeaders,
  });
}
